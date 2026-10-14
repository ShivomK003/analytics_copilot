"""Mock-only retry and run-wide pacing checks; no arXiv traffic or real waits."""

from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import pytest
import requests

from etl.extract import ingest_arxiv as ingest


class FakeClock:
    """Advance monotonic time only through mocked sleeps or simulated request latency."""

    def __init__(self):
        self.now = 0.0
        self.sleeps = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        assert 0 <= seconds <= ingest.MAX_RETRY_DELAY_SECONDS
        self.sleeps.append(seconds)
        self.now += seconds


@pytest.fixture
def clock(monkeypatch):
    value = FakeClock()
    monkeypatch.setattr(ingest.time, 'monotonic', value.monotonic)
    monkeypatch.setattr(ingest.time, 'sleep', value.sleep)
    monkeypatch.setattr(ingest.random, 'uniform', lambda a, b: 0.0)
    return value


def response(status=200, retry_after=None, start=0, total=0, ids=()):
    """Build real requests.Response objects containing valid Atom pagination metadata."""
    result = requests.Response()
    result.status_code = status
    result.url = ingest.ARXIV_API_URL
    if retry_after is not None:
        result.headers['Retry-After'] = retry_after
    entries = ''.join(f'<entry><id>https://arxiv.org/abs/{value}</id><title>Paper</title><summary>Abstract</summary><published>2026-10-14T00:00:00Z</published><updated>2026-10-14T00:00:00Z</updated></entry>' for value in ids)
    result._content = f'''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/">
    <opensearch:totalResults>{total}</opensearch:totalResults>
    <opensearch:startIndex>{start}</opensearch:startIndex>{entries}</feed>'''.encode()
    return result


@pytest.mark.parametrize('status', [429, 500, 502, 503, 504])
def test_transient_status_followed_by_success(clock, status, caplog):
    session = MagicMock()
    session.get.side_effect = [response(status), response()]
    assert ingest.fetch_category('cs.AI', session=session) == []
    assert ingest.fetch_category.last_request_succeeded
    assert session.get.call_count == 2
    expected = 30 if status == 429 else 3
    assert clock.sleeps == [expected]
    assert f'status={status}' in caplog.text
    assert 'category=cs.AI offset=0' in caplog.text
    assert f'delay={expected:.3f}s' in caplog.text


def test_rate_limit_exponential_exhaustion(clock, caplog):
    session = MagicMock()
    session.get.return_value = response(429)
    assert ingest.fetch_category('cs.LG', session=session, start=20) == []
    assert not ingest.fetch_category.last_request_succeeded
    assert ingest.fetch_category.last_total_results == -1
    assert session.get.call_count == 4
    assert clock.sleeps == [30, 60, 120]
    assert 'retries exhausted category=cs.LG offset=20 status=429 attempts=4' in caplog.text


@pytest.mark.parametrize('status', [400, 401, 403, 404, 501])
def test_nonretryable_status_fails_immediately(clock, status):
    session = MagicMock()
    session.get.return_value = response(status)
    assert ingest.fetch_category('cs.AI', session=session) == []
    assert session.get.call_count == 1
    assert clock.sleeps == []
    assert not ingest.fetch_category.last_request_succeeded


@pytest.mark.parametrize('failure', [requests.ConnectionError, requests.ReadTimeout, requests.ConnectTimeout, requests.Timeout])
def test_connection_failures_and_timeouts(clock, failure):
    session = MagicMock()
    session.get.side_effect = [failure('transient'), response()]
    ingest.fetch_category('cs.AI', session=session)
    assert ingest.fetch_category.last_request_succeeded
    assert clock.sleeps == [3]


def test_numeric_retry_after_is_lower_bound(clock):
    session = MagicMock()
    session.get.side_effect = [response(503, '17'), response()]
    ingest.fetch_category('cs.AI', session=session)
    assert clock.sleeps == [17]


@pytest.mark.parametrize('header_kind', ['standard', 'asctime', 'past'])
def test_http_date_retry_after(clock, header_kind):
    now = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)
    target = now + timedelta(seconds=-20 if header_kind == 'past' else 19)
    header = target.strftime('%a %b %d %H:%M:%S %Y') if header_kind == 'asctime' else format_datetime(target, usegmt=True)
    session = MagicMock()
    session.get.side_effect = [response(503, header), response()]
    with patch.object(ingest, 'datetime', wraps=datetime) as dates:
        dates.now.return_value = now
        ingest.fetch_category('cs.AI', session=session)
    assert clock.sleeps == [3 if header_kind == 'past' else 19]


