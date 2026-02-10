"""Source registry — loads and manages source configurations from sources.yaml."""

from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel


SOURCES_PATH = Path(__file__).resolve().parent.parent.parent / "sources.yaml"

# Category display names
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
    """Validated source configuration from sources.yaml."""

    id: str
    name: str
    type: str  # "rss" | "news_api" | "financial_api"
    url: str
    category: str
    is_curated_positive: bool = False
    enabled: bool = True
    api_key_env: Optional[str] = None
    cache_ttl_minutes: int = 15


# Module-level source list, loaded once
_sources: list[SourceConfig] = []


def load_sources() -> list[SourceConfig]:
    """Load and validate sources from sources.yaml."""
    global _sources
    raw = yaml.safe_load(SOURCES_PATH.read_text())
    _sources = [SourceConfig(**s) for s in raw["sources"]]
    return _sources


def get_all_sources() -> list[SourceConfig]:
    """Return all sources (enabled and disabled)."""
    if not _sources:
        load_sources()
    return _sources


def get_enabled_sources() -> list[SourceConfig]:
    """Return only enabled sources."""
    return [s for s in get_all_sources() if s.enabled]


def get_sources_by_category(category: str) -> list[SourceConfig]:
    """Return enabled sources for a given category."""
    if category == "all":
        return get_enabled_sources()
    return [s for s in get_enabled_sources() if s.category == category]


def get_source_by_id(source_id: str) -> Optional[SourceConfig]:
    """Return a single source by ID."""
    for s in get_all_sources():
        if s.id == source_id:
            return s
    return None


def get_categories_with_counts() -> list[dict]:
    """Return categories with count of enabled sources in each."""
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
