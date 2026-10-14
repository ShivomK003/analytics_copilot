"""Phase 1C unit/API tests and opt-in read-only production SQL fixtures."""

import os
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

import test_intelligence_service as foundation_tests
from test_intelligence_api import main, request, routes
from test_research_filters import filters

service = foundation_tests.service
BOUNDS = dict(observed_date_from=date(2026, 6, 30), observed_date_to=date(2026, 7, 2), undated_papers=0)
TOPICS = [dict(topic_id=1, topic_name='alpha', paper_count=3), dict(topic_id=2, topic_name='beta', paper_count=2), dict(topic_id=3, topic_name='zero', paper_count=0)]


class AssociationUnitTests(unittest.TestCase):
    def test_jaccard_full_node_totals_and_precision(self):
        """Jaccard uses full node totals, not shared-only counts, and rounds to six places."""
        row = dict(BOUNDS, nodes=TOPICS, edges=[dict(topic_a_id=1, topic_b_id=2, shared_paper_count=1)])
        with patch.object(service, 'fetch_one', return_value=row) as fetch:
            result = service.get_relationships(min_shared_papers=1)
        self.assertEqual(result.data.edges[0].jaccard_similarity, 0.25)
        self.assertEqual(result.data.nodes[0].paper_count, 3)
        self.assertEqual(result.data.nodes[2].paper_count, 0)
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(service._association_ratio(1, 3), 0.333333)
        self.assertIsNone(service._association_ratio(0, 0))

    def test_heatmap_zero_cells_and_null_denominators(self):
        """Zero matches differ from zero denominators in the full topic/category product."""
        row = dict(BOUNDS, topics=TOPICS, categories=[dict(category_id=1, category_code='cs.AI', paper_count=2)], cells=[dict(topic_id=1, category_id=1, paper_count=1)])
        with patch.object(service, 'fetch_one', return_value=row) as fetch:
            result = service.get_topic_category_heatmap()
        self.assertEqual(len(result.data.cells), 3)
        self.assertEqual(result.data.cells[0].category_prevalence_pct, 50)
        self.assertEqual(result.data.cells[0].topic_distribution_pct, 33.333333)
        self.assertEqual(result.data.cells[1].category_prevalence_pct, 0.0)
        self.assertEqual(result.data.cells[1].topic_distribution_pct, 0.0)
        self.assertIsNone(result.data.cells[2].topic_distribution_pct)
        self.assertEqual(fetch.call_count, 1)
        self.assertIsNone(service._association_ratio(0, 0, 100))

    def test_date_parameters_are_aware_and_selection_is_bound(self):
        """Shared date predicates bind full final-day UTC boundaries without interpolating values."""
        sql, params = service._association_ctes(date(2026, 7, 1), date(2026, 7, 1), [2, 1])
        self.assertNotIn('2026', sql)
        self.assertEqual(params[:2], (datetime(2026, 7, 1, tzinfo=timezone.utc), datetime(2026, 7, 2, tzinfo=timezone.utc)))
        self.assertEqual(params[2:], ([2, 1], [2, 1]))
        _, omitted = service._association_ctes(None, None, [])
        self.assertEqual(omitted, (None, None))

    def test_missing_results_and_database_errors_are_not_empty_success(self):
        """Missing aggregation rows and connection failures remain service errors."""
        for function in (service.get_relationships, service.get_topic_category_heatmap):
            with self.subTest(function=function.__name__):
                with patch.object(service, 'fetch_one', return_value=None), self.assertRaises(RuntimeError):
                    function()
                with patch.object(service, 'fetch_one', side_effect=RuntimeError('connection lost')), self.assertRaises(RuntimeError):
                    function()


