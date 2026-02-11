"""
FastAPI application entry point.

Responsibilities:
- App creation and middleware setup (CORS)
- Lifespan management: DB init, source registry loading, shared HTTP client
- Router registration
- Health check endpoint

Run with: uvicorn app.main:app --reload --port 8000
"""

import logging
import os
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.articles.service import set_http_client
from app.sources.registry import load_sources
from app.articles.router import router as articles_router
from app.sources.router import router as sources_router
from app.auth.router import router as auth_router

# Configure structured logging for the entire app
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)


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
        headers={"User-Agent": "NewsAggregator/0.1"},
    ) as client:
        set_http_client(client)
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

# Register routers
app.include_router(articles_router)
app.include_router(sources_router)
app.include_router(auth_router)


@app.get("/health")
async def health_check():
    """Simple health check — returns 200 if the server is running."""
    return {"status": "ok"}
