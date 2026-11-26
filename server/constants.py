"""
Kultura Unified Server Constants
Centralized constants for microservices, observability, authentication, and routing.
"""

# System Roles
ROLE_ADMIN = "admin"
ROLE_USER = "user"
VALID_ROLES = (ROLE_ADMIN, ROLE_USER)

# API Keys
API_KEY_PREFIX = "kult_live_"
API_KEY_LENGTH = 32

# Observability Request Intents
INTENT_CHAT = "chat"
INTENT_CODE_AGENT = "code_agent"
INTENT_SEARCH_GROUNDED = "search_grounded"
INTENT_RAG = "rag"
INTENT_SYSTEM = "system"

VALID_INTENTS = (
    INTENT_CHAT,
    INTENT_CODE_AGENT,
    INTENT_SEARCH_GROUNDED,
    INTENT_RAG,
    INTENT_SYSTEM,
)

# Observability Statuses
STATUS_OK = "ok"
STATUS_ERROR = "error"
STATUS_TIMEOUT = "timeout"

# Service Level Objectives (SLO)
SLO_LATENCY_SECONDS = 3.0
SLO_LATENCY_MS = 3000.0

# Estimated Cloud Cost Savings ($ per 1K tokens - industry benchmark blended rates)
COST_PER_1K_PROMPT_TOKENS_USD = 0.0015
COST_PER_1K_COMPLETION_TOKENS_USD = 0.0030

# Supported Inference Providers
PROVIDER_OLLAMA = "ollama"
PROVIDER_LLAMACPP = "llamacpp"
PROVIDER_KOBOLDCPP = "koboldcpp"
PROVIDER_LMSTUDIO = "lmstudio"
PROVIDER_JAN = "jan"

SUPPORTED_PROVIDERS = [
    PROVIDER_OLLAMA,
    PROVIDER_LLAMACPP,
    PROVIDER_KOBOLDCPP,
    PROVIDER_LMSTUDIO,
    PROVIDER_JAN,
]

# Time Windows (in minutes)
WINDOW_1_HOUR = 60
WINDOW_24_HOURS = 1440
WINDOW_7_DAYS = 10080
