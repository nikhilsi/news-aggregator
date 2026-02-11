"""
Authentication utilities — password hashing and JWT token management.

Password hashing uses bcrypt via passlib (industry standard, slow by design
to resist brute-force attacks).

JWT tokens use HS256 (symmetric HMAC) with the SECRET_KEY from app config.
Tokens contain the user's email in the 'sub' claim and expire after the
configured jwt_expire_minutes (default: 24 hours).
"""

from datetime import datetime, timedelta, timezone

import jwt
from passlib.context import CryptContext

from app.config import settings

# Bcrypt password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(email: str) -> str:
    """Create a JWT access token for a user.

    Token payload:
        sub: user email
        exp: expiration timestamp
        iat: issued-at timestamp
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": email,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
        "iat": now,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    """Decode and validate a JWT token.

    Returns the payload dict if valid, None if expired or invalid.
    """
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None
