from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    username_or_email: str = Field(..., min_length=1, max_length=255, description="Username or email address")
    password: str = Field(..., min_length=1, max_length=128, description="Account password")


class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64, description="Unique username / userID")
    email: str = Field(..., min_length=3, max_length=255, description="Unique email address")
    password: str = Field(..., min_length=6, max_length=128, description="Plaintext password (min 6 characters)")
    role: str = Field(default="user", description="Account role: 'user' or 'admin'")


class UpdatePasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6, max_length=128, description="New password (min 6 characters)")


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    sessions_count: int = 0

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
