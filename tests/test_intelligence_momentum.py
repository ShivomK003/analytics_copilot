"""Phase 1B unit, API, and opt-in read-only production SQL fixture checks."""

import os
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from test_intelligence_api import main, request, routes
import test_intelligence_service as foundation_tests

service = foundation_tests.service
from test_research_filters import filters
from app.schemas.intelligence import ReportingInterval

UTC = timezone.utc
BOUNDS = dict(observed_date_from=date(2025, 12, 29), observed_date_to=date(2026, 2, 2), undated_papers=0)


def weekly_rows(counts, first=date(2025, 12, 29)):
    """Represent SQL result rows for unit tests of clipping and index calculations."""
    return [dict(topic_id=topic_id, topic_name=f"topic{topic_id}", week_start=first + timedelta(weeks=i), paper_count=count)
            for topic_id, values in counts.items() for i, count in enumerate(values)]


class MomentumUnitTests(unittest.TestCase):
    def momentum(self, rows, start=date(2026, 1, 1), end=date(2026, 1, 23), **kwargs):
        """Run post-query behavior against controlled bounds and aggregation rows."""
        with patch.object(service, "fetch_one", return_value=BOUNDS), patch.object(service, "fetch_all", return_value=rows):
            return service.get_momentum(start, end, **kwargs)

    def test_partial_bounds_and_full_week_index(self):
        """The first full week, rather than a clipped first week, supplies the baseline."""
        result = self.momentum(weekly_rows({1: [1, 2, 3, 4]}), mode="index")
        topic = result.data.topics[0]
        self.assertEqual(topic.baseline_week_start, date(2026, 1, 5))
        self.assertEqual(topic.baseline_count, 2)
        self.assertEqual([p.index_value for p in topic.points], [50, 100, 150, 200])
        self.assertEqual([p.is_partial_week for p in topic.points], [True, False, False, True])
        self.assertEqual(topic.points[0].week_start, date(2025, 12, 29))
        self.assertEqual(topic.points[0].effective_start, datetime(2026, 1, 1, tzinfo=UTC))
        self.assertEqual(topic.points[-1].effective_end_exclusive, datetime(2026, 1, 24, tzinfo=UTC))
        self.assertEqual(topic.points[-1].week_end_exclusive, date(2026, 1, 26))

    def test_partial_exclusion_and_raw_count_mode(self):
        """Excluding partial weeks neither rescales full weeks nor supplies count-mode indices."""
        result = self.momentum(weekly_rows({1: [1, 2, 0, 4]}), include_partial_weeks=False)
        topic = result.data.topics[0]
        self.assertEqual([p.paper_count for p in topic.points], [2, 0])
        self.assertTrue(all(not p.is_partial_week and p.index_value is None for p in topic.points))
        self.assertIsNone(topic.baseline_count)

    def test_zero_baseline_does_not_move_forward(self):
        """A later nonzero observation cannot replace the first full zero baseline."""
        result = self.momentum(weekly_rows({1: [3, 0, 4, 2], 2: [0, 2, 0, 1]}), mode="index")
        self.assertEqual(result.data.topics[0].baseline_count, 0)
        self.assertTrue(all(p.index_value is None for p in result.data.topics[0].points))
        self.assertEqual(result.data.topics[1].baseline_count, 2)

    def test_no_full_week_baseline(self):
        """Short clipped intervals retain raw counts with no invented baseline."""
        result = self.momentum(weekly_rows({1: [1]}), end=date(2026, 1, 2), mode="index")
        topic = result.data.topics[0]
        self.assertIsNone(topic.baseline_week_start)
        self.assertIsNone(topic.baseline_count)
        self.assertIsNone(topic.points[0].index_value)
        self.assertTrue(any("no full baseline" in w for w in result.meta.warnings))

    def test_maximum_calendar_limit(self):
        """Exactly 104 intersecting weeks are allowed; a 105th is rejected before SQL generation."""
        self.momentum([], date(2024, 1, 1), date(2025, 12, 28))
        with self.assertRaises(service.AnalyticalWindowError):
            self.momentum([], date(2024, 1, 1), date(2025, 12, 29))

    def test_empty_corpus_does_not_invent_calendar(self):
        """Configured options survive without fabricated dates or observations."""
        empty = dict(observed_date_from=None, observed_date_to=None, undated_papers=0)
        with patch.object(service, "fetch_one", return_value=empty), patch.object(service, "fetch_all", return_value=[dict(topic_id=1, topic_name="zero")]):
            result = service.get_momentum(mode="index")
        self.assertIsNone(result.data.interval.date_from)
        self.assertEqual(result.data.topics[0].points, [])
        self.assertEqual(result.meta.coverage_status, "unknown")
        self.assertTrue(any("No dated" in w for w in result.meta.warnings))

    def test_outside_observed_interval_is_disclosed(self):
        """Explicit external dates are preserved and do not establish verified inactivity."""
        result = self.momentum(weekly_rows({1: [0]}, date(2027, 1, 4)), date(2027, 1, 4), date(2027, 1, 10))
        self.assertEqual(result.data.topics[0].points[0].paper_count, 0)
        self.assertTrue(any("outside observed" in w for w in result.meta.warnings))

    def test_missing_sides_resolve_to_corpus_bounds(self):
        """Only omitted boundaries are inferred from observations; explicit dates are retained."""
        with patch.object(service, "fetch_one", return_value=BOUNDS), patch.object(service, "fetch_all", return_value=[]):
            for start, end in [(None, None), (date(2026, 1, 1), None), (None, date(2026, 1, 25))]:
                result = service.get_momentum(start, end)
                self.assertEqual(result.data.interval.date_from, start or BOUNDS['observed_date_from'])
                self.assertEqual(result.data.interval.date_to, end or BOUNDS['observed_date_to'])


