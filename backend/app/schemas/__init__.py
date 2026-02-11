"""Shared schema utilities."""

from pydantic import BaseModel


class APIResponse(BaseModel):
    """Standard API response wrapper."""
    success: bool = True
    data: dict | list | None = None
    meta: dict | None = None
    error: dict | None = None


class PaginationMeta(BaseModel):
    page: int
    per_page: int
    total: int
    total_pages: int
