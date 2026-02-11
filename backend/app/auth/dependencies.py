"""
Auth dependencies for FastAPI route protection.

Usage in a router:
    from app.auth.dependencies import get_current_user

    @router.get("/protected")
    async def protected_route(user: dict = Depends(get_current_user)):
        return {"email": user["email"]}
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.utils import decode_access_token
from app.database import get_db

# Extracts token from "Authorization: Bearer <token>" header
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """FastAPI dependency that validates the JWT and returns the current user.

    Raises 401 if:
    - Token is missing, expired, or invalid
    - User email in token doesn't exist in the database
    - User account is inactive
    """
    payload = decode_access_token(credentials.credentials)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    email = payload.get("sub")
    if not email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    # Look up user in database
    db = await get_db()
    try:
        cursor = await db.execute(
            "SELECT id, email, full_name, is_admin, is_active FROM users WHERE email = ?",
            (email,),
        )
        row = await cursor.fetchone()
    finally:
        await db.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    user = dict(row)
    if not user["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is inactive",
        )

    return user
