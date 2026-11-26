import json
import logging
import uuid
from typing import AsyncGenerator, List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from constants import (
    COST_PER_1K_PROMPT_TOKENS_USD,
    COST_PER_1K_COMPLETION_TOKENS_USD,
    STATUS_OK,
    STATUS_ERROR,
    INTENT_CODE_AGENT,
    INTENT_SEARCH_GROUNDED,
    INTENT_CHAT,
)
from database import get_db, async_session_factory
from models import SessionModel, MessageModel, MessageMetricsModel, UserModel, RequestTraceModel
from schemas.chat_schemas import ChatCompletionRequest
from services.auth import get_current_user
from services.orchestrator import orchestrator
from services.providers import get_provider
from services.stream_normalizer import StreamNormalizer, build_provider_payload
from services.web_search import web_search_service, should_trigger_web_search

logger = logging.getLogger("kultura.routers.chat")
router = APIRouter(tags=["chat"])


@router.post("/api/chat/completions")
@router.post("/v1/chat/completions")
async def chat_completions(
    request: ChatCompletionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
):
    """
    Unified Streaming, Cross-Model Context Handoff & Live Web Search Grounding:
    - Automatically loads full chronological message history from PostgreSQL
    - Strips chain-of-thought traces from prior models
    - Normalizes message roles to strictly alternating sequence
    - Optionally searches the web (DuckDuckGo/SearXNG/Tavily/Brave) with 6s timeout and injects grounding sources
    - Normalizes outputs across all providers into standard SSE events (status, sources, thinking, content, metrics, done)
    - Persists provider, model, reasoning, and sources_json per message
    """
    try:
        provider = get_provider(request.provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    orchestrator.touch()

    # 1. Resolve or create chat session
    session_id = request.session_id or request.conversation_id
    if not session_id:
        new_session = SessionModel(
            user_id=current_user.id,
            title=request.messages[-1].content[:40] if request.messages else "New Chat",
            provider=request.provider,
            model=request.model,
        )
        db.add(new_session)
        await db.commit()
        await db.refresh(new_session)
        session_id = new_session.id
    else:
        # Check session exists or create
        sess = await db.get(SessionModel, session_id)
        if not sess:
            new_session = SessionModel(
                id=session_id,
                user_id=current_user.id,
                title=request.messages[-1].content[:40] if request.messages else "New Chat",
                provider=request.provider,
                model=request.model,
            )
            db.add(new_session)
            await db.commit()
        else:
            if sess.user_id != current_user.id and current_user.role != "admin":
                raise HTTPException(status_code=403, detail="Access denied to this session")
            # Update session's last used provider and model
            sess.provider = request.provider
            sess.model = request.model
            await db.commit()

    # 2. Persist the latest incoming user message
    user_msg_input = request.messages[-1] if request.messages else None
    if user_msg_input and user_msg_input.role == "user":
        att_json = None
        if user_msg_input.attachments:
            att_dicts = [
                {
                    "id": a.id,
                    "name": a.name,
                    "size": a.size,
                    "type": a.type,
                    "data": a.data if (a.data and len(a.data) < 200000) else None,
                }
                for a in user_msg_input.attachments
            ]
            att_json = json.dumps(att_dicts)

        user_db_msg = MessageModel(
            session_id=session_id,
            role="user",
            content=user_msg_input.content,
            attachments_json=att_json,
            provider=request.provider,
            model=request.model,
        )
        db.add(user_db_msg)
        await db.commit()

    # 3. Pull chronological conversation history from DB for cross-model fidelity
    stmt = (
        select(MessageModel)
        .where(MessageModel.session_id == session_id)
        .order_by(MessageModel.created_at)
    )
    res = await db.execute(stmt)
    db_history = res.scalars().all()

    if db_history:
        history_msgs: List[Dict[str, Any]] = []
        for m in db_history:
            atts = None
            if m.attachments_json:
                try:
                    atts = json.loads(m.attachments_json)
                except Exception:
                    pass
            history_msgs.append({
                "role": m.role,
                "content": m.content,
                "attachments": atts,
            })
    else:
        history_msgs = [
            {"role": m.role, "content": m.content, "attachments": m.attachments}
            for m in request.messages
        ]

    # 4. Optional Live Web Search Grounding with Fast Intent Gatekeeper
    web_sources: List[Dict[str, Any]] = []
    grounding_block: Optional[str] = None
    search_notice: Optional[str] = None
    search_triggered = False

    effective_reasoning_budget = request.reasoning_budget if request.enable_thinking else 0
    if request.web_search:
        if user_msg_input and user_msg_input.content.strip():
            raw_query = user_msg_input.content.strip()
            # Fast intent router: skip web search for greetings, chit-chat, pure code, pure math
            if should_trigger_web_search(raw_query):
                search_triggered = True
                logger.info(f"Running live web search for query: {raw_query[:60]}")
                try:
                    web_sources = await web_search_service.search(raw_query, limit=5)
                    if web_sources:
                        grounding_block = web_search_service.format_grounding_block(web_sources)
                    else:
                        search_notice = "Web search returned no results, continuing with local model..."
                except Exception as e:
                    logger.warning(f"Web search error fallback: {e}")
                    search_notice = "Web search unavailable, continuing with local model..."
            else:
                logger.info(f"Intent router bypassed web search for conversational query: {raw_query[:40]}")

    # 5. Build normalized cross-model payload with frontier headroom
    provider_payload = build_provider_payload(
        messages=history_msgs,
        model=request.model,
        provider=request.provider,
        system_prompt=request.system_prompt,
        grounding_block=grounding_block,
        enable_thinking=request.enable_thinking,
        reasoning_budget=effective_reasoning_budget,
        temperature=request.temperature if request.temperature is not None else 0.7,
        repeat_penalty=request.repeat_penalty if request.repeat_penalty is not None else 1.1,
        max_tokens=request.max_tokens if request.max_tokens is not None else (4096 if request.enable_thinking else 1024),
        num_ctx=8192 if request.enable_thinking else 4096,
    )

    normalizer = StreamNormalizer(provider=request.provider, model=request.model)

    async def sse_event_stream() -> AsyncGenerator[str, None]:
        assistant_message_id = str(uuid.uuid4())
        trace_error: Optional[str] = None
        try:
            # Emit searching status only if web search was actually triggered
            if search_triggered:
                yield f"event: status\ndata: {json.dumps({'status': 'generating', 'stage': 'searching', 'message': 'Searching the web...'})}\n\n"

            # Emit web sources if retrieved
            if web_sources:
                yield f"event: sources\ndata: {json.dumps(web_sources)}\n\n"
            elif search_notice:
                yield f"event: status\ndata: {json.dumps({'status': 'generating', 'stage': 'search_fallback', 'message': search_notice})}\n\n"

            yield f"event: status\ndata: {json.dumps({'status': 'generating', 'provider': request.provider, 'model': request.model})}\n\n"

            raw_stream = provider.chat_completion_stream(provider_payload)
            async for event_type, data_json, metrics in normalizer.normalize_stream(raw_stream):
                orchestrator.touch()
                yield f"event: {event_type}\ndata: {data_json}\n\n"

        except Exception as e:
            trace_error = str(e)
            logger.error(f"Error in chat completion stream: {e}", exc_info=True)
            yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"

        finally:
            try:
                # Final metrics calculation
                final_metrics = normalizer.get_metrics_snapshot()
                yield f"event: metrics\ndata: {json.dumps(final_metrics)}\n\n"

                # Persist request telemetry trace for Observability Dashboard
                trace_id = f"tr_{uuid.uuid4().hex[:6]}"
                p_toks = final_metrics["prompt_tokens"]
                c_toks = final_metrics["completion_tokens"]
                t_toks = final_metrics["thinking_tokens"]
                tot_toks = p_toks + c_toks + t_toks
                cost = (p_toks / 1000.0 * COST_PER_1K_PROMPT_TOKENS_USD) + (
                    (c_toks + t_toks) / 1000.0 * COST_PER_1K_COMPLETION_TOKENS_USD
                )

                intent = (
                    INTENT_SEARCH_GROUNDED
                    if web_sources
                    else (INTENT_CODE_AGENT if "coder" in request.model.lower() else INTENT_CHAT)
                )
                trace_status = STATUS_ERROR if trace_error else STATUS_OK

                # 6. Asynchronously persist assistant message, metadata, sources, metrics and trace to DB
                full_ans = "".join(normalizer.full_content)
                full_think = "".join(normalizer.full_thinking) if normalizer.full_thinking else None

                async with async_session_factory() as persist_db:
                    if full_ans or full_think:
                        asst_msg = MessageModel(
                            id=assistant_message_id,
                            session_id=session_id,
                            role="assistant",
                            content=full_ans or "*[No output generated]*",
                            thinking_content=full_think,
                            reasoning=full_think,
                            thinking_duration_ms=normalizer.thinking_duration_ms,
                            provider=request.provider,
                            model=request.model,
                            sources_json=json.dumps(web_sources) if web_sources else None,
                        )
                        persist_db.add(asst_msg)

                        metrics_entry = MessageMetricsModel(
                            message_id=assistant_message_id,
                            provider=request.provider,
                            model=request.model,
                            prompt_tokens=p_toks,
                            thinking_tokens=t_toks,
                            completion_tokens=c_toks,
                            tokens_per_sec=final_metrics["tokens_per_sec"],
                            ttft_ms=final_metrics["ttft_ms"],
                            total_duration_ms=final_metrics["total_duration_ms"],
                        )
                        persist_db.add(metrics_entry)

                    # Save trace record
                    trace_record = RequestTraceModel(
                        id=str(uuid.uuid4()),
                        trace_id=trace_id,
                        user_id=current_user.id,
                        session_id=session_id,
                        provider=request.provider,
                        model=request.model,
                        intent=intent,
                        status=trace_status,
                        error_message=trace_error,
                        latency_ms=final_metrics["total_duration_ms"],
                        ttft_ms=final_metrics["ttft_ms"],
                        prompt_tokens=p_toks,
                        completion_tokens=c_toks,
                        thinking_tokens=t_toks,
                        total_tokens=tot_toks,
                        estimated_cost_usd=cost,
                    )
                    persist_db.add(trace_record)
                    await persist_db.commit()

                yield f"event: done\ndata: {json.dumps({'message_id': assistant_message_id, 'session_id': session_id, 'trace_id': trace_id})}\n\n"
            except Exception as fe:
                logger.warning(f"Error in sse_event_stream finally block: {fe}")
                yield f"event: done\ndata: {json.dumps({'message_id': assistant_message_id, 'session_id': session_id})}\n\n"

    return StreamingResponse(
        sse_event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
