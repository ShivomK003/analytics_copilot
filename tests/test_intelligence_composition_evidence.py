"""Phase 1D API/unit tests and read-only SQL fixtures using the real detail-view SELECT."""

import os
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import test_intelligence_service as foundation_tests
from test_intelligence_api import main, request, routes
from test_research_filters import filters

service = foundation_tests.service
BOUNDS = dict(observed_date_from=date(2026, 6, 30), observed_date_to=date(2026, 7, 13), undated_papers=1)


class CompositionEvidenceUnitTests(unittest.TestCase):
    def test_composition_zero_denominator_and_partial_boundary(self):
        """Zero denominators yield null; zero matches in populated cohorts yield zero."""
        row = dict(topics=[dict(topic_id=1, topic_name='alpha')], weeks=[
            dict(week_start='2026-06-29', total_papers=4, topics=[dict(topic_id=1, topic_papers=2)]),
            dict(week_start='2026-07-06', total_papers=0, topics=[dict(topic_id=1, topic_papers=0)]),
            dict(week_start='2026-07-13', total_papers=1, topics=[dict(topic_id=1, topic_papers=0)]),
        ])
        with patch.object(service, 'fetch_one', side_effect=[BOUNDS, row]):
            result = service.get_composition(date(2026,6,30),date(2026,7,19))
        self.assertEqual([w.topics[0].prevalence_pct for w in result.data.weeks], [50,None,0])
        self.assertEqual(result.data.weeks[0].effective_start,datetime(2026,6,30,tzinfo=timezone.utc))
        self.assertTrue(result.data.weeks[0].is_partial_week)
        self.assertEqual(result.meta.coverage_status,'unknown')

    def test_composition_empty_corpus_and_window_cap(self):
        """Empty history retains topics without dates, while the shared 104-week cap still applies."""
        empty = dict(observed_date_from=None,observed_date_to=None,undated_papers=0)
        with patch.object(service,'fetch_one',return_value=empty), patch.object(service,'fetch_all',return_value=[dict(topic_id=1,topic_name='zero')]):
            result = service.get_composition()
        self.assertEqual(result.data.weeks,[])
        self.assertIsNone(result.data.interval.date_from)
        self.assertEqual(len(result.data.topics),1)
        with patch.object(service,'fetch_one',return_value=BOUNDS), self.assertRaises(service.AnalyticalWindowError):
            service.get_composition(date(2020,1,1),date(2026,1,1))

    def test_evidence_has_more_empty_page_and_utc_serialization(self):
        """Offsets beyond the total retain the count; timestamps normalize to UTC."""
        from app.schemas.intelligence import EvidenceRecord
        record = EvidenceRecord(paper_id='a',title='Title',abstract=None,published_date='2026-07-01T10:00:00+10:00',authors=[],primary_category=None,arxiv_url=None,pdf_url=None)
        self.assertEqual(record.model_dump(mode='json')['published_date'],'2026-07-01T00:00:00Z')
        with patch.object(service,'fetch_one',return_value=dict(BOUNDS,total=3,records=[])):
            result = service.get_evidence(offset=5)
        self.assertEqual(result.data.total,3)
        self.assertFalse(result.data.has_more)
        self.assertEqual(result.data.records,[])

    def test_missing_results_and_database_failures_are_errors(self):
        """Neither an absent evidence aggregate nor SQL failure may become empty success."""
        with patch.object(service,'fetch_one',return_value=None), self.assertRaises(RuntimeError):
            service.get_evidence()
        with patch.object(service,'fetch_one',side_effect=RuntimeError('offline')), self.assertRaises(RuntimeError):
            service.get_composition()


