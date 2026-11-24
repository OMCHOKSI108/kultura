import logging
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger("kultura.services.context_manager")


def strip_thinking_tags(text: str) -> str:
    """
    Strips <think>...</think> and </think> tags along with their internal reasoning
    from assistant message content so reasoning from Model A does not pollute
    or overflow Model B's context window.
    """
    if not text:
        return ""
    # Strip complete or unclosed <think> blocks (up to </think> or end of string)
    cleaned = re.sub(r"<think>(?:.*?</think>|.*$)", "", text, flags=re.DOTALL)
    # Strip any dangling </think> tags
    cleaned = re.sub(r"</?think>", "", cleaned)
    return cleaned.strip()


def normalize_roles(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Normalizes a message sequence to guarantee strict alternation:
    system (optional, start only) -> user -> assistant -> user ...
    Consecutive same-role messages are merged with double newlines
    so strict Jinja chat templates (like llama.cpp, Gemma, Qwen) never fail with 400.
    """
    if not messages:
        return []

    system_parts: List[str] = []
    dialogue: List[Dict[str, Any]] = []

    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")

        if role == "system":
            if content.strip():
                system_parts.append(content.strip())
        else:
            clean_content = strip_thinking_tags(content) if role == "assistant" else content
            if not clean_content.strip() and role == "assistant":
                continue

            if dialogue and dialogue[-1]["role"] == role:
                # Merge consecutive same-role messages
                dialogue[-1]["content"] = f"{dialogue[-1]['content']}\n\n{clean_content}".strip()
                # Merge attachments if present
                if msg.get("attachments"):
                    existing_atts = dialogue[-1].get("attachments", []) or []
                    dialogue[-1]["attachments"] = existing_atts + msg.get("attachments", [])
            else:
                dialogue.append(
                    {
                        "role": role,
                        "content": clean_content.strip(),
                        "attachments": msg.get("attachments"),
                    }
                )

    # Ensure dialogue starts with 'user'
    while dialogue and dialogue[0]["role"] != "user":
        dialogue.pop(0)

    # Reconstruct with single optional system prompt at start
    result: List[Dict[str, Any]] = []
    if system_parts:
        result.append({"role": "system", "content": "\n\n".join(system_parts)})

    result.extend(dialogue)
    return result


def apply_sliding_window(
    messages: List[Dict[str, Any]],
    num_ctx: int = 2048,
    budget_ratio: float = 0.75,
) -> List[Dict[str, Any]]:
    """
    Enforces a token-budget sliding window estimating ~4 chars/token.
    If total character length exceeds (num_ctx * budget_ratio * 4),
    it keeps the system message (if present) and the most recent dialogue
    turns that fit comfortably within the target context window.
    """
    if not messages:
        return []

    max_char_budget = int(num_ctx * budget_ratio * 4)

    system_msg: Optional[Dict[str, Any]] = None
    dialogue_turns: List[Dict[str, Any]] = []

    for m in messages:
        if m.get("role") == "system":
            system_msg = m
        else:
            dialogue_turns.append(m)

    system_chars = len(system_msg.get("content", "")) if system_msg else 0
    available_chars = max(500, max_char_budget - system_chars)

    # Keep dialogue turns from newest to oldest until budget is exhausted
    retained_turns: List[Dict[str, Any]] = []
    current_chars = 0

    for turn in reversed(dialogue_turns):
        turn_len = len(turn.get("content", ""))
        if retained_turns and (current_chars + turn_len > available_chars):
            break
        retained_turns.append(turn)
        current_chars += turn_len

    retained_turns.reverse()

    # Ensure the retained dialogue still starts with a user turn
    while retained_turns and retained_turns[0]["role"] != "user":
        retained_turns.pop(0)

    result: List[Dict[str, Any]] = []
    if system_msg:
        result.append(system_msg)
    result.extend(retained_turns)

    return result


COGNITIVE_REASONING_PROTOCOL = (
    "Metacognitive & Reasoning Directives:\n"
    "1. Strict Grounding: Anchor all intermediate deduction strictly in verified facts, provided search results, "
    "or domain ground truth. Never invent statistics, citations, synthetic URLs, or ungrounded claims.\n"
    "2. Epistemic Honesty: Maintain absolute truthfulness regarding knowledge boundaries. If a fact is uncertain "
    "or missing from the available context, acknowledge the gap directly instead of attempting to guess or confabulate.\n"
    "3. Forward Momentum & Anti-Looping: Progress through logical steps decisively. Once a premise or constraint has "
    "been checked and verified, commit to the deduction. Do NOT loop or second-guess the same point in circular self-doubt.\n"
    "4. Decisive Synthesis: Conclude the thinking phase as soon as the core solution is verified, and immediately output "
    "the clear, substantiated final answer."
)


def prepare_cross_model_context(
    messages: List[Dict[str, Any]],
    system_prompt: Optional[str] = None,
    grounding_block: Optional[str] = None,
    enable_thinking: bool = False,
    num_ctx: int = 4096,
) -> List[Dict[str, Any]]:
    """
    Full pipeline for seamless context handoff:
    1. Injects custom system prompt, cognitive reasoning protocol, and grounding rules strictly in system role
    2. Injects clean reference information into the user message without raw XML tags
    3. Strips chain-of-thought from prior assistant turns
    4. Normalizes roles to strict alternation
    5. Trims history with token-budget sliding window
    """
    working_messages = list(messages)

    # 1. Construct effective system prompt
    system_parts: List[str] = []
    if system_prompt and system_prompt.strip():
        system_parts.append(system_prompt.strip())
    elif enable_thinking:
        system_parts.append("You are Kultura, a high-precision reasoning AI.")

    if enable_thinking:
        system_parts.append(COGNITIVE_REASONING_PROTOCOL)

    if grounding_block and grounding_block.strip():
        from services.web_search import GROUNDING_SYSTEM_RULES
        system_parts.append(GROUNDING_SYSTEM_RULES)

    effective_system = "\n\n".join(system_parts).strip()

    # Inject system prompt if present
    if effective_system:
        working_messages.insert(0, {"role": "system", "content": effective_system})

    # 2. Normalize roles & strip <think> traces
    normalized = normalize_roles(working_messages)

    # 3. Inject reference information into the latest user message
    if grounding_block and grounding_block.strip() and normalized:
        for i in range(len(normalized) - 1, -1, -1):
            if normalized[i]["role"] == "user":
                orig_content = normalized[i]["content"]
                normalized[i]["content"] = f"{grounding_block.strip()}\n\n---\nUser Question:\n{orig_content}"
                break

    # 4. Apply sliding window for VRAM & context budget safety
    final_context = apply_sliding_window(normalized, num_ctx=num_ctx, budget_ratio=0.75)

    return final_context
