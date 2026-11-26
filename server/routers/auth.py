import logging
import secrets
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import UserModel, SessionModel, ApiKeyModel, RequestTraceModel
from schemas.auth_schemas import (
    LoginRequest,
    LoginResponse,
    CreateUserRequest,
    UpdatePasswordRequest,
    UpdateProfileRequest,
    ToggleUserStatusRequest,
    UserResponse,
)
from services.auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_admin,
)

logger = logging.getLogger("kultura.routers.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(
    req: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """
    Authenticate a user with username/userID or email and password.
    Returns signed JWT access token and sets secure HTTP-only cookie.
    """
    identifier = req.username_or_email.strip().lower()
    stmt = select(UserModel).where(
        (func.lower(UserModel.username) == identifier) | (func.lower(UserModel.email) == identifier)
    )
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username/email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive or has been revoked. Please contact your system administrator.",
        )

    # Count user's sessions & api keys
    session_count_stmt = select(func.count(SessionModel.id)).where(SessionModel.user_id == user.id)
    count_res = await db.execute(session_count_stmt)
    sessions_count = count_res.scalar() or 0

    key_count_stmt = select(func.count(ApiKeyModel.id)).where(ApiKeyModel.user_id == user.id, ApiKeyModel.is_active == True)
    key_res = await db.execute(key_count_stmt)
    api_keys_count = key_res.scalar() or 0

    token_payload = {
        "sub": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(token_payload)

    csrf_token = secrets.token_hex(32)

    # Set secure cookies with path="/"
    response.set_cookie(
        key="kultura_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    response.set_cookie(
        key="kultura_csrf",
        value=csrf_token,
        httponly=False,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )

    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        bio=user.bio,
        avatar_url=user.avatar_url,
        designation=user.designation,
        created_at=user.created_at,
        sessions_count=sessions_count,
        api_keys_count=api_keys_count,
    )

    logger.info(f"User '{user.username}' ({user.role}) logged in successfully.")
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_resp,
        csrf_token=csrf_token,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the currently authenticated user's profile and counts."""
    session_count_stmt = select(func.count(SessionModel.id)).where(SessionModel.user_id == current_user.id)
    count_res = await db.execute(session_count_stmt)
    sessions_count = count_res.scalar() or 0

    key_count_stmt = select(func.count(ApiKeyModel.id)).where(ApiKeyModel.user_id == current_user.id, ApiKeyModel.is_active == True)
    key_res = await db.execute(key_count_stmt)
    api_keys_count = key_res.scalar() or 0

    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        bio=current_user.bio,
        avatar_url=current_user.avatar_url,
        designation=current_user.designation,
        created_at=current_user.created_at,
        sessions_count=sessions_count,
        api_keys_count=api_keys_count,
    )