class CompositionEvidenceApiTests(unittest.TestCase):
    def test_invalid_dates_topics_and_pagination(self):
        """New routes keep existing validation and reject invalid evidence cardinality/pagination."""
        for path, local in [
            ('composition',['include_partial_weeks=bad']),
            ('evidence',['topic_id=1&topic_id=1','topic_id=1&topic_id=2&topic_id=3','category_scope=secondary','limit=0','limit=101','offset=-1','offset=9223372036854775808','category=','category=%20']),
        ]:
            for query in local+['date_from=2026-02-30','date_from=2026-07-02&date_to=2026-07-01','topic_id=-1','topic_id=abc']:
                with self.subTest(path=path,query=query):
                    self.assertEqual(request(main.app,'/intelligence/'+path,query)[0],422)
            with patch.object(filters,'fetch_all',return_value=[]):
                self.assertEqual(request(main.app,'/intelligence/'+path,'topic_id=999')[0],422)
        with patch.object(filters,'fetch_all',return_value=[]):
            self.assertEqual(request(main.app,'/intelligence/evidence','category=unknown')[0],422)

    def test_typed_envelopes_and_category_canonicalization(self):
        """Category codes resolve through the dimension while topic pairs remain conjunctive."""
        def lookup(sql,params=None):
            return [dict(category_code='cs.AI')] if 'category_code' in sql else [dict(topic_id=1),dict(topic_id=2)]
        with patch.object(filters,'fetch_all',side_effect=lookup), patch.object(service,'fetch_one',return_value=dict(BOUNDS,total=0,records=[])), patch.object(routes,'get_evidence',wraps=service.get_evidence) as call:
            status,body = request(main.app,'/intelligence/evidence','topic_id=2&topic_id=1&category=CS.AI&limit=7')
            self.assertEqual(status,200)
            self.assertEqual(call.call_args.args[2:5],([1,2],'cs.AI','all'))
            self.assertEqual(body['data'],dict(total=0,limit=7,offset=0,has_more=False,records=[]))
            self.assertEqual(set(body),{'meta','data'})
        schema = main.app.openapi()['paths']
        for path,model in [('composition','CompositionResponse'),('evidence','EvidenceResponse')]:
            self.assertEqual(schema['/intelligence/'+path]['get']['responses']['200']['content']['application/json']['schema']['$ref'],'#/components/schemas/'+model)
        for path in ['coverage','topics','momentum','momentum-matrix','relationships','topic-category-heatmap']:
            self.assertIn('/intelligence/'+path,schema)

    def test_failures_are_generic_500(self):
        """Database/service failures remain distinct from valid zero counts."""
        for path,function in [('composition','get_composition'),('evidence','get_evidence')]:
            with patch.object(routes,function,side_effect=RuntimeError('secret database detail')):
                status,body = request(main.app,'/intelligence/'+path)
                self.assertEqual(status,500)
                self.assertNotIn('secret',str(body))
        with patch.object(filters,'fetch_all',side_effect=RuntimeError('secret')):
            for query in ['topic_id=1','category=cs.AI']:
                status,body = request(main.app,'/intelligence/evidence',query)
                self.assertEqual(status,500)
                self.assertNotIn('secret',str(body))


FIXTURES = """
fixture_facts(paper_id,published_date,primary_category) as (values
 ('a','2026-07-01 00:00:00+00'::timestamptz,'cs.AI'),
 ('b','2026-07-01 23:59:59.999999+00'::timestamptz,'cs.LG'),
 ('c','2026-07-02 00:00:00+00'::timestamptz,'cs.AI'),
 ('d','2026-07-01 12:00:00+00'::timestamptz,'cs.AI'),
 ('e','2026-06-30 23:59:59.999999+00'::timestamptz,'cs.CV'),
 ('f','2026-07-01 12:00:00+00'::timestamptz,'cs.CV'),
 ('g','2026-07-01 12:00:00+00'::timestamptz,'unmapped'),
 ('h','2026-07-01 23:59:59.999999+00'::timestamptz,'cs.LG'),
 ('i','2026-07-13 01:00:00+00'::timestamptz,'cs.AI'),
 ('u',null::timestamptz,'cs.AI')
), fact_papers as (
 select paper_id,published_date,primary_category,'Title '||paper_id as title,
        'Abstract'::text as abstract,published_date as updated_date,
        null::text as pdf_url,null::text as arxiv_url,2026 as year,7 as month,27 as week
 from fixture_facts
), dim_topic(topic_id,topic_name) as (values (1,'alpha'),(2,'beta'),(3,'zero')),
paper_topics(paper_id,topic_id) as (values
 ('a',1),('a',1),('a',2),('b',1),('b',2),('c',2),('e',1),('f',2),('g',1),('h',1),('u',1)),
dim_category(category_id,category_code) as (values (1,'cs.AI'),(2,'cs.LG'),(3,'cs.CV')),
paper_categories(paper_id,category_id) as (values
 ('a',1),('a',1),('a',2),('b',2),('c',1),('d',1),('e',3),('f',3),('g',2),('h',2),('i',1),('u',1)),
dim_author(author_id,author_name) as (values (1,'Alice'),(2,'Bob')),
paper_authors(paper_id,author_id) as (values ('a',1),('b',2),('b',1),('b',1))
"""
# Read the actual existing view SELECT, never its DDL. Outer CTE fixtures shadow
# its tables so author/detail serialization is verified without database writes.
VIEW_SOURCE = (Path(__file__).resolve().parents[1]/'backend/sql/analytics/01_base_views.sql').read_text()
DETAIL_SELECT = VIEW_SOURCE.split('create or replace view vw_paper_details as',1)[1].split(';',1)[0]


