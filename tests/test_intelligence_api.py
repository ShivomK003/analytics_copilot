"""Exercise FastAPI through ASGI directly without adding an HTTP client dependency."""

import asyncio
import json
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

from fastapi import FastAPI, Depends

from test_research_filters import filters, import_without_database

routes = import_without_database("app.routes.intelligence")
main = import_without_database("app.main")
from app.schemas.intelligence import CoverageData, CoverageResponse, IntelligenceMetadata, TopicsResponse


def request(app, path, query=""):
    """Perform a complete ASGI GET, including request validation and serialization."""
    async def run():
        messages = []
        async def receive():
            return {"type": "http.request", "body": b"", "more_body": False}
        async def send(message):
            messages.append(message)
        await app({"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": query.encode(), "headers": [], "client": ("test", 1), "server": ("test", 80), "root_path": ""}, receive, send)
        status = next(m["status"] for m in messages if m["type"] == "http.response.start")
        body = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
        return status, json.loads(body)
    return asyncio.run(run())


class IntelligenceApiTests(unittest.TestCase):
    def test_typed_coverage_serialization(self):
        data = CoverageData(total_indexed_papers=1, dated_papers=1, undated_papers=0, tagged_papers=0, untagged_papers=1, total_topics=2, observed_date_from=date(2026, 1, 1), observed_date_to=date(2026, 1, 1), latest_successful_etl_at=datetime(2026, 1, 2, tzinfo=timezone.utc))
        with patch.object(routes, "get_coverage", return_value=CoverageResponse(meta=IntelligenceMetadata(), data=data)):
            status, body = request(main.app, "/intelligence/coverage")
        self.assertEqual(status, 200)
        self.assertEqual(set(body), {"meta", "data"})
        self.assertEqual(body["data"]["observed_date_from"], "2026-01-01")
        self.assertEqual(body["data"]["latest_successful_etl_at"], "2026-01-02T00:00:00Z")
        self.assertEqual(body["meta"]["coverage_status"], "unknown")
        self.assertEqual(body["meta"]["timezone"], "UTC")

    def test_topics_optional_boundaries(self):
        for query, expected in [("", (None, None)), ("date_from=2026-01-01", (date(2026, 1, 1), None)), ("date_to=2026-01-02", (None, date(2026, 1, 2)))]:
            with self.subTest(query=query), patch.object(routes, "get_topic_options", return_value=TopicsResponse(meta=IntelligenceMetadata(), data=[])) as service:
                status, body = request(main.app, "/intelligence/topics", query)
                self.assertEqual(status, 200)
                self.assertEqual(body["data"], [])
                service.assert_called_once_with(*expected)

    def test_invalid_dates_return_422_before_query(self):
        for query in ["date_from=2026-1-01", "date_to=2026-02-30", "date_from=2026-01-03&date_to=2026-01-01", "date_to=9999-12-31", "date_from=2026-01-01T00:00:00Z"]:
            with self.subTest(query=query), patch.object(routes, "get_topic_options") as service:
                self.assertEqual(request(main.app, "/intelligence/topics", query)[0], 422)
                service.assert_not_called()

    def test_repeated_topic_dependency_without_production_endpoint(self):
        app = FastAPI()
        @app.get("/selection")
        def selection(ids=Depends(filters.analytical_topic_ids)):
            return {"ids": ids}
        with patch.object(filters, "fetch_all", return_value=[{"topic_id": 1}, {"topic_id": 2}]):
            self.assertEqual(request(app, "/selection", "topic_id=2&topic_id=1&topic_id=2"), (200, {"ids": [1, 2]}))
            for query in ["topic_id=-1", "topic_id=abc", "topic_id=0", "topic_id=3"]:
                self.assertEqual(request(app, "/selection", query)[0], 422)
        self.assertEqual(request(app, "/selection"), (200, {"ids": []}))

    def test_database_failures_return_generic_500(self):
        for path, function in [("coverage", "get_coverage"), ("topics", "get_topic_options")]:
            with patch.object(routes, function, side_effect=RuntimeError("secret connection detail")):
                status, body = request(main.app, f"/intelligence/{path}")
                self.assertEqual(status, 500)
                self.assertNotIn("secret", json.dumps(body))

    def test_existing_routes_and_response_models_remain_registered(self):
        paths = main.app.openapi()["paths"]
        for path in ["/", "/health", "/metrics", "/dashboard/home", "/topics/weekly", "/trends/daily", "/categories/topic-matrix", "/authors/search", "/authors/{author_id}", "/papers/search", "/papers/{paper_id}"]:
            self.assertIn(path, paths)
        self.assertEqual(paths["/intelligence/coverage"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"], "#/components/schemas/CoverageResponse")
        self.assertEqual(paths["/intelligence/topics"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"], "#/components/schemas/TopicsResponse")

    def test_existing_paper_route_contract(self):
        from app.routes import papers
        with patch.object(papers, "search_papers", return_value=[{"paper_id": "test"}]) as service:
            status, body = request(main.app, "/papers/search", "topic=llm&limit=2")
            self.assertEqual((status, body), (200, [{"paper_id": "test"}]))
            self.assertEqual(service.call_args.kwargs["topic"], "llm")
        with patch.object(papers, "get_paper_by_id", return_value=None):
            self.assertEqual(request(main.app, "/papers/missing")[0], 404)
