"""
Centralized logging configuration.

Two modes controlled by settings.log_format:
- "json" (default, production): Structured JSON via python-json-logger
- "text" (local dev): Human-readable colored output

Usage:
    from app.logging_config import setup_logging
    setup_logging()  # Call once at app startup
"""

import logging
import sys

from pythonjsonlogger.json import JsonFormatter


def setup_logging() -> None:
    """Configure logging for the entire application.

    Reads LOG_FORMAT from settings to choose between JSON and text output.
    Also configures uvicorn loggers to use the same format.
    """
    from app.config import settings

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    # Remove any existing handlers (prevents duplicates on reload)
    root.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)

    if settings.log_format == "text":
        handler.setFormatter(logging.Formatter(
            "%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
            datefmt="%H:%M:%S",
        ))
    else:
        handler.setFormatter(JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            timestamp=True,
            rename_fields={"asctime": "timestamp", "levelname": "level"},
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