@router.patch("/me/profile", response_model=UserResponse)
async def update_my_profile(
    req: UpdateProfileRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Allows authenticated user to update their bio, profile picture, and designation."""
    if req.bio is not None:
        current_user.bio = req.bio.strip()
    if req.avatar_url is not None:
        current_user.avatar_url = req.avatar_url.strip()
    if req.designation is not None:
        current_user.designation = req.designation.strip()

    await db.commit()
    await db.refresh(current_user)

    session_count_stmt = select(func.count(SessionModel.id)).where(SessionModel.user_id == current_user.id)
    count_res = await db.execute(session_count_stmt)
    sessions_count = count_res.scalar() or 0

    key_count_stmt = select(func.count(ApiKeyModel.id)).where(ApiKeyModel.user_id == current_user.id, ApiKeyModel.is_active == True)
    key_res = await db.execute(key_count_stmt)
    api_keys_count = key_res.scalar() or 0

    logger.info(f"User '{current_user.username}' updated profile.")
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        bio=current_user.bio,
        avatar_url=current_user.avatar_url,
        designation=current_user.designation,
        created_at=current_user.created_at,
        sessions_count=sessions_count,
        api_keys_count=api_keys_count,
    )


@router.get("/me/usage")
async def get_my_usage(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the authenticated user's daily and monthly usage stats."""
    now = datetime.utcnow()
    day_ago = now - timedelta(days=1)
    month_ago = now - timedelta(days=30)

    # Daily usage
    day_stmt = select(
        func.count(RequestTraceModel.id).label("requests"),
        func.coalesce(func.sum(RequestTraceModel.total_tokens), 0).label("tokens"),
        func.coalesce(func.avg(RequestTraceModel.latency_ms), 0).label("avg_latency"),
    ).where(
        RequestTraceModel.user_id == current_user.id,
        RequestTraceModel.created_at >= day_ago,
    )
    day_res = await db.execute(day_stmt)
    day_row = day_res.one()

    # Monthly usage
    month_stmt = select(
        func.count(RequestTraceModel.id).label("requests"),
        func.coalesce(func.sum(RequestTraceModel.total_tokens), 0).label("tokens"),
        func.coalesce(func.avg(RequestTraceModel.latency_ms), 0).label("avg_latency"),
    ).where(
        RequestTraceModel.user_id == current_user.id,
        RequestTraceModel.created_at >= month_ago,
    )
    month_res = await db.execute(month_stmt)
    month_row = month_res.one()

    # Active API Keys count
    key_stmt = select(func.count(ApiKeyModel.id)).where(
        ApiKeyModel.user_id == current_user.id,
        ApiKeyModel.is_active == True,
    )
    active_keys_count = (await db.execute(key_stmt)).scalar() or 0

    return {
        "daily": {
            "requests": day_row.requests,
            "tokens": int(day_row.tokens),
            "avg_latency_ms": round(float(day_row.avg_latency), 1),
        },
        "monthly": {
            "requests": month_row.requests,
            "tokens": int(month_row.tokens),
            "avg_latency_ms": round(float(month_row.avg_latency), 1),
        },
        "daily_tokens": int(day_row.tokens),
        "monthly_tokens": int(month_row.tokens),
        "total_requests": int(month_row.requests),
        "active_keys_count": active_keys_count,
    }


@router.post("/logout")
async def logout(response: Response):
    """Clears the HTTP-only authentication and CSRF cookies."""
    response.delete_cookie("kultura_token", path="/")
    response.delete_cookie("kultura_csrf", path="/")
    return {"message": "Logged out successfully"}


# ── ADMIN USER MANAGEMENT ENDPOINTS ──

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin only: List all users, roles, stored session counts, and api key counts."""
    stmt = (
        select(
            UserModel,
            func.count(func.distinct(SessionModel.id)).label("sessions_count"),
            func.count(func.distinct(ApiKeyModel.id)).label("api_keys_count"),
        )
        .outerjoin(SessionModel, SessionModel.user_id == UserModel.id)
        .outerjoin(ApiKeyModel, (ApiKeyModel.user_id == UserModel.id) & (ApiKeyModel.is_active == True))
        .group_by(UserModel.id)
        .order_by(UserModel.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    users_list = []
    for u, sess_count, key_count in rows:
        users_list.append(
            UserResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                role=u.role,
                is_active=u.is_active,
                bio=u.bio,
                avatar_url=u.avatar_url,
                designation=u.designation,
                created_at=u.created_at,
                sessions_count=sess_count,
                api_keys_count=key_count,
            )
        )
    return users_list


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    req: CreateUserRequest,
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """
    Admin only: Create a new user with UserID/username, email, password, and role.
    Passwords are encrypted with bcrypt cost factor 12.
    """
    clean_username = req.username.strip()
    clean_email = req.email.strip().lower()

    # 1. Check username collision
    stmt_username = select(UserModel).where(func.lower(UserModel.username) == clean_username.lower())
    res_username = await db.execute(stmt_username)
    if res_username.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username/UserID '{clean_username}' is already in use.",
        )

    # 2. Check email collision
    stmt_email = select(UserModel).where(func.lower(UserModel.email) == clean_email)
    res_email = await db.execute(stmt_email)
    if res_email.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{clean_email}' is already registered.",
        )

    # 3. Validate role
    role = req.role.strip().lower()
    if role not in ("user", "admin"):
        role = "user"

    new_user = UserModel(
        id=str(uuid.uuid4()),
        username=clean_username,
        email=clean_email,
        hashed_password=hash_password(req.password),
        role=role,
        is_active=True,
    )
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    logger.info(f"Admin '{admin.username}' created new user '{clean_username}' ({role}).")
    return UserResponse(
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        role=new_user.role,
        is_active=new_user.is_active,
        created_at=new_user.created_at,
        sessions_count=0,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin only: Permanently delete a user account and all their isolated chat data."""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own active administrator account.",
        )

    stmt = select(UserModel).where(UserModel.id == user_id)
    res = await db.execute(stmt)
    target_user = res.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    deleted_username = target_user.username
    await db.delete(target_user)
    await db.commit()

    logger.info(f"Admin '{admin.username}' deleted user '{deleted_username}' ({user_id}).")
    return {"message": f"User '{deleted_username}' and all associated chat data deleted successfully."}


@router.patch("/users/{user_id}/password")
async def update_user_password(
    user_id: str,
    req: UpdatePasswordRequest,
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin only: Reset a user's password securely."""
    stmt = select(UserModel).where(UserModel.id == user_id)
    res = await db.execute(stmt)
    target_user = res.scalar_one_or_none()

    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    target_user.hashed_password = hash_password(req.new_password)
    await db.commit()

    logger.info(f"Admin '{admin.username}' reset password for user '{target_user.username}'.")
    return {"message": f"Password for user '{target_user.username}' updated successfully."}


@router.patch("/users/{user_id}/status")
async def toggle_user_status(
    user_id: str,
    req: ToggleUserStatusRequest,
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin only: Revoke or grant access to a user account."""
    if user_id == admin.id and not req.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own active administrator account.",
        )

    stmt = select(UserModel).where(UserModel.id == user_id)
    res = await db.execute(stmt)
    target_user = res.scalar_one_or_none()

    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    target_user.is_active = req.is_active
    await db.commit()

    action = "activated" if req.is_active else "revoked/deactivated"
    logger.info(f"Admin '{admin.username}' {action} user '{target_user.username}'.")
    return {"message": f"User '{target_user.username}' access {action} successfully.", "is_active": target_user.is_active}