class MatrixUnitTests(unittest.TestCase):
    def test_adjacent_equal_contained_windows(self):
        """Selected Sunday ends yield adjacent full windows ending the following Monday."""
        previous, recent = service._comparison_windows(ReportingInterval(date_from=date(2026, 1, 5), date_to=date(2026, 2, 1)), 2, datetime(2026, 3, 1, tzinfo=UTC))
        self.assertEqual(previous.start, datetime(2026, 1, 5, tzinfo=UTC))
        self.assertEqual(previous.end_exclusive, recent.start)
        self.assertEqual(recent.end_exclusive, datetime(2026, 2, 2, tzinfo=UTC))
        self.assertEqual(previous.end_exclusive-previous.start, timedelta(weeks=2))
        self.assertEqual(recent.end_exclusive-recent.start, timedelta(weeks=2))

    def test_current_incomplete_week_is_excluded(self):
        """A future date_to cannot include any part of the current unfinished UTC week."""
        _, recent = service._comparison_windows(ReportingInterval(date_from=date(2026, 1, 1), date_to=date(2026, 12, 31)), 4, datetime(2026, 10, 14, 13, tzinfo=UTC))
        self.assertEqual(recent.end_exclusive, datetime(2026, 10, 12, tzinfo=UTC))

    def test_short_or_misaligned_interval_rejected(self):
        """Window construction never expands beyond an insufficient selected range."""
        for start, end in [(date(2026, 1, 6), date(2026, 2, 1)), (date(2026, 1, 5), date(2026, 1, 31))]:
            with self.subTest(start=start), self.assertRaises(service.AnalyticalWindowError):
                service._comparison_windows(ReportingInterval(date_from=start, date_to=end), 2, datetime(2026, 3, 1, tzinfo=UTC))

    def test_growth_states_and_threshold(self):
        """Positive, negative, stable and absent baselines have explicit descriptive states."""
        counts = [(2, 3), (2, 1), (2, 2), (0, 3), (0, 0), (10, 10)]
        rows = [dict(topic_id=i+1, topic_name=str(i), previous_paper_count=a, recent_paper_count=b, period_paper_count=a+b, total_indexed_paper_count=a+b+1) for i, (a, b) in enumerate(counts)]
        with patch.object(service, "fetch_one", return_value=BOUNDS), patch.object(service, "fetch_all", return_value=rows):
            result = service.get_momentum_matrix(date(2026, 1, 5), date(2026, 2, 1), window_weeks=2)
        self.assertEqual([t.growth_state for t in result.data.topics], ['growing','declining','stable','no_baseline','no_baseline','stable'])
        self.assertEqual([t.growth_percent for t in result.data.topics], [50,-50,0,None,None,0])
        self.assertEqual([t.absolute_change for t in result.data.topics], [1,-1,0,3,0,0])
        self.assertEqual([t.low_baseline for t in result.data.topics], [True]*5+[False])

    def test_empty_unresolved_matrix(self):
        """An unresolved empty corpus exposes no invented comparison windows."""
        with patch.object(service, 'fetch_one', return_value=dict(observed_date_from=None, observed_date_to=None, undated_papers=0)), patch.object(service, 'fetch_all', return_value=[]):
            result = service.get_momentum_matrix()
        self.assertIsNone(result.data.previous_window)
        self.assertIsNone(result.data.recent_window)
        self.assertEqual(result.data.topics, [])


