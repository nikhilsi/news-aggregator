"""
Centralized logging configuration.

Human-readable text format for all environments.

Usage:
    from app.logging_config import setup_logging
    setup_logging()  # Call once at app startup
"""

import logging
import sys


def setup_logging() -> None:
    """Configure logging for the entire application."""
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Remove any existing handlers (prevents duplicates on reload)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        "%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    ))

    root.addHandler(handler)

    # Route uvicorn loggers through our handler
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(name)
        uv_logger.handlers.clear()
        uv_logger.propagate = True

    # Suppress noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
