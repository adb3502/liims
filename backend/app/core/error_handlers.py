"""Global exception handlers for FastAPI.

Catches all unhandled exceptions and returns structured error responses.
Internal details (stack traces, DB errors) are suppressed in production.
"""

import logging
import traceback

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings

logger = logging.getLogger(__name__)


def _error_response(
    status_code: int,
    code: str,
    message: str,
    details: list | None = None,
) -> JSONResponse:
    body: dict = {
        "success": False,
        "error": {
            "code": code,
            "message": message,
        },
    }
    if details:
        body["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=body)


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Handle FastAPI/Starlette HTTPException."""
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return _error_response(
        status_code=exc.status_code,
        code=f"HTTP_{exc.status_code}",
        message=detail,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Handle Pydantic / request validation errors."""
    details = []
    for err in exc.errors():
        loc = " -> ".join(str(l) for l in err.get("loc", []))
        details.append({
            "field": loc,
            "message": err.get("msg", "Invalid value"),
            "type": err.get("type", "value_error"),
        })
    return _error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        code="VALIDATION_ERROR",
        message="Request validation failed. Check the details for specific field errors.",
        details=details,
    )


async def value_error_handler(
    request: Request, exc: ValueError
) -> JSONResponse:
    """Handle ValueError raised by service layer for business-rule violations."""
    return _error_response(
        status_code=status.HTTP_400_BAD_REQUEST,
        code="BAD_REQUEST",
        message=str(exc),
    )


async def sqlalchemy_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Handle SQLAlchemy errors without leaking internal details."""
    logger.error(
        "Database error on %s %s: %s",
        request.method,
        request.url.path,
        exc,
        exc_info=True,
    )
    message = "A database error occurred. Please try again later."
    if settings.DEBUG:
        message = f"Database error: {exc}"
    return _error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="DATABASE_ERROR",
        message=message,
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """Catch-all for unhandled exceptions. Logs full traceback."""
    logger.error(
        "Unhandled exception on %s %s:\n%s",
        request.method,
        request.url.path,
        traceback.format_exc(),
    )
    message = "An unexpected error occurred. Please try again later."
    if settings.DEBUG:
        message = f"Internal error: {exc}"
    return _error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        code="INTERNAL_ERROR",
        message=message,
    )


def register_error_handlers(app: FastAPI) -> None:
    """Register all global exception handlers on the FastAPI app."""
    from sqlalchemy.exc import SQLAlchemyError

    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(ValueError, value_error_handler)
    app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
