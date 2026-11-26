import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from constants import API_KEY_PREFIX
from database import get_db
from models import UserModel, ApiKeyModel

logger = logging.getLogger("kultura.services.auth")

security_bearer = HTTPBearer(auto_error=False)


def generate_api_key() -> Tuple[str, str, str]:
    """Generates a secure user API key, its display prefix, and sha256 hash."""
    random_part = secrets.token_hex(20)
    raw_key = f"{API_KEY_PREFIX}{random_part}"
    key_prefix = raw_key[:14]
    hashed_key = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()
    return raw_key, key_prefix, hashed_key


def hash_api_key(raw_key: str) -> str:
    """Computes SHA-256 hash of an API key for constant-time DB lookup."""
    return hashlib.sha256(raw_key.strip().encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Securely hashes a password using bcrypt with cost factor 12."""
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against a bcrypt hash in constant time."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception as e:
        logger.warning(f"Password verification error: {e}")
        return False


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """Creates a signed JWT access token with expiration."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": int(expire.timestamp()), "iat": int(now.timestamp())})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Decodes and validates a signed JWT access token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        logger.debug("JWT token expired")
        return None
    except (jwt.PyJWTError, Exception) as e:
        logger.debug(f"JWT decode error: {e}")
        return None


async def extract_token_from_request(
    request: Request,
    auth_header: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Optional[str]:
    """Extracts JWT token or API Key from Authorization header, x-api-key, or cookie."""
    request.state.from_cookie = False

    # Check x-api-key header first
    api_key_header = request.headers.get("x-api-key")
    if api_key_header:
        return api_key_header.strip()

    if auth_header and auth_header.credentials:
        return auth_header.credentials.strip()

    # Check Cookie fallback
    cookie_token = request.cookies.get("kultura_token")
    if cookie_token:
        request.state.from_cookie = True
        return cookie_token.strip()

    # Check query param fallback
    query_token = request.query_params.get("token") or request.query_params.get("api_key")
    if query_token:
        return query_token.strip()

    return None


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(extract_token_from_request),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    """
    Strict authentication dependency.
    Raises 401 Unauthorized if token is missing, invalid, or user inactive.
    """
    from_cookie = getattr(request.state, "from_cookie", False)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in or provide an API key.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. User API Key authentication (for Coding Agents: Cursor, Claude Code, Cline, Continue, Aider)
    if token.startswith(API_KEY_PREFIX):
        hashed = hash_api_key(token)
        stmt = select(ApiKeyModel).where(ApiKeyModel.hashed_key == hashed, ApiKeyModel.is_active == True)
        res = await db.execute(stmt)
        api_key_record = res.scalar_one_or_none()
        if not api_key_record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or revoked API key.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        api_key_record.last_used_at = datetime.utcnow()
        await db.commit()

        user_stmt = select(UserModel).where(UserModel.id == api_key_record.user_id)
        user_res = await db.execute(user_stmt)
        user = user_res.scalar_one_or_none()
        if not user or not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account associated with this API key is inactive or deleted.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return user

    # 2. JWT Access Token authentication (UI Sessions)
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: Optional[str] = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identity.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    stmt = select(UserModel).where(UserModel.id == user_id)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account does not exist or has been disabled.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # CSRF Protection: If request authenticated via HttpOnly cookie on a mutating method, verify X-CSRF-Token
    if from_cookie and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        # Login and Logout endpoints are exempt from CSRF bootstrap
        if not request.url.path.endswith("/login") and not request.url.path.endswith("/logout"):
            csrf_header = request.headers.get("x-csrf-token")
            csrf_cookie = request.cookies.get("kultura_csrf")
            if not csrf_header or not csrf_cookie or not secrets.compare_digest(csrf_header, csrf_cookie):
                logger.warning(f"CSRF violation on {request.method} {request.url.path} for user '{user.username}'")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="CSRF validation failed: Missing or invalid X-CSRF-Token header.",
                )

    return user


async def require_admin(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    """
    Strict authorization dependency.
    Ensures the authenticated user has 'admin' role.
    Raises 403 Forbidden otherwise.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Admin privileges required to perform this action.",
        )
    return current_user
