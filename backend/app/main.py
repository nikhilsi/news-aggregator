import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.articles.service import set_http_client
from app.sources.registry import load_sources
from app.articles.router import router as articles_router
from app.sources.router import router as sources_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources on startup, clean up on shutdown."""
    await init_db()
    load_sources()

    # Shared HTTP client for all outbound requests (connection pooling)
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(articles_router)
app.include_router(sources_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
