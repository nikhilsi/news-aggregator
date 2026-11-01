"""Parity check, Python side (spec section 9).

Runs the droplet's own pipeline (backend/app) on the recorded fixtures, with
every HTTP call answered from .fixtures/, and writes every tab's list exactly
as the API would serialize it. The cache is warmed first with warmup_cache(),
so each tab is built from cache HITs in sources order (avoids O14).

Use the Python versions production runs (Python 3.12.13, feedparser 6.0.12,
httpx 0.28.1, pydantic 2.13.4, pydantic-settings 2.14.1, PyYAML 6.0.3):
    TZ=UTC python -I scripts/parity/run_py.py
Writes .fixtures/py-out.json.
"""

import asyncio
import hashlib
import json
import logging
import sys
from pathlib import Path

WORKER = Path(__file__).resolve().parents[2]
FX = WORKER / ".fixtures"
sys.path.insert(0, str(WORKER.parent / "backend"))

import httpx  # noqa: E402

from app.articles import service  # noqa: E402
from app.common.schemas import ArticleResponse  # noqa: E402
from app.sources import registry  # noqa: E402

logging.basicConfig(level=logging.ERROR)

ts_sources = json.loads((FX / "sources.json").read_text())
registry._sources = [
    registry.SourceConfig(
        id=s["id"], name=s["name"], type=s["type"], url=s["url"], category=s["category"],
        is_curated_positive=s["isCuratedPositive"], enabled=s["enabled"], cache_ttl_minutes=15,
    )
    for s in ts_sources
]
sys.path.insert(0, str(WORKER.parent / "backend"))
import yaml  # noqa: E402

registry._categories = [
    registry.CategoryConfig(**c)
    for c in yaml.safe_load((WORKER.parent / "backend" / "sources.yaml").read_text())["categories"]
]
feed_by_url = {s["url"]: s["id"] for s in ts_sources}
missing_og: list[str] = []


class FixtureClient:
    """Answers httpx-style GETs from the fixtures."""

    async def get(self, url, timeout=None, headers=None, follow_redirects=None):
        req = httpx.Request("GET", url)
        if url in feed_by_url:
            sid = feed_by_url[url]
            meta = json.loads((FX / "feeds" / f"{sid}.json").read_text())
            body = (FX / "feeds" / f"{sid}.xml").read_bytes()
            h = {k: v for k, v in (("content-type", meta["content_type"]), ("etag", meta["etag"]),
                                   ("last-modified", meta["last_modified"])) if v}
            return httpx.Response(meta["status"], headers=h, content=body, request=req)
        key = hashlib.sha1(url.encode()).hexdigest()
        path = FX / "og" / f"{key}.json"
        if not path.exists():
            missing_og.append(url)
            raise httpx.ConnectError("no fixture", request=req)
        rec = json.loads(path.read_text())
        if not rec.get("status"):
            raise httpx.ConnectError(rec.get("error", "error"), request=req)
        return httpx.Response(rec["status"], headers={"content-type": "text/html; charset=utf-8"},
                              content=rec["head"].encode("utf-8"), request=req)


async def main() -> None:
    service.set_http_client(FixtureClient())
    await service.warmup_cache()
    tabs = ["all"] + [c.id for c in registry._categories if c.id != "all"]
    tabs += sorted({s.category for s in registry.get_enabled_sources()} - set(tabs))
    out = {}
    for tab in tabs:
        articles, complete = await service.get_articles(category=tab)
        assert complete, tab
        out[tab] = [ArticleResponse(**a).model_dump(mode="json") for a in articles]
    (FX / "py-out.json").write_text(json.dumps(out))
    print(f"tabs {len(out)}, all={len(out['all'])}, og fixtures missing {len(set(missing_og))}")


asyncio.run(main())