@unittest.skipUnless(os.getenv('INTELLIGENCE_SQL_TESTS')=='1','Opt-in read-only PostgreSQL fixture tests')
class CompositionEvidenceSqlTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        """Reuse the existing explicitly read-only PostgreSQL fixture connection."""
        foundation_tests.IntelligenceSqlTests.setUpClass.__func__(cls)

    @classmethod
    def tearDownClass(cls):
        """Roll back the fixture transaction and close the connection."""
        foundation_tests.IntelligenceSqlTests.tearDownClass.__func__(cls)

    def query(self,query,params=None,all_rows=False):
        """Inject immutable fixture CTEs and the production detail-view SELECT into service SQL."""
        fixtures = FIXTURES
        if getattr(self,'empty_corpus',False):
            fixtures = fixtures.replace('from fixture_facts\n','from fixture_facts where false\n')
        if getattr(self,'no_topics',False):
            fixtures += ', empty_topics as (select * from dim_topic where false)'
            query = query.replace('from dim_topic','from empty_topics')
        fixtures += f', vw_paper_details as ({DETAIL_SELECT})'
        for marker in ['with selected_topics','with indexed_papers','with bounds']:
            if marker in query:
                query=query.replace(marker,f'with {fixtures}, '+marker[5:],1)
                break
        else:
            query=f'with {fixtures} '+query
        with self.conn.cursor() as cursor:
            cursor.execute(query,params)
            return [dict(r) for r in cursor.fetchall()] if all_rows else dict(cursor.fetchone())

    def execute(self,function,start=date(2026,6,30),end=date(2026,7,19),**kwargs):
        """Execute production services against the shared fixture population."""
        with patch.object(service,'fetch_one',side_effect=self.query),patch.object(service,'fetch_all',side_effect=lambda q,p=None:self.query(q,p,True)):
            return function(start,end,**kwargs)

    def test_composition_overlap_untagged_zero_weeks_and_selection(self):
        """The independent weekly denominator retains untagged and unselected-topic papers."""
        full=self.execute(service.get_composition)
        self.assertEqual([w.total_papers for w in full.data.weeks],[8,0,1])
        self.assertEqual([t.topic_papers for t in full.data.weeks[0].topics],[5,4,0])
        self.assertEqual([t.prevalence_pct for t in full.data.weeks[0].topics],[62.5,50,0])
        self.assertGreater(sum(t.prevalence_pct for t in full.data.weeks[0].topics),100)
        self.assertTrue(all(t.prevalence_pct is None for t in full.data.weeks[1].topics))
        self.assertTrue(all(t.prevalence_pct==0 for t in full.data.weeks[2].topics))
        selected=self.execute(service.get_composition,topic_ids=[1,1])
        self.assertEqual([w.total_papers for w in selected.data.weeks],[8,0,1])
        self.assertTrue(all(len(w.topics)==1 for w in selected.data.weeks))

    def test_partial_weeks_and_momentum_boundaries_match(self):
        """Composition and momentum use identical clipped UTC cohorts and optional exclusion."""
        start,end=date(2026,6,30),date(2026,7,15)
        comp=self.execute(service.get_composition,start,end)
        momentum=self.execute(service.get_momentum,start,end,topic_ids=[1])
        self.assertEqual([w.is_partial_week for w in comp.data.weeks],[True,False,True])
        for week,point in zip(comp.data.weeks,momentum.data.topics[0].points):
            self.assertEqual(week.week_start,point.week_start)
            self.assertEqual(week.effective_start,point.effective_start)
            self.assertEqual(week.effective_end_exclusive,point.effective_end_exclusive)
            self.assertEqual(week.topics[0].topic_papers,point.paper_count)
        full=self.execute(service.get_composition,start,end,include_partial_weeks=False)
        self.assertEqual([w.total_papers for w in full.data.weeks],[0])

    def test_evidence_intersection_category_scopes_and_stable_pages(self):
        """EXISTS filters deduplicate before paging; tied dates sort by stored ID."""
        day=date(2026,7,1)
        all_day=self.execute(service.get_evidence,day,day)
        self.assertEqual(all_day.data.total,6)
        self.assertEqual([r.paper_id for r in all_day.data.records],['b','h','d','f','g','a'])
        one=self.execute(service.get_evidence,day,day,topic_ids=[1])
        both=self.execute(service.get_evidence,day,day,topic_ids=[1,2])
        self.assertEqual(one.data.total,4)
        self.assertEqual([r.paper_id for r in both.data.records],['b','a'])
        category=self.execute(service.get_evidence,day,day,topic_ids=[1],category='cs.LG')
        primary=self.execute(service.get_evidence,day,day,topic_ids=[1],category='cs.LG',category_scope='primary')
        self.assertEqual(category.data.total,4)
        self.assertEqual(primary.data.total,2)
        self.assertEqual(all_day.data.records[0].authors,['Alice','Bob'])
        page=self.execute(service.get_evidence,day,day,limit=2,offset=0)
        last=self.execute(service.get_evidence,day,day,limit=2,offset=4)
        beyond=self.execute(service.get_evidence,day,day,limit=2,offset=6)
        self.assertEqual([r.paper_id for r in page.data.records],['b','h'])
        self.assertTrue(page.data.has_more)
        self.assertFalse(last.data.has_more)
        self.assertEqual(beyond.data.total,6)
        self.assertEqual(beyond.data.records,[])
        self.assertFalse(beyond.data.has_more)

    def test_evidence_matches_all_five_analytics(self):
        """Every supported chart cohort is reproducible using inclusive dates and one/two topic IDs."""
        comp=self.execute(service.get_composition,topic_ids=[1])
        momentum=self.execute(service.get_momentum,topic_ids=[1])
        for week,point in zip(comp.data.weeks,momentum.data.topics[0].points):
            start=week.effective_start.date()
            end=(week.effective_end_exclusive-timedelta(days=1)).date()
            evidence=self.execute(service.get_evidence,start,end,topic_ids=[1])
            total=self.execute(service.get_evidence,start,end)
            self.assertEqual(evidence.data.total,week.topics[0].topic_papers)
            self.assertEqual(evidence.data.total,point.paper_count)
            self.assertEqual(total.data.total,week.total_papers)
        graph=self.execute(service.get_relationships)
        for edge in graph.data.edges:
            evidence=self.execute(service.get_evidence,topic_ids=[edge.topic_a_id,edge.topic_b_id])
            self.assertEqual(evidence.data.total,edge.shared_paper_count)
        for scope in ['all','primary']:
            heat=self.execute(service.get_topic_category_heatmap,category_scope=scope)
            codes={c.category_id:c.category_code for c in heat.data.categories}
            for cell in heat.data.cells:
                evidence=self.execute(service.get_evidence,topic_ids=[cell.topic_id],category=codes[cell.category_id],category_scope=scope)
                self.assertEqual(evidence.data.total,cell.paper_count)
        matrix=self.execute(service.get_momentum_matrix,date(2026,6,1),date(2026,7,19),window_weeks=2)
        for topic in matrix.data.topics:
            for window,count in [(matrix.data.previous_window,topic.previous_paper_count),(matrix.data.recent_window,topic.recent_paper_count)]:
                evidence=self.execute(service.get_evidence,window.start.date(),(window.end_exclusive-timedelta(days=1)).date(),topic_ids=[topic.topic_id])
                self.assertEqual(evidence.data.total,count)

    def test_timezone_independence_including_evidence_timestamps(self):
        """UTC cohort selection and serialized dates remain identical across session offsets."""
        for function in [service.get_composition,service.get_evidence]:
            reference=None
            for zone in ['UTC','Australia/Sydney','Pacific/Honolulu']:
                with self.conn.cursor() as cursor:
                    cursor.execute("select set_config('TimeZone',%s,true)",(zone,))
                body=self.execute(function).model_dump(mode='json')
                if reference is None:reference=body
                self.assertEqual(body,reference)

    def test_empty_corpus_and_absent_topic_dimension(self):
        """No history invents no weeks; a corpus without topic options still has weekly totals."""
        self.empty_corpus=True
        composition=self.execute(service.get_composition,None,None)
        evidence=self.execute(service.get_evidence,None,None)
        self.assertEqual(composition.data.weeks,[])
        self.assertEqual(len(composition.data.topics),3)
        self.assertEqual(evidence.data.total,0)
        self.assertEqual(evidence.data.records,[])
        self.empty_corpus=False
        self.no_topics=True
        composition=self.execute(service.get_composition)
        self.assertEqual(composition.data.topics,[])
        self.assertEqual([w.total_papers for w in composition.data.weeks],[8,0,1])
        self.assertTrue(all(w.topics==[] for w in composition.data.weeks))