@pytest.mark.parametrize('header', ['garbage', 'NaN', 'inf', '-1', ''])
def test_invalid_retry_after_uses_bounded_backoff(clock, header):
    session = MagicMock()
    session.get.side_effect = [response(503, header), response()]
    ingest.fetch_category('cs.AI', session=session)
    assert clock.sleeps == [3]


def test_long_server_cooldown_fails_without_early_retry(clock, caplog):
    session = MagicMock()
    session.get.return_value = response(429, '121')
    ingest.fetch_category('cs.AI', session=session)
    assert session.get.call_count == 1
    assert clock.sleeps == []
    assert not ingest.fetch_category.last_request_succeeded
    assert 'no early retry' in caplog.text


def test_positive_jitter_is_capped(clock, monkeypatch):
    monkeypatch.setattr(ingest.random, 'uniform', lambda a, b: b)
    session = MagicMock()
    session.get.return_value = response(429)
    ingest.fetch_category('cs.AI', session=session)
    assert clock.sleeps == [37.5, 75, 120]


def test_pagination_and_categories_share_spacing_without_extra_backoff(clock):
    session = MagicMock()
    attempts = []
    outcomes = iter([response(503), response(start=0, total=2, ids=['a']), response(start=1, total=2, ids=['b']), response()])
    def get(*args, **kwargs):
        attempts.append(clock.now)
        return next(outcomes)
    session.get.side_effect = get
    with ingest.arxiv_request_run():
        papers = ingest.fetch_category_backfill('cs.AI', '202610010000', '202610142359', session=session, page_size=1)
        ingest.fetch_category_backfill('cs.LG', '202610010000', '202610142359', session=session)
    assert [p['paper_id'] for p in papers] == ['a', 'b']
    assert attempts == [0, 3, 6, 9]
    assert clock.sleeps == [3, 3, 3]
    offsets = [parse_qs(urlparse(c.args[0]).query)['start'][0] for c in session.get.call_args_list]
    assert offsets == ['0', '0', '1', '0']


def test_backoff_already_satisfies_minimum_interval(clock):
    session = MagicMock()
    times = []
    def get(*args, **kwargs):
        times.append(clock.now)
        return response(429) if len(times) == 1 else response()
    session.get.side_effect = get
    ingest.fetch_category('cs.AI', session=session)
    assert times == [0, 30]
    assert clock.sleeps == [30]


def test_request_duration_can_satisfy_spacing_and_runs_reset(clock):
    session = MagicMock()
    def get(*args, **kwargs):
        clock.now += 5
        return response()
    session.get.side_effect = get
    with ingest.arxiv_request_run():
        ingest.fetch_category('cs.AI', session=session)
        ingest.fetch_category('cs.LG', session=session)
    ingest.fetch_category('cs.AI', session=session)
    assert clock.sleeps == []
    assert ingest._REQUEST_PACER.get() is None


def test_failed_pagination_page_still_aborts_category(clock):
    session = MagicMock()
    session.get.side_effect = [response(total=2, ids=['a'])] + [response(503)] * 4
    with pytest.raises(RuntimeError, match='Backfill failed for cs.AI at offset 1'):
        ingest.fetch_category_backfill('cs.AI', '202610010000', '202610142359', session=session, page_size=1)
    assert session.get.call_count == 5
    assert ingest._REQUEST_PACER.get() is None


def test_incomplete_daily_extraction_never_publishes(clock, tmp_path, monkeypatch):
    session = MagicMock()
    session.get.return_value = response(503)
    session.__enter__.return_value = session
    monkeypatch.setattr(ingest.requests, 'Session', lambda: session)
    output = tmp_path / 'raw.csv'
    monkeypatch.setattr(ingest, 'OUTPUT_PATH', output)
    with pytest.raises(RuntimeError, match='Daily extraction incomplete: 2/2'):
        ingest.extract_arxiv_data(categories=['cs.AI', 'cs.LG'])
    assert session.get.call_count == 8
    assert not output.exists()


