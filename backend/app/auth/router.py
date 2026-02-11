"""
Auth router — login, logout, and current user endpoints.

Endpoints:
    POST /api/v1/auth/login   — Authenticate with email + password, returns JWT
    POST /api/v1/auth/logout  — Client-side only (no server state to clear)
    GET  /api/v1/auth/me      — Get current user profile (requires valid JWT)
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.auth.dependencies import get_current_user
from app.auth.utils import verify_password, create_access_token
from app.database import get_db

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ── Request / Response schemas ──────────────────────────────────────────

class LoginRequest(BaseModel):
    """Login request body — email and password."""
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Login response — JWT token and basic user info."""
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    """Current user profile returned by /me."""
    id: int
    email: str
    full_name: str | None
    is_admin: bool


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """Authenticate a user with email and password.

    On success: resets failed_login_attempts, updates last_login, returns JWT.
    On failure: increments failed_login_attempts, returns 401.
    """
    db = await get_db()
    try:
        # Look up user by email
        cursor = await db.execute(
            "SELECT id, email, full_name, password_hash, is_admin, is_active, failed_login_attempts "
            "FROM users WHERE email = ?",
            (body.email,),
        )
        row = await cursor.fetchone()

        if not row:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        user = dict(row)

        # Check if account is active
        if not user["is_active"]:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Account is inactive",
            )

        # Verify password
        if not verify_password(body.password, user["password_hash"]):
            # Increment failed login attempts
            await db.execute(
                "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?",
                (user["id"],),
            )
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password",
            )

        # Success — reset failed attempts and update last_login
        await db.execute(
            "UPDATE users SET failed_login_attempts = 0, last_login = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), user["id"]),
        )
        await db.commit()

    finally:
        await db.close()

    # Create JWT token
    token = create_access_token(user["email"])

    return LoginResponse(
        access_token=token,
        user={
            "id": user["id"],
            "email": user["email"],
            "full_name": user["full_name"],
            "is_admin": user["is_admin"],
        },
    )


@router.post("/logout")
async def logout():
    """Logout endpoint.

    JWT tokens are stateless — there's no server-side session to invalidate.
    The client simply discards the token. This endpoint exists so the frontend
    has a consistent API to call.
    """
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    """Get the current authenticated user's profile.

    Requires a valid JWT in the Authorization header.
    """
    return UserResponse(
        id=user["id"],
        email=user["email"],
        full_name=user["full_name"],
        is_admin=user["is_admin"],
    )
