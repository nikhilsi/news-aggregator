"""
Source registry — loads and manages source configurations from sources.yaml.

Sources are loaded once on app startup (via load_sources()) and cached in memory.
The registry provides helper functions to query sources by category, ID, or status.

To add/remove/toggle sources, edit backend/sources.yaml — no code changes needed.
"""

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel

# Path to sources.yaml — lives in backend/ alongside schema.sql
SOURCES_PATH = Path(__file__).resolve().parent.parent.parent / "sources.yaml"

# Category ID → display name mapping
# "all" is a virtual category that includes every enabled source
CATEGORIES = {
    "all": "All",
    "feel_good": "Feel Good",
    "science": "Science",
    "tech": "Technology",
    "entertainment": "Entertainment",
    "finance": "Finance",
    "health": "Health",
    "sports": "Sports",
    "offbeat": "Offbeat",
}


class SourceConfig(BaseModel):
    """Validated source configuration from sources.yaml.

    Each source defines what to fetch, how to categorize it, and caching behavior.
    The 'type' field determines which fetcher is used (rss_fetcher, news_api_fetcher, etc.).
    """

    id: str                                  # Unique identifier (e.g., "ars-technica-science")
    name: str                                # Display name (e.g., "Ars Technica - Science")
    type: str                                # "rss" | "news_api" | "financial_api"
    url: str                                 # Feed URL or API endpoint
    category: str                            # Primary category for articles from this source
    is_curated_positive: bool = False        # If true, all articles pass the sentiment filter
    enabled: bool = True                     # Toggle without removing config
    api_key_env: Optional[str] = None        # Env var name for API key (e.g., "WORLD_NEWS_API_KEY")
    cache_ttl_minutes: int = 15              # How long fetched articles are cached


# Module-level source list — loaded once on startup, read by all requests
_sources: list[SourceConfig] = []


def load_sources() -> list[SourceConfig]:
    """Load and validate all sources from sources.yaml. Called once on app startup."""
    global _sources
    raw = yaml.safe_load(SOURCES_PATH.read_text())
    _sources = [SourceConfig(**s) for s in raw["sources"]]
    return _sources


def get_all_sources() -> list[SourceConfig]:
    """Return all sources (both enabled and disabled)."""
    if not _sources:
        load_sources()
    return _sources


def get_enabled_sources() -> list[SourceConfig]:
    """Return only enabled sources."""
    return [s for s in get_all_sources() if s.enabled]


def get_sources_by_category(category: str) -> list[SourceConfig]:
    """Return enabled sources for a category. 'all' returns every enabled source."""
    if category == "all":
        return get_enabled_sources()
    return [s for s in get_enabled_sources() if s.category == category]


def get_source_by_id(source_id: str) -> Optional[SourceConfig]:
    """Return a single source by ID, or None if not found."""
    for s in get_all_sources():
        if s.id == source_id:
            return s
    return None


def get_categories_with_counts() -> list[dict]:
    """Return all categories with the count of enabled sources in each.

    Used by the GET /api/v1/categories endpoint.
    """
    enabled = get_enabled_sources()
    counts: dict[str, int] = {}
    for s in enabled:
        counts[s.category] = counts.get(s.category, 0) + 1

    result = []
    for cat_id, cat_name in CATEGORIES.items():
        if cat_id == "all":
            result.append({"id": cat_id, "name": cat_name, "source_count": len(enabled)})
        else:
            result.append({"id": cat_id, "name": cat_name, "source_count": counts.get(cat_id, 0)})
    return result
