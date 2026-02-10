from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT
    secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours

    # Database
    database_url: str = "sqlite:///./news_aggregator.db"

    # Cache
    cache_ttl_minutes: int = 15

    # API keys (optional — only needed when those sources are enabled)
    world_news_api_key: str = ""
    alpha_vantage_api_key: str = ""
    fmp_api_key: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
