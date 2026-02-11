"""Schemas for the query builder endpoints."""

from pydantic import BaseModel, Field


class QueryFilter(BaseModel):
    field: str = Field(min_length=1, max_length=100)
    operator: str = Field(min_length=1, max_length=20)
    value: str | int | float | bool | list | None = None


class QueryRequest(BaseModel):
    entity: str = Field(min_length=1, max_length=50)
    filters: list[QueryFilter] = []
    columns: list[str] | None = None
    sort_by: str | None = None
    sort_order: str = Field("desc", pattern="^(asc|desc)$")
    page: int = Field(1, ge=1)
    per_page: int = Field(50, ge=1, le=1000)


class QueryExportRequest(BaseModel):
    entity: str = Field(min_length=1, max_length=50)
    filters: list[QueryFilter] = []
    columns: list[str] | None = None
    sort_by: str | None = None
    sort_order: str = Field("desc", pattern="^(asc|desc)$")


class EntityFieldInfo(BaseModel):
    name: str
    type: str


class EntityInfo(BaseModel):
    entity: str
    fields: list[EntityFieldInfo]
    default_sort: str
