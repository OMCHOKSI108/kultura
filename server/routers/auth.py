import logging
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import UserModel, SessionModel
from schemas.auth_schemas import (
    LoginRequest,
    LoginResponse,
    CreateUserRequest,
    UpdatePasswordRequest,
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
            detail="Account is inactive. Please contact your system administrator.",
        )

    # Count user's sessions
    session_count_stmt = select(func.count(SessionModel.id)).where(SessionModel.user_id == user.id)
    count_res = await db.execute(session_count_stmt)
    sessions_count = count_res.scalar() or 0

    token_payload = {
        "sub": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
    }
    access_token = create_access_token(token_payload)

    # Set secure cookie
    response.set_cookie(
        key="kultura_token",
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=False,  # Can be True in HTTPS production
        max_age=60 * 60 * 24 * 7,  # 7 days
    )

    user_resp = UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        sessions_count=sessions_count,
    )

    logger.info(f"User '{user.username}' ({user.role}) logged in successfully.")
    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_resp,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Returns the currently authenticated user's profile and active session count."""
    session_count_stmt = select(func.count(SessionModel.id)).where(SessionModel.user_id == current_user.id)
    count_res = await db.execute(session_count_stmt)
    sessions_count = count_res.scalar() or 0

    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        sessions_count=sessions_count,
    )


@router.post("/logout")
async def logout(response: Response):
    """Clears the HTTP-only authentication cookie."""
    response.delete_cookie("kultura_token")
    return {"message": "Logged out successfully"}


# ── ADMIN USER MANAGEMENT ENDPOINTS ──

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    admin: UserModel = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin only: List all users, roles, and their stored session counts."""
    stmt = (
        select(
            UserModel,
            func.count(SessionModel.id).label("sessions_count"),
        )
        .outerjoin(SessionModel, SessionModel.user_id == UserModel.id)
        .group_by(UserModel.id)
        .order_by(UserModel.created_at.desc())
    )
    res = await db.execute(stmt)
    rows = res.all()

    users_list = []
    for u, count in rows:
        users_list.append(
            UserResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                role=u.role,
                is_active=u.is_active,
                created_at=u.created_at,
                sessions_count=count,
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
