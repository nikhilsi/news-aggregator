"""
Application configuration.

Loads settings from environment variables (or .env file).
Uses pydantic-settings for typed, validated configuration.

Usage:
    from app.config import settings
    print(settings.secret_key)
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT authentication
    secret_key: str = "change-me"          # Override in .env — generate with: python -c "import secrets; print(secrets.token_hex(32))"
    jwt_algorithm: str = "HS256"           # HMAC-SHA256, symmetric signing
    jwt_expire_minutes: int = 60 * 24      # Token lifetime: 24 hours

    # SQLite database path (users table only — articles are cached in memory)
    database_url: str = "sqlite:///./news_aggregator.db"

    # Default cache TTL for article fetching (can be overridden per-source in sources.yaml)
    cache_ttl_minutes: int = 15

    # API keys — only needed when corresponding sources are enabled in sources.yaml
    world_news_api_key: str = ""
    alpha_vantage_api_key: str = ""
    fmp_api_key: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


# Singleton instance — import this wherever config is needed
settings = Settings()
