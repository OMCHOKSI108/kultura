import json
import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import SessionModel, MessageModel, MessageMetricsModel, UserModel
from schemas.chat_schemas import (
    SessionCreate,
    SessionUpdate,
    SessionResponse,
    MessageResponse,
    MessageMetricsSchema,
)
from services.auth import get_current_user

logger = logging.getLogger("kultura.routers.sessions")
router = APIRouter(prefix="/api", tags=["sessions"])


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """List all chat sessions for the authenticated user with their latest message preview."""
    stmt = (
        select(SessionModel)
        .options(selectinload(SessionModel.messages))
        .where(SessionModel.user_id == current_user.id)
        .order_by(desc(SessionModel.updated_at))
    )

    res = await db.execute(stmt)
    sessions = res.scalars().all()

    result = []
    for s in sessions:
        preview = ""
        if s.messages:
            # find first user message or last message for preview
            user_msg = next((m for m in s.messages if m.role == "user"), s.messages[0])
            preview = user_msg.content[:80]

        result.append(
            SessionResponse(
                id=s.id,
                title=s.title,
                provider=s.provider,
                model=s.model,
                preview=preview,
                created_at=s.created_at.isoformat(),
                updated_at=s.updated_at.isoformat(),
                messages_count=len(s.messages),
            )
        )
    return result


@router.post("/sessions", response_model=SessionResponse)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Create a new chat session tied strictly to the authenticated user."""
    new_session = SessionModel(
        user_id=current_user.id,
        title=data.title or "New Chat",
        provider=data.provider or "ollama",
        model=data.model or "qwen3.5:4b",
    )
    db.add(new_session)
    await db.commit()
    await db.refresh(new_session)

    return SessionResponse(
        id=new_session.id,
        title=new_session.title,
        provider=new_session.provider,
        model=new_session.model,
        preview="",
        created_at=new_session.created_at.isoformat(),
        updated_at=new_session.updated_at.isoformat(),
        messages_count=0,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    stmt = (
        select(SessionModel)
        .options(selectinload(SessionModel.messages))
        .where(SessionModel.id == session_id)
    )
    res = await db.execute(stmt)
    s = res.scalar_one_or_none()
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if s.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied to this session")

    preview = s.messages[0].content[:80] if s.messages else ""
    return SessionResponse(
        id=s.id,
        title=s.title,
        provider=s.provider,
        model=s.model,
        preview=preview,
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
        messages_count=len(s.messages),
    )


@router.patch("/sessions/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str,
    data: SessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    s = await db.get(SessionModel, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if s.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied to this session")

    if data.title is not None:
        s.title = data.title
    if data.provider is not None:
        s.provider = data.provider
    if data.model is not None:
        s.model = data.model

    await db.commit()
    await db.refresh(s)

    return SessionResponse(
        id=s.id,
        title=s.title,
        provider=s.provider,
        model=s.model,
        preview="",
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
        messages_count=0,
    )


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    s = await db.get(SessionModel, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if s.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied to this session")

    await db.delete(s)
    await db.commit()
    return {"status": "ok", "message": f"Session {session_id} deleted"}


@router.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def list_session_messages(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """Fetch all messages for a session with thinking traces and token metrics."""
    s = await db.get(SessionModel, session_id)
    if not s:
        raise HTTPException(status_code=404, detail="Session not found")

    if s.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Access denied to this session")

    stmt = (
        select(MessageModel)
        .options(selectinload(MessageModel.metrics))
        .where(MessageModel.session_id == session_id)
        .order_by(MessageModel.created_at)
    )
    res = await db.execute(stmt)
    messages = res.scalars().all()

    output = []
    for m in messages:
        attachments = []
        if m.attachments_json:
            try:
                attachments = json.loads(m.attachments_json)
            except Exception:
                pass

        metric_schema = None
        if m.metrics:
            metric_schema = MessageMetricsSchema(
                provider=m.metrics.provider,
                model=m.metrics.model,
                prompt_tokens=m.metrics.prompt_tokens,
                thinking_tokens=m.metrics.thinking_tokens,
                completion_tokens=m.metrics.completion_tokens,
                tokens_per_sec=m.metrics.tokens_per_sec,
                ttft_ms=m.metrics.ttft_ms,
                total_duration_ms=m.metrics.total_duration_ms,
            )

        sources = []
        if m.sources_json:
            try:
                sources = json.loads(m.sources_json)
            except Exception:
                pass

        output.append(
            MessageResponse(
                id=m.id,
                session_id=m.session_id,
                role=m.role,
                content=m.content,
                thinking_content=m.thinking_content,
                reasoning=m.reasoning or m.thinking_content,
                thinking_duration_ms=m.thinking_duration_ms,
                attachments=attachments,
                sources=sources,
                provider=m.provider or (m.metrics.provider if m.metrics else None),
                model=m.model or (m.metrics.model if m.metrics else None),
                metrics=metric_schema,
                created_at=m.created_at.isoformat(),
            )
        )
    return output


@router.delete("/messages/{message_id}")
async def delete_message(
    message_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    m = await db.get(MessageModel, message_id)
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")

    s = await db.get(SessionModel, m.session_id)
    if not s or (s.user_id != current_user.id and current_user.role != "admin"):
        raise HTTPException(status_code=403, detail="Access denied to this message")

    await db.delete(m)
    await db.commit()
    return {"status": "ok", "message": f"Message {message_id} deleted"}
