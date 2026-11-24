from typing import Optional, List, Any
from pydantic import BaseModel, Field


class AttachmentInput(BaseModel):
    id: str
    name: str
    size: int
    type: str
    data: Optional[str] = None  # base64 data URI or raw base64 string


class ChatMessageInput(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$", description="Role: user, assistant, or system")
    content: str
    attachments: Optional[List[AttachmentInput]] = None


class WebSourceSchema(BaseModel):
    index: int
    title: str
    url: str
    domain: str
    snippet: str


class ChatCompletionRequest(BaseModel):
    session_id: Optional[str] = None
    conversation_id: Optional[str] = None
    provider: str = Field(default="ollama", description="ollama, llamacpp, koboldcpp, lmstudio, jan")
    model: str = Field(..., description="Target model tag or filename")
    messages: List[ChatMessageInput] = Field(..., min_length=1, description="List of messages (at least 1 required)")
    system_prompt: Optional[str] = None
    enable_thinking: bool = True
    reasoning_budget: Optional[int] = None
    temperature: Optional[float] = 0.7
    repeat_penalty: Optional[float] = 1.1
    max_tokens: Optional[int] = 1024
    web_search: bool = False
    stream: bool = True


class MessageMetricsSchema(BaseModel):
    provider: str
    model: str
    prompt_tokens: int = 0
    thinking_tokens: int = 0
    completion_tokens: int = 0
    tokens_per_sec: float = 0.0
    ttft_ms: float = 0.0
    total_duration_ms: float = 0.0


class MessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    thinking_content: Optional[str] = None
    reasoning: Optional[str] = None
    thinking_duration_ms: int = 0
    attachments: Optional[List[dict]] = None
    sources: Optional[List[dict]] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    metrics: Optional[MessageMetricsSchema] = None
    created_at: str


class SessionCreate(BaseModel):
    title: Optional[str] = "New Chat"
    provider: Optional[str] = "ollama"
    model: Optional[str] = "qwen3.5:4b"


class SessionUpdate(BaseModel):
    title: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None


class SessionResponse(BaseModel):
    id: str
    title: str
    provider: Optional[str]
    model: Optional[str]
    preview: Optional[str] = ""
    created_at: str
    updated_at: str
    messages_count: int = 0