class MomentumApiTests(unittest.TestCase):
    def test_invalid_parameters_and_unknown_topics(self):
        """Shared dependencies and route types reject invalid input before service calls."""
        for path, queries in [('momentum', ['mode=bad', 'include_partial_weeks=bad']), ('momentum-matrix', ['window_weeks=1','window_weeks=13','window_weeks=2.5'])]:
            for query in queries+['topic_id=-1','topic_id=abc','date_from=2026-02-30']:
                with self.subTest(path=path, query=query):
                    self.assertEqual(request(main.app, '/intelligence/'+path, query)[0], 422)
            with patch.object(filters, 'fetch_all', return_value=[]):
                self.assertEqual(request(main.app, '/intelligence/'+path, 'topic_id=999')[0], 422)

    def test_duplicate_topic_selection_and_typed_serialization(self):
        """Repeated selections are normalized before execution and serialize typed envelopes."""
        empty = dict(observed_date_from=None, observed_date_to=None, undated_papers=0)
        with patch.object(filters, 'fetch_all', return_value=[dict(topic_id=1),dict(topic_id=2)]), patch.object(service, 'fetch_one', return_value=empty), patch.object(service, 'fetch_all', return_value=[]):
            for path, function in [('momentum','get_momentum'), ('momentum-matrix','get_momentum_matrix')]:
                with patch.object(routes, function, wraps=getattr(service, function)) as call:
                    status, body = request(main.app, '/intelligence/'+path, 'topic_id=2&topic_id=1&topic_id=2')
                    self.assertEqual(status, 200)
                    self.assertEqual(call.call_args.args[2], [1,2])
                    self.assertEqual(body['meta']['coverage_status'], 'unknown')
        schema = main.app.openapi()['paths']
        for path, model in [('momentum','MomentumResponse'),('momentum-matrix','MomentumMatrixResponse')]:
            self.assertEqual(schema['/intelligence/'+path]['get']['responses']['200']['content']['application/json']['schema']['$ref'], '#/components/schemas/'+model)
        for path in ['/intelligence/coverage','/intelligence/topics','/papers/search','/authors/search','/dashboard/home']:
            self.assertIn(path, schema)

    def test_service_errors_are_classified_without_leaks(self):
        """Only analytical-window errors are client errors; unexpected failures remain generic 500."""
        for path, function in [('momentum','get_momentum'), ('momentum-matrix','get_momentum_matrix')]:
            for error, expected in [(service.AnalyticalWindowError('interval too short'),422), (RuntimeError('secret database detail'),500), (ValueError('unexpected invalid database data'),500)]:
                with patch.object(routes,function,side_effect=error):
                    status, body = request(main.app,'/intelligence/'+path)
                    self.assertEqual(status,expected)
                    if expected == 500:
                        self.assertNotIn('secret', str(body))
                        self.assertNotIn('unexpected', str(body))


