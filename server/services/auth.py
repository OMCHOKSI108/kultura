import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import UserModel

logger = logging.getLogger("kultura.services.auth")

security_bearer = HTTPBearer(auto_error=False)


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
    """Extracts JWT token from Authorization header or HTTP-only cookie."""
    if auth_header and auth_header.credentials:
        return auth_header.credentials
    # Check Cookie fallback
    cookie_token = request.cookies.get("kultura_token")
    if cookie_token:
        return cookie_token
    # Check query param fallback (e.g. for EventSource / SSE if needed)
    query_token = request.query_params.get("token")
    if query_token:
        return query_token
    return None


async def get_current_user(
    token: Optional[str] = Depends(extract_token_from_request),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    """
    Strict authentication dependency.
    Raises 401 Unauthorized if token is missing, invalid, or user inactive.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

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

    return user


async def get_optional_current_user(
    token: Optional[str] = Depends(extract_token_from_request),
    db: AsyncSession = Depends(get_db),
) -> Optional[UserModel]:
    """
    Soft authentication dependency.
    Returns authenticated user if valid token present, or None if anonymous.
    If anonymous and single-user fallback exists, resolves the admin user.
    """
    if not token:
        # Check if default admin account exists to associate sessions
        stmt = select(UserModel).where(UserModel.email == settings.ADMIN_ID)
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    try:
        return await get_current_user(token=token, db=db)
    except HTTPException:
        return None


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