class AssociationApiTests(unittest.TestCase):
    def test_invalid_supported_parameters(self):
        """Date/topic dependencies and route parameter types enforce HTTP 422."""
        for path, local in [('relationships', ['min_shared_papers=0', 'min_shared_papers=-1', 'min_shared_papers=abc']), ('topic-category-heatmap', ['category_scope=secondary'])]:
            for query in local + ['date_from=2026-02-30', 'date_from=2026-07-02&date_to=2026-07-01', 'topic_id=-1', 'topic_id=abc']:
                with self.subTest(path=path, query=query):
                    self.assertEqual(request(main.app, '/intelligence/'+path, query)[0], 422)
            with patch.object(filters, 'fetch_all', return_value=[]):
                self.assertEqual(request(main.app, '/intelligence/'+path, 'topic_id=999')[0], 422)

    def test_typed_envelopes_and_duplicate_topic_normalization(self):
        """Actual ASGI requests reuse topic normalization and serialize typed response models."""
        with patch.object(filters, 'fetch_all', return_value=[dict(topic_id=1)]):
            for path, function, result_row in [
                ('relationships', 'get_relationships', dict(BOUNDS, nodes=TOPICS[:1], edges=[])),
                ('topic-category-heatmap', 'get_topic_category_heatmap', dict(BOUNDS, topics=TOPICS[:1], categories=[], cells=[])),
            ]:
                with patch.object(service, 'fetch_one', return_value=result_row), patch.object(routes, function, wraps=getattr(service, function)) as call:
                    status, body = request(main.app, '/intelligence/'+path, 'topic_id=1&topic_id=1')
                    self.assertEqual(status, 200)
                    self.assertEqual(set(body), {'meta', 'data'})
                    self.assertEqual(call.call_args.args[2], [1])
                    self.assertEqual(body['meta']['coverage_status'], 'unknown')
                    self.assertEqual(body['meta']['timezone'], 'UTC')
        schema = main.app.openapi()['paths']
        for path, model in [('relationships', 'RelationshipsResponse'), ('topic-category-heatmap', 'TopicCategoryHeatmapResponse')]:
            self.assertEqual(schema['/intelligence/'+path]['get']['responses']['200']['content']['application/json']['schema']['$ref'], '#/components/schemas/'+model)
        for path in ['/intelligence/coverage', '/intelligence/topics', '/intelligence/momentum', '/intelligence/momentum-matrix', '/papers/search', '/authors/search']:
            self.assertIn(path, schema)

    def test_database_failures_are_generic_http_500(self):
        """Server failures must not masquerade as empty matrices or expose connection details."""
        for path, function in [('relationships', 'get_relationships'), ('topic-category-heatmap', 'get_topic_category_heatmap')]:
            with patch.object(routes, function, side_effect=RuntimeError('secret database details')):
                status, body = request(main.app, '/intelligence/'+path)
                self.assertEqual(status, 500)
                self.assertNotIn('secret', str(body))


# Duplicate bridge pairs are intentional robustness checks: deployed composite
# primary keys normally prevent these duplicates. Overlapping memberships are valid.
FIXTURES = """
fact_papers(paper_id,published_date,primary_category) as (values
 ('a','2026-07-01 00:00:00+00'::timestamptz,'cs.AI'),
 ('b','2026-07-01 23:59:59.999999+00'::timestamptz,'cs.LG'),
 ('c','2026-07-02 00:00:00+00'::timestamptz,'cs.AI'),
 ('d','2026-07-01 12:00:00+00'::timestamptz,'cs.AI'),
 ('e','2026-06-30 23:59:59.999999+00'::timestamptz,'cs.CV'),
 ('f','2026-07-01 12:00:00+00'::timestamptz,'cs.CV'),
 ('g','2026-07-01 12:00:00+00'::timestamptz,'unmapped'),
 ('u',null::timestamptz,'cs.AI')
),
dim_topic(topic_id,topic_name) as (values (1,'alpha'),(2,'beta'),(3,'zero')),
paper_topics(paper_id,topic_id) as (values
 ('a',1),('a',1),('a',2),('b',1),('c',2),('e',1),('f',2),('g',1),('u',1)),
dim_category(category_id,category_code) as (values
 (1,'cs.AI'),(2,'cs.LG'),(3,'cs.CV'),(4,'empty')),
paper_categories(paper_id,category_id) as (values
 ('a',1),('a',1),('a',2),('b',2),('c',1),('d',1),('e',3),('f',3),('g',2),('u',1))
"""


