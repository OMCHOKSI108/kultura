"""
Kultura Centralized Backend Permissions & RBAC Module
Defines canonical resource:action permissions and role mappings.
"""

from typing import Dict, Set
from fastapi import HTTPException, status
from models import UserModel

# Canonical Permission Identifiers
PERMISSION_CHAT_CREATE = "chat:create"
PERMISSION_SESSIONS_MANAGE = "sessions:manage"
PERMISSION_MODELS_SELECT = "models:select"
PERMISSION_MODELS_LOAD = "models:load"
PERMISSION_MODELS_DOWNLOAD = "models:download"
PERMISSION_PROVIDERS_MANAGE = "providers:manage"
PERMISSION_OBSERVABILITY_VIEW = "observability:view"
PERMISSION_OBSERVABILITY_EXPORT = "observability:export"
PERMISSION_USERS_MANAGE = "users:manage"
PERMISSION_API_KEYS_MANAGE = "api_keys:manage"
PERMISSION_PROFILE_EDIT = "profile:edit"

# Role Permission Mappings
ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "admin": {
        PERMISSION_CHAT_CREATE,
        PERMISSION_SESSIONS_MANAGE,
        PERMISSION_MODELS_SELECT,
        PERMISSION_MODELS_LOAD,
        PERMISSION_MODELS_DOWNLOAD,
        PERMISSION_PROVIDERS_MANAGE,
        PERMISSION_OBSERVABILITY_VIEW,
        PERMISSION_OBSERVABILITY_EXPORT,
        PERMISSION_USERS_MANAGE,
        PERMISSION_API_KEYS_MANAGE,
        PERMISSION_PROFILE_EDIT,
    },
    "user": {
        PERMISSION_CHAT_CREATE,
        PERMISSION_SESSIONS_MANAGE,
        PERMISSION_MODELS_SELECT,
        PERMISSION_MODELS_LOAD,
        PERMISSION_API_KEYS_MANAGE,
        PERMISSION_PROFILE_EDIT,
    },
}


def has_permission(user: UserModel, permission: str) -> bool:
    """Checks whether a user holds a specific resource:action permission."""
    if not user or not user.is_active:
        return False
    user_perms = ROLE_PERMISSIONS.get(user.role, set())
    return permission in user_perms


def require_permission(permission: str):
    """FastAPI dependency factory enforcing a specific permission."""
    def dependency(user: UserModel):
        if not has_permission(user, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: You lack the required permission '{permission}'.",
            )
        return user
    return dependency
