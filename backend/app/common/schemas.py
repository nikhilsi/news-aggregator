"""Pydantic schemas for API responses."""

from datetime import datetime

from pydantic import BaseModel


class ArticleResponse(BaseModel):
    """Article shape returned by the API. This is the common format all sources normalize into."""

    title: str
    summary: str | None = None
    url: str
    image_url: str | None = None
    source_id: str
    source_name: str
    source_type: str
    category: str
    sentiment: float | None = None
    published_at: datetime | None = None


class PaginationResponse(BaseModel):
    page: int
    per_page: int
    total: int
    total_pages: int


class ArticleListResponse(BaseModel):
    articles: list[ArticleResponse]
    pagination: PaginationResponse


class SourceResponse(BaseModel):
    """Source info returned by the API."""

    id: str
    name: str
    type: str
    category: str
    enabled: bool
    is_curated_positive: bool


class CategoryResponse(BaseModel):
    id: str
    name: str
    source_count: int