# Synthetic duplicate pairs intentionally exercise DISTINCT. Real paper_topics
# normally forbids repeated pairs through its (paper_id, topic_id) primary key.
FIXTURES = """
fact_papers(paper_id,published_date) as (values
 ('a','2026-01-05 00:00:00+00'::timestamptz),
 ('b','2026-01-18 23:59:59.999999+00'::timestamptz),
 ('c','2026-01-19 00:00:00+00'::timestamptz),
 ('d','2026-01-25 12:00:00+00'::timestamptz),
 ('e','2026-02-01 23:59:59.999999+00'::timestamptz),
 ('f','2026-02-02 00:00:00+00'::timestamptz),
 ('z','2026-01-04 23:59:59+00'::timestamptz), ('u',null::timestamptz)
),
dim_topic(topic_id,topic_name) as (values
 (1,'growing'),(2,'declining'),(3,'stable'),(4,'no_baseline'),(5,'zero')),
paper_topics(paper_id,topic_id) as (values
 ('a',1),('a',1),('b',1),('c',1),('d',1),('e',1),('f',1),('z',1),('u',1),
 ('a',2),('b',2),('c',2),('a',3),('c',3),('c',4))
"""


@unittest.skipUnless(os.getenv('INTELLIGENCE_SQL_TESTS') == '1', 'Opt-in read-only PostgreSQL fixture tests')
class MomentumSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Reuse Phase 1A's explicitly read-only connection setup."""
        foundation_tests.IntelligenceSqlTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        """Roll back and close the shared fixture connection."""
        foundation_tests.IntelligenceSqlTests.tearDownClass.__func__(cls)

    def query(self, query, params=None, all_rows=False):
        """Shadow production table references with CTE fixtures, without any writes."""
        fixtures = FIXTURES
        if getattr(self, 'empty_corpus', False):
            fixtures = fixtures.replace(
                'fact_papers(paper_id,published_date) as',
                'fixture_papers(paper_id,published_date) as',
            )
            fixtures += ', fact_papers as (select * from fixture_papers where false)'
        if 'with selected_topics' in query:
            query = query.replace('with selected_topics', f'with {fixtures}, selected_topics',1)
        else:
            query = f'with {fixtures} {query}'
        with self.conn.cursor() as cursor:
            cursor.execute(query,params)
            return [dict(r) for r in cursor.fetchall()] if all_rows else dict(cursor.fetchone())

    def execute_service(self, function, *args, **kwargs):
        """Execute all production service SQL against fixture rows."""
        with patch.object(service,'fetch_one',side_effect=self.query), patch.object(service,'fetch_all',side_effect=lambda q,p=None: self.query(q,p,True)):
            return function(*args, **kwargs)

    def test_weekly_distinct_zero_filling_and_overlap(self):
        """Continuous topic grids retain zero weeks and count overlapping papers once per topic."""
        result = self.execute_service(service.get_momentum,date(2026,1,5),date(2026,2,1))
        topics = {t.topic_name:t for t in result.data.topics}
        self.assertEqual([p.paper_count for p in topics['growing'].points], [1,1,2,1])
        self.assertEqual([p.paper_count for p in topics['zero'].points], [0,0,0,0])
        self.assertEqual(topics['declining'].points[0].paper_count,1)
        self.assertTrue(all(len(t.points)==4 for t in topics.values()))
        self.assertTrue(all(p.week_start.weekday()==0 for t in topics.values() for p in t.points))

    def test_clipped_first_final_week_and_selection(self):
        """Clipping happens before aggregation and duplicate selections never duplicate series."""
        result = self.execute_service(service.get_momentum,date(2026,1,6),date(2026,1,31),[1,1])
        self.assertEqual(len(result.data.topics),1)
        points = result.data.topics[0].points
        self.assertEqual([p.paper_count for p in points], [0,1,2,0])
        self.assertEqual([p.is_partial_week for p in points], [True,False,False,True])
        full = self.execute_service(service.get_momentum,date(2026,1,6),date(2026,1,31),[1],include_partial_weeks=False)
        self.assertEqual([p.paper_count for p in full.data.topics[0].points],[1,2])

    def test_index_full_baseline_and_zero_baseline(self):
        """Raw production counts feed a fixed full-week index baseline without moving zeros."""
        result = self.execute_service(service.get_momentum,date(2026,1,5),date(2026,2,1),mode='index')
        topics = {t.topic_name:t for t in result.data.topics}
        self.assertEqual([p.index_value for p in topics['growing'].points],[100,100,200,100])
        self.assertEqual(topics['no_baseline'].baseline_count,0)
        self.assertTrue(all(p.index_value is None for p in topics['no_baseline'].points))

    def test_matrix_metrics_and_lifetime_independence(self):
        """All growth states derive from adjacent distinct counts; lifetime includes undated/outside IDs."""
        result = self.execute_service(service.get_momentum_matrix,date(2026,1,5),date(2026,2,1),window_weeks=2)
        topics = {t.topic_name:t for t in result.data.topics}
        self.assertEqual((topics['growing'].previous_paper_count,topics['growing'].recent_paper_count),(2,3))
        self.assertEqual(topics['growing'].growth_percent,50)
        self.assertEqual(topics['declining'].growth_percent,-50)
        self.assertEqual(topics['stable'].growth_state,'stable')
        self.assertEqual(topics['no_baseline'].growth_state,'no_baseline')
        self.assertIsNone(topics['zero'].growth_percent)
        self.assertEqual(topics['growing'].period_paper_count,5)
        self.assertEqual(topics['growing'].total_indexed_paper_count,8)
        other = self.execute_service(service.get_momentum_matrix,date(2025,12,29),date(2026,2,8),[1],window_weeks=2)
        self.assertEqual(other.data.topics[0].total_indexed_paper_count,8)
        self.assertEqual(other.data.topics[0].period_paper_count,7)

    def test_production_sql_session_timezone_independence(self):
        """Both actual production datasets remain unchanged across DST and UTC-offset sessions."""
        for function in [service.get_momentum,service.get_momentum_matrix]:
            kwargs = {'window_weeks':2} if function is service.get_momentum_matrix else {'mode':'index'}
            reference = None
            for zone in ['UTC','Australia/Sydney','Pacific/Honolulu']:
                with self.conn.cursor() as cursor:
                    cursor.execute("select set_config('TimeZone',%s,true)",(zone,))
                result = self.execute_service(function,date(2026,1,5),date(2026,2,1),**kwargs).model_dump(mode='json')
                if reference is None:
                    reference = result
                self.assertEqual(result,reference)

    def test_external_zero_calendar_and_year_boundary(self):
        """A bounded external interval is zero-filled with honest warnings and year-aware Mondays."""
        result = self.execute_service(service.get_momentum,date(2025,12,30),date(2026,1,2))
        self.assertTrue(all(t.points[0].week_start==date(2025,12,29) for t in result.data.topics))
        self.assertTrue(all(t.points[0].paper_count==0 for t in result.data.topics))
        self.assertTrue(any('outside observed' in w for w in result.meta.warnings))
        year_week = self.execute_service(service.get_momentum,date(2025,12,29),date(2026,1,4),[1])
        point = year_week.data.topics[0].points[0]
        self.assertEqual(point.week_start,date(2025,12,29))
        self.assertEqual(point.paper_count,1)
        self.assertFalse(point.is_partial_week)

    def test_empty_corpus_keeps_topics_without_invented_windows(self):
        """Actual SQL retains configured topics while empty facts provide no dates or activity."""
        self.empty_corpus = True
        momentum = self.execute_service(service.get_momentum)
        matrix = self.execute_service(service.get_momentum_matrix)
        self.assertEqual(len(momentum.data.topics),5)
        self.assertTrue(all(t.points==[] for t in momentum.data.topics))
        self.assertIsNone(momentum.data.interval.date_from)
        self.assertEqual(len(matrix.data.topics),5)
        self.assertIsNone(matrix.data.previous_window)
        self.assertIsNone(matrix.data.recent_window)
        self.assertTrue(all(t.period_paper_count==t.total_indexed_paper_count==0 for t in matrix.data.topics))
        self.assertTrue(all(t.growth_state=='no_baseline' and t.growth_percent is None for t in matrix.data.topics))
