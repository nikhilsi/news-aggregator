"""
Article API endpoints.

GET /api/v1/articles         — Fetch articles with optional category/source/search/pagination filters.
GET /api/v1/articles/reader  — Extract clean article content for reader view.
"""

from fastapi import APIRouter, HTTPException, Query

from app.articles.reader import extract_article_content, validate_reader_url
from app.articles.service import get_articles
from app.common.schemas import ArticleListResponse, ArticleResponse, PaginationResponse, ReaderResponse

router = APIRouter(prefix="/api/v1", tags=["articles"])


@router.get("/articles/reader", response_model=ReaderResponse)
async def reader_view(
    url: str = Query(..., description="Article URL to extract content from"),
):
    """Extract clean article content for in-app reading.

    Fetches the full article page, extracts the main content using
    readability-lxml (with trafilatura fallback), sanitizes HTML,
    and returns it for rendering. Results are cached for 60 minutes.

    Returns status="ok" with content on success, or status="failed"
    with a reason code on failure (forbidden, timeout, extraction_empty, error).
    """
    url_error = validate_reader_url(url)
    if url_error:
        raise HTTPException(status_code=400, detail=url_error)
    result = await extract_article_content(url)
    return ReaderResponse(**result)


def _matches_search(article: dict, term: str) -> bool:
    """Check if an article's title or summary contains the search term (case-insensitive)."""
    title = (article.get("title") or "").lower()
    summary = (article.get("summary") or "").lower()
    return term in title or term in summary


@router.get("/articles", response_model=ArticleListResponse)
async def list_articles(
    category: str = Query("all", description="Filter by category"),
    source: str | None = Query(None, description="Filter by source ID"),
    search: str | None = Query(None, description="Search keyword in title/summary"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=50, description="Items per page"),
    refresh: bool = Query(False, description="Force refresh — skip cache, fetch all sources fresh"),
):
    """Fetch articles with optional filters.

    If cached data is fresh, returns immediately. If stale, fetches from
    sources on demand (concurrent), caches the result, then returns.
    Pass refresh=true to bypass cache and fetch fresh data from all sources.
    """
    articles, complete = await get_articles(category=category, source_id=source, refresh=refresh)

    # Apply keyword search filter (case-insensitive match on title + summary)
    if search:
        term = search.strip().lower()
        if term:
            articles = [a for a in articles if _matches_search(a, term)]

    # Apply pagination to the filtered, sorted article list
    total = len(articles)
    total_pages = max(1, (total + per_page - 1) // per_page)
    start = (page - 1) * per_page
    end = start + per_page
    page_articles = articles[start:end]

    return ArticleListResponse(
        articles=[ArticleResponse(**a) for a in page_articles],
        pagination=PaginationResponse(
            page=page,
            per_page=per_page,
            total=total,
            total_pages=total_pages,
        ),
        complete=complete,
    )