def test_historical_entry_point_shares_pacing_across_categories(clock, tmp_path, monkeypatch):
    """Actual backfill orchestration retains one pacer and the existing public arguments."""
    import inspect
    from etl import run_backfill
    session = MagicMock()
    session.__enter__.return_value = session
    times = []
    def get(*args, **kwargs):
        times.append(clock.now)
        return response(total=1, ids=[f'paper{len(times)}'])
    session.get.side_effect = get
    monkeypatch.setattr(ingest.requests, 'Session', lambda: session)
    monkeypatch.setattr(run_backfill, 'ARXIV_CATEGORIES', ['cs.AI', 'cs.LG'])
    monkeypatch.setattr(run_backfill, 'BACKFILL_DIR', tmp_path)
    monkeypatch.setattr(run_backfill, 'transform_arxiv_data', lambda **kwargs: {})
    monkeypatch.setattr(run_backfill, 'validate_arxiv_data', lambda **kwargs: {'status': 'PASS'})
    monkeypatch.setattr(run_backfill, 'build_warehouse_tables', lambda **kwargs: {})
    result = run_backfill.run_backfill('202610010000', '202610142359')
    assert result['unique_papers'] == 2
    assert times == [0, 3]
    assert clock.sleeps == [3]
    assert ingest._REQUEST_PACER.get() is None
    assert list(inspect.signature(run_backfill.run_backfill).parameters) == ['date_from', 'date_to', 'page_size', 'max_pages']


def test_http_retry_exhaustion_marks_pipeline_failed_without_loading(clock, tmp_path, monkeypatch):
    """Real extractor failure reaches pipeline FAILED metadata with every downstream stage mocked."""
    from etl import run_pipeline
    session = MagicMock()
    session.__enter__.return_value = session
    session.get.return_value = response(503)
    monkeypatch.setattr(ingest.requests, 'Session', lambda: session)
    monkeypatch.setattr(ingest, 'ARXIV_CATEGORIES', ['cs.AI'])
    monkeypatch.setattr(ingest, 'OUTPUT_PATH', tmp_path / 'raw.csv')
    with (
        patch.object(run_pipeline, 'ensure_directories'),
        patch.object(run_pipeline, 'validate_environment'),
        patch.object(run_pipeline, 'setup_logging', return_value=MagicMock()),
        patch.object(run_pipeline, 'get_conn', return_value=MagicMock()),
        patch.object(run_pipeline, 'start_etl_run', return_value='mock-run'),
        patch.object(run_pipeline, 'finish_etl_run') as finish,
        patch.object(run_pipeline, 'transform_arxiv_data') as transform,
        patch.object(run_pipeline, 'validate_arxiv_data') as validate,
        patch.object(run_pipeline, 'build_warehouse_tables') as warehouse,
        patch.object(run_pipeline, 'load_to_supabase') as load,
        pytest.raises(RuntimeError, match='Daily extraction incomplete'),
    ):
        run_pipeline.run_pipeline()
    finish.assert_called_once()
    assert finish.call_args.args[5] == 'FAILED'
    for stage in [transform, validate, warehouse, load]:
        stage.assert_not_called()
    assert not (tmp_path / 'raw.csv').exists()


def test_over_budget_retry_after_blocks_later_categories_in_same_run(clock):
    """Changing category must not evade a server cooldown larger than our sleep budget."""
    session = MagicMock()
    session.get.return_value = response(503, '121')
    with ingest.arxiv_request_run():
        ingest.fetch_category('cs.AI', session=session)
        ingest.fetch_category('cs.LG', session=session)
    assert session.get.call_count == 1
    assert clock.sleeps == []
    assert not ingest.fetch_category.last_request_succeeded


def test_final_failure_retry_after_is_preserved_for_next_category(clock):
    """Retry exhaustion must not lose the last response's cooldown before a category transition."""
    session = MagicMock()
    outcomes = iter([response(503, '17')] * 4 + [response()])
    times = []
    def get(*args, **kwargs):
        times.append(clock.now)
        return next(outcomes)
    session.get.side_effect = get
    with ingest.arxiv_request_run():
        ingest.fetch_category('cs.AI', session=session)
        assert not ingest.fetch_category.last_request_succeeded
        ingest.fetch_category('cs.LG', session=session)
    assert times == [0,17,34,51,68]
    assert clock.sleeps == [17,17,17,17]
    assert ingest.fetch_category.last_request_succeeded
