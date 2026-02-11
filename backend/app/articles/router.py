"""Article endpoints."""

from fastapi import APIRouter, Query

from app.articles.service import get_articles
from app.common.schemas import ArticleListResponse, ArticleResponse, PaginationResponse

router = APIRouter(prefix="/api/v1", tags=["articles"])


@router.get("/articles", response_model=ArticleListResponse)
async def list_articles(
    category: str = Query("all", description="Filter by category"),
    source: str | None = Query(None, description="Filter by source ID"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=50, description="Items per page"),
):
    """Fetch articles with optional filters. Triggers on-demand fetching if cache is stale."""
    articles = await get_articles(category=category, source_id=source)

    # Pagination
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
    )
