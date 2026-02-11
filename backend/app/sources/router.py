"""
Source and category API endpoints.

GET /api/v1/sources     — List all configured sources (enabled and disabled)
GET /api/v1/categories  — List available categories with source counts
"""

from fastapi import APIRouter

from app.common.schemas import CategoryResponse, SourceResponse
from app.sources.registry import get_all_sources, get_categories_with_counts

router = APIRouter(prefix="/api/v1", tags=["sources"])


@router.get("/sources", response_model=list[SourceResponse])
async def list_sources():
    """List all configured sources with their enabled/disabled status."""
    sources = get_all_sources()
    return [
        SourceResponse(
            id=s.id,
            name=s.name,
            type=s.type,
            category=s.category,
            enabled=s.enabled,
            is_curated_positive=s.is_curated_positive,
        )
        for s in sources
    ]


@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories():
    """List all available categories with the number of enabled sources in each."""
    cats = get_categories_with_counts()
    return [CategoryResponse(**c) for c in cats]
