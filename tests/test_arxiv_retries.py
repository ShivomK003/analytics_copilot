from unittest.mock import MagicMock, patch

import requests

from etl.extract.ingest_arxiv import fetch_category


def test_arxiv_rate_limit_retry():
    """Verify that HTTP 429 triggers retries and eventually succeeds."""

    # Simulate an HTTP 429 response
    rate_limited_response = requests.Response()
    rate_limited_response.status_code = 429
    rate_limited_response.url = "https://export.arxiv.org/api/query"
    rate_limited_response._content = b"Too Many Requests"

    # Simulate a successful response containing an empty Atom feed
    successful_response = requests.Response()
    successful_response.status_code = 200
    successful_response._content = b"""
        <?xml version="1.0" encoding="UTF-8"?>
        <feed
            xmlns="http://www.w3.org/2005/Atom"
            xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/"
        >
            <title>arXiv Query Results</title>
            <opensearch:totalResults>0</opensearch:totalResults>
            <opensearch:startIndex>0</opensearch:startIndex>
            <opensearch:itemsPerPage>100</opensearch:itemsPerPage>
        </feed>
    """.strip()

    # First two requests fail, third succeeds
    mock_session = MagicMock()
    mock_session.get.side_effect = [
        rate_limited_response,
        rate_limited_response,
        successful_response,
    ]

    # Prevent actual waiting during tests
    with patch("etl.extract.ingest_arxiv.time.sleep") as mock_sleep:
        papers = fetch_category(
            category="cs.AI",
            session=mock_session,
        )

    # Verify three HTTP requests were made
    assert mock_session.get.call_count == 3

    # Verify exponential backoff
    assert mock_sleep.call_count == 2
    assert mock_sleep.call_args_list[0].args[0] == 30
    assert mock_sleep.call_args_list[1].args[0] == 60

    # Empty feed is valid; request itself succeeded
    assert papers == []
    assert fetch_category.last_request_succeeded is True


def test_arxiv_rate_limit_exhausted():
    """Verify that repeated HTTP 429 responses mark extraction as failed."""

    rate_limited_response = requests.Response()
    rate_limited_response.status_code = 429
    rate_limited_response.url = "https://export.arxiv.org/api/query"
    rate_limited_response._content = b"Too Many Requests"

    mock_session = MagicMock()
    mock_session.get.return_value = rate_limited_response

    with patch("etl.extract.ingest_arxiv.time.sleep") as mock_sleep:
        papers = fetch_category(
            category="cs.AI",
            session=mock_session,
        )

    assert mock_session.get.call_count == 4
    assert mock_sleep.call_count == 3
    assert [call.args[0] for call in mock_sleep.call_args_list] == [
        30,
        60,
        120,
    ]

    assert papers == []
    assert fetch_category.last_request_succeeded is False