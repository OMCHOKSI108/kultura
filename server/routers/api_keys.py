import logging
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import UserModel, ApiKeyModel
from services.auth import get_current_user, generate_api_key

logger = logging.getLogger("kultura.routers.api_keys")
router = APIRouter(prefix="/api/auth/api-keys", tags=["api_keys"])


class ApiKeyResponse(BaseModel):
    id: str
    key_name: str
    key_prefix: str
    is_active: bool
    created_at: str
    last_used_at: Optional[str] = None
    raw_key: Optional[str] = None  # Populated only on creation


class CreateApiKeyRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=128, description="Human readable label for the API key")


@router.get("", response_model=List[ApiKeyResponse])
async def list_user_api_keys(
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists all active API keys belonging to the authenticated user."""
    stmt = (
        select(ApiKeyModel)
        .where(ApiKeyModel.user_id == current_user.id)
        .order_by(ApiKeyModel.created_at.desc())
    )
    res = await db.execute(stmt)
    keys = res.scalars().all()

    return [
        ApiKeyResponse(
            id=k.id,
            key_name=k.key_name,
            key_prefix=k.key_prefix,
            is_active=k.is_active,
            created_at=k.created_at.isoformat(),
            last_used_at=k.last_used_at.isoformat() if k.last_used_at else None,
            raw_key=None,
        )
        for k in keys
    ]


@router.post("", response_model=ApiKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_user_api_key(
    req: CreateApiKeyRequest,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Creates a new secure API Key (e.g. for Cursor, Claude Code, Cline, Continue, Aider).
    The full raw_key is only returned ONCE in this response.
    """
    raw_key, key_prefix, hashed_key = generate_api_key()

    new_key = ApiKeyModel(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        key_name=req.name.strip(),
        key_prefix=key_prefix,
        hashed_key=hashed_key,
        is_active=True,
    )
    db.add(new_key)
    await db.commit()
    await db.refresh(new_key)

    logger.info(f"Generated new API key '{new_key.key_name}' ({new_key.key_prefix}...) for user '{current_user.username}'.")

    return ApiKeyResponse(
        id=new_key.id,
        key_name=new_key.key_name,
        key_prefix=new_key.key_prefix,
        is_active=new_key.is_active,
        created_at=new_key.created_at.isoformat(),
        last_used_at=None,
        raw_key=raw_key,
    )


@router.delete("/{key_id}")
async def revoke_user_api_key(
    key_id: str,
    current_user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revokes and deletes an API key."""
    stmt = select(ApiKeyModel).where(ApiKeyModel.id == key_id)
    res = await db.execute(stmt)
    key = res.scalar_one_or_none()

    if not key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found.")

    if key.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this API key.")

    await db.delete(key)
    await db.commit()

    logger.info(f"Revoked API key '{key.key_name}' ({key.id}) for user '{current_user.username}'.")
    return {"message": f"API key '{key.key_name}' has been permanently revoked."}
