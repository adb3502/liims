"""Async HTTP client for ODK Central OData API."""

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

PAGE_SIZE = 200


class OdkCentralClient:
    """Thin async wrapper around the ODK Central OData API."""

    def __init__(self, base_url: str, email: str, password: str):
        self.base_url = base_url.rstrip("/")
        self.email = email
        self.password = password
        self._token: str | None = None

    async def _authenticate(self) -> str:
        """Obtain a session token from ODK Central."""
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/v1/sessions",
                json={"email": self.email, "password": self.password},
            )
            resp.raise_for_status()
            self._token = resp.json()["token"]
            return self._token

    async def _get_token(self) -> str:
        if self._token is None:
            return await self._authenticate()
        return self._token

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Make an authenticated request, re-authenticating on 401."""
        token = await self._get_token()
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.request(
                method,
                url,
                headers={"Authorization": f"Bearer {token}"},
                **kwargs,
            )
            if resp.status_code == 401:
                # Token expired, re-authenticate
                token = await self._authenticate()
                resp = await client.request(
                    method,
                    url,
                    headers={"Authorization": f"Bearer {token}"},
                    **kwargs,
                )
            resp.raise_for_status()
            return resp

    async def get_submission_count(self, project_id: int, form_id: str) -> int:
        """Get total number of submissions for a form."""
        url = (
            f"{self.base_url}/v1/projects/{project_id}"
            f"/forms/{form_id}.svc/Submissions"
        )
        resp = await self._request("GET", url, params={"$top": 0, "$count": "true"})
        data = resp.json()
        return data.get("@odata.count", 0)

    async def get_submissions(
        self,
        project_id: int,
        form_id: str,
        skip: int = 0,
        top: int = PAGE_SIZE,
    ) -> list[dict[str, Any]]:
        """Fetch a page of submissions via OData."""
        url = (
            f"{self.base_url}/v1/projects/{project_id}"
            f"/forms/{form_id}.svc/Submissions"
        )
        resp = await self._request(
            "GET", url, params={"$skip": skip, "$top": top}
        )
        data = resp.json()
        return data.get("value", [])

    async def get_all_submissions(
        self, project_id: int, form_id: str
    ) -> list[dict[str, Any]]:
        """Fetch ALL submissions, paginating automatically."""
        total = await self.get_submission_count(project_id, form_id)
        logger.info("ODK Central reports %d total submissions", total)

        all_submissions: list[dict[str, Any]] = []
        skip = 0
        while skip < total:
            page = await self.get_submissions(project_id, form_id, skip=skip)
            if not page:
                break
            all_submissions.extend(page)
            skip += len(page)
            logger.info("  Fetched %d / %d submissions", len(all_submissions), total)

        return all_submissions
