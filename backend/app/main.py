"""
FastAPI application entry point.

Responsibilities:
- App creation and middleware setup (CORS)
- Lifespan management: DB init, source registry loading, shared HTTP client
- Router registration
- Health check endpoint

Run with: uvicorn app.main:app --reload --port 8000
"""

import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.logging_config import setup_logging
from app.articles.service import set_http_client, warmup_cache
from app.sources.registry import load_sources
from app.articles.router import router as articles_router
from app.sources.router import router as sources_router
from app.auth.router import router as auth_router

# Configure structured logging for the entire app
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage app startup and shutdown.

    Startup:
      1. Initialize SQLite database (create tables if needed)
      2. Load source registry from sources.yaml
      3. Create shared httpx.AsyncClient (connection pooling for all outbound requests)

    Shutdown:
      httpx client is closed automatically via the async context manager.
    """
    await init_db()
    load_sources()

    async with httpx.AsyncClient(
        follow_redirects=True,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        },
    ) as client:
        set_http_client(client)

        # Pre-fetch all sources in background so first user request is fast
        asyncio.create_task(warmup_cache())

        yield


app = FastAPI(
    title="News Aggregator API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: allow the frontend to call the API
# In production behind a single domain + nginx, CORS isn't needed but doesn't hurt
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request timing middleware — logs start/end of every request with duration
_req_logger = logging.getLogger("app.requests")


@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    """Log request start/end with timing and a short request ID."""
    # Skip noisy health checks
    if request.url.path == "/health":
        return await call_next(request)

    request_id = uuid.uuid4().hex[:8]
    request.state.request_id = request_id

    query_str = f"?{request.url.query}" if request.url.query else ""
    _req_logger.info(
        "[%s] %s %s%s",
        request_id, request.method, request.url.path, query_str,
    )

    start = time.monotonic()
    response = await call_next(request)
    duration_ms = int((time.monotonic() - start) * 1000)

    _req_logger.info(
        "[%s] %s %s → %d in %dms",
        request_id, request.method, request.url.path,
        response.status_code, duration_ms,
    )

    return response


# Register routers
app.include_router(articles_router)
app.include_router(sources_router)
app.include_router(auth_router)


@app.get("/health")
async def health_check():
    """Simple health check — returns 200 if the server is running."""
    return {"status": "ok"}