@unittest.skipUnless(os.getenv('INTELLIGENCE_SQL_TESTS') == '1', 'Opt-in read-only PostgreSQL fixture tests')
class AssociationSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Reuse existing explicitly read-only PostgreSQL fixture connection setup."""
        foundation_tests.IntelligenceSqlTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        """Roll back and close the fixture transaction."""
        foundation_tests.IntelligenceSqlTests.tearDownClass.__func__(cls)

    def query(self, query, params=None):
        """Execute unchanged production aggregation against CTE-shadowed warehouse tables."""
        fixtures = FIXTURES
        if getattr(self, 'empty_corpus', False):
            fixtures = fixtures.replace('fact_papers(paper_id,published_date,primary_category) as', 'fixture_papers(paper_id,published_date,primary_category) as')
            fixtures += ', fact_papers as (select * from fixture_papers where false)'
        query = query.replace('with indexed_papers', f'with {fixtures}, indexed_papers', 1)
        with self.conn.cursor() as cursor:
            cursor.execute(query, params)
            return dict(cursor.fetchone())

    def execute(self, function, start=date(2026, 7, 1), end=date(2026, 7, 1), **kwargs):
        """Route production service queries to fixture data while preserving bound values."""
        with patch.object(service, 'fetch_one', side_effect=self.query):
            return function(start, end, **kwargs)

    def test_relationship_distinct_pair_and_jaccard(self):
        """Duplicate/overlapping tags cannot inflate pairs or contaminate full node totals."""
        result = self.execute(service.get_relationships)
        self.assertEqual([(n.topic_id, n.paper_count) for n in result.data.nodes], [(1,3),(2,2),(3,0)])
        self.assertEqual(len(result.data.edges), 1)
        edge = result.data.edges[0]
        self.assertEqual((edge.topic_a_id,edge.topic_b_id,edge.shared_paper_count), (1,2,1))
        self.assertEqual(edge.jaccard_similarity, 0.25)
        self.assertLess(edge.topic_a_id,edge.topic_b_id)

    def test_threshold_selection_and_sparse_nodes(self):
        """Thresholds suppress edges only; single or disconnected topic selections retain nodes."""
        all_nodes = self.execute(service.get_relationships).data.nodes
        threshold = self.execute(service.get_relationships,min_shared_papers=2)
        self.assertEqual(threshold.data.edges, [])
        self.assertEqual(threshold.data.nodes,all_nodes)
        single = self.execute(service.get_relationships,topic_ids=[1,1])
        self.assertEqual([(n.topic_id,n.paper_count) for n in single.data.nodes],[(1,3)])
        self.assertEqual(single.data.edges, [])
        disconnected = self.execute(service.get_relationships,topic_ids=[1,3])
        self.assertEqual(len(disconnected.data.nodes),2)
        self.assertEqual(disconnected.data.edges, [])

    def test_all_scope_denominators_overlap_and_zero_fill(self):
        """Category totals include untagged papers and all cells have distinct counts."""
        result = self.execute(service.get_topic_category_heatmap)
        self.assertEqual([(c.category_id,c.paper_count) for c in result.data.categories],[(2,3),(1,2),(3,1)])
        self.assertEqual(len(result.data.cells),9)
        cells = {(c.topic_id,c.category_id):c for c in result.data.cells}
        self.assertEqual(cells[1,2].paper_count,3)
        self.assertEqual(cells[1,2].category_prevalence_pct,100)
        self.assertEqual(cells[1,1].category_prevalence_pct,50)
        self.assertEqual(cells[1,1].topic_distribution_pct,33.333333)
        self.assertGreater(sum(c.topic_distribution_pct for c in result.data.cells if c.topic_id==1),100)
        self.assertEqual(cells[1,3].paper_count,0)
        self.assertEqual(cells[1,3].topic_distribution_pct,0)
        self.assertIsNone(cells[3,2].topic_distribution_pct)
        self.assertEqual(cells[3,2].category_prevalence_pct,0)

    def test_primary_scope_preserves_topic_denominators(self):
        """Primary mappings affect cells/categories but not topic totals, including unmapped codes."""
        all_scope = self.execute(service.get_topic_category_heatmap)
        primary = self.execute(service.get_topic_category_heatmap,category_scope='primary')
        self.assertEqual(primary.data.topics,all_scope.data.topics)
        self.assertEqual([(c.category_id,c.paper_count) for c in primary.data.categories],[(1,2),(3,1),(2,1)])
        cells = {(c.topic_id,c.category_id):c for c in primary.data.cells}
        self.assertEqual(cells[1,2].paper_count,1)
        self.assertEqual(cells[1,2].topic_distribution_pct,33.333333)
        self.assertEqual(sum(c.topic_distribution_pct for c in primary.data.cells if c.topic_id==2),100)
        self.assertLess(sum(c.topic_distribution_pct for c in primary.data.cells if c.topic_id==1),100)

    def test_selected_topic_never_changes_category_counts(self):
        """Filtering to alpha retains the beta-only category and untagged category denominators."""
        for scope in ['all','primary']:
            with self.subTest(scope=scope):
                full = self.execute(service.get_topic_category_heatmap,category_scope=scope)
                selected = self.execute(service.get_topic_category_heatmap,category_scope=scope,topic_ids=[1])
                self.assertEqual(selected.data.categories,full.data.categories)
                self.assertEqual(len(selected.data.cells),3)
                self.assertEqual(selected.data.topics,full.data.topics[:1])
                self.assertEqual([c for c in selected.data.cells if c.category_id==3][0].paper_count,0)

    def test_no_matching_dates_and_empty_corpus(self):
        """No activity still retains topics, with no edges/categories/cells or fabricated bounds."""
        for empty in [False,True]:
            with self.subTest(empty=empty):
                self.empty_corpus = empty
                graph = self.execute(service.get_relationships,date(2027,1,1),date(2027,1,2))
                heatmap = self.execute(service.get_topic_category_heatmap,date(2027,1,1),date(2027,1,2))
                self.assertEqual(len(graph.data.nodes),3)
                self.assertTrue(all(n.paper_count==0 for n in graph.data.nodes))
                self.assertEqual(graph.data.edges,[])
                self.assertEqual(len(heatmap.data.topics),3)
                self.assertEqual(heatmap.data.categories,[])
                self.assertEqual(heatmap.data.cells,[])
                self.assertEqual(graph.meta.coverage_status,'unknown')
                if empty:
                    self.assertIsNone(graph.meta.observed_date_from)

    def test_timezone_independence_and_unbounded_sides(self):
        """Both production queries use UTC inclusive boundaries independent of session timezone."""
        for function in [service.get_relationships,service.get_topic_category_heatmap]:
            reference = None
            for zone in ['UTC','Australia/Sydney','Pacific/Honolulu']:
                with self.conn.cursor() as cursor:
                    cursor.execute("select set_config('TimeZone',%s,true)",(zone,))
                result = self.execute(function).model_dump(mode='json')
                if reference is None:
                    reference = result
                self.assertEqual(result,reference)
            unbounded = self.execute(function,None,None)
            upper_only = self.execute(function,None,date(2026,7,1))
            lower_only = self.execute(function,date(2026,7,1),None)
            for response in [unbounded,upper_only,lower_only]:
                topics = response.data.nodes if function is service.get_relationships else response.data.topics
                self.assertEqual(topics[0].paper_count,4 if response is not lower_only else 3)
