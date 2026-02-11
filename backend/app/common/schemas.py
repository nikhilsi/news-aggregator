"""
Pydantic schemas for API responses.

These define the shape of data returned by the API endpoints.
They are NOT used for storage — articles are stored as plain dicts in the
in-memory cache. These schemas serialize the dicts into clean JSON responses.

All source types (RSS, News API, Financial API) normalize into dicts that
match ArticleResponse. See sources/rss_fetcher.py for the normalization logic.
"""

from datetime import datetime

from pydantic import BaseModel


class ArticleResponse(BaseModel):
    """Single article in the API response."""

    title: str
    summary: str | None = None
    url: str                                # Original source URL (also used as unique ID for dedup)
    image_url: str | None = None            # May be None — not all feeds provide images
    source_id: str                          # ID from sources.yaml (e.g., "ars-technica-science")
    source_name: str                        # Display name (e.g., "Ars Technica - Science")
    source_type: str                        # "rss" | "news_api" | "financial_api"
    category: str                           # Category from source config (e.g., "science")
    sentiment: float | None = None          # -1.0 to 1.0 — only populated by sentiment-aware APIs
    published_at: datetime | None = None    # When the article was published (None if feed doesn't provide it)


class PaginationResponse(BaseModel):
    """Pagination metadata included in list responses."""

    page: int
    per_page: int
    total: int
    total_pages: int


class ArticleListResponse(BaseModel):
    """Response shape for GET /api/v1/articles."""

    articles: list[ArticleResponse]
    pagination: PaginationResponse


class ReaderResponse(BaseModel):
    """Response shape for GET /api/v1/articles/reader.

    Uses a status field to indicate success or failure, so the frontend
    can decide whether to render content or show a fallback.
    """

    status: str                                 # "ok" or "failed"
    url: str                                    # Original article URL
    title: str | None = None                    # Article title (from cache or extracted)
    author: str | None = None                   # Author name (extracted)
    content_html: str | None = None             # Sanitized HTML content (only when status="ok")
    word_count: int | None = None               # Word count of extracted content
    image_url: str | None = None                # Hero image URL
    source_name: str | None = None              # Source display name (from cache)
    published_at: datetime | None = None        # Publication date (from cache)
    extracted_at: datetime | None = None        # When content was extracted
    reason: str | None = None                   # Failure reason (only when status="failed"):
                                                # "forbidden", "timeout", "extraction_empty", "error"


class SourceResponse(BaseModel):
    """Source info returned by GET /api/v1/sources."""

    id: str
    name: str
    type: str                               # "rss" | "news_api" | "financial_api"
    category: str
    enabled: bool
    is_curated_positive: bool               # If true, all articles from this source are considered positive


class CategoryResponse(BaseModel):
    """Category info returned by GET /api/v1/categories."""

    id: str                                 # e.g., "science", "feel_good"
    name: str                               # Display name: "Science", "Feel Good"
    source_count: int                       # Number of enabled sources in this category
