# Frontend experience and design system

The presentation refactor keeps the existing React, CSS, Recharts and TanStack Query architecture. No new UI or state library is introduced.

## Audit and direction

- Preserve the light blue/lavender identity, navy typography and an integrated hero above a connected executive dashboard.
- Reuse `Card`, `PageHeader`, `PageSection`, responsive grids and shared feedback components across all routes.
- Replace Research Intelligence's large forms, expanded coverage report and half-width Momentum card with compact controls and a full-width chart.
- Keep Trends, Topics and Categories page structures. They inherit shared header, card, chart, focus and responsive-grid refinements.
- Authors and Papers share search, filter, result-row and pagination CSS primitives. Their query, sorting, pagination and URL logic is unchanged.
- Primary navigation is Overview, Research Intelligence and Paper Explorer (`/papers`). Legacy Trends, Topics, Categories and Authors routes remain available through direct links; no analytical functionality is deleted.

## Shared styling

`src/styles/tokens.css` owns colors, typography, spacing, radii, shadows, hero/card surfaces, chart background/height and interaction timing. Blue is the primary action color; lavender is a restrained secondary accent. `src/styles/global.css` owns reusable layout and control classes. `src/styles/navigation.css` owns horizontal navigation and mobile-menu presentation. `src/styles/overview.css` owns the executive canvas. `src/styles/intelligence.css` owns only Intelligence-specific presentation.

Reusable primitives include `surface-hero`, `form-control`, `search-toolbar`, `filter-grid`, `filter-field`, `filter-toolbar`, `results-heading`, `research-result`, `pagination-toolbar` and `disclosure-content`. The existing component API remains intact.

Topic colors remain defined by the deterministic ID-based palette in `src/utils/topicColors.ts`. Labels accompany colors. Palette overflow repeats predictably without dependence on selection order.

Responsive conventions:

- Below 48rem: research controls wrap, disclosures expand in document flow, charts retain readable labels, and supporting controls remain touch accessible.
- Below 64rem: split chart/context layouts and the executive analytical row stack. Below 60rem, primary navigation uses an accessible modal menu instead of desktop links.
- Coverage is a compact wrapping metadata row rather than a corpus KPI grid.
- Intelligence lines stay 24rem high on desktop and 21rem on mobile; the Matrix is 21rem on desktop. The network keeps a larger, locally scrollable spatial layout.

Interactive elements retain visible focus, native disclosure/radio/checkbox semantics, touch targets and reduced-motion support. Hover elevation is reserved for actionable content.

## Horizontal navigation and executive Overview

The persistent desktop sidebar is no longer mounted. The horizontal navbar shares the page container's maximum width and inline padding. Overview, Research Intelligence and Paper Explorer are its only primary destinations; `/papers` and every legacy route are unchanged. A small layer mark and product name establish identity without duplicating the current page heading.

At the page top, the sticky navbar is transparent and integrated with the existing background. After scrolling more than 80px, a downward movement hides it; scrolling upward reveals a restrained frosted surface. An 8px direction threshold prevents jitter. Returning within 16px of the top restores the integrated appearance. Keyboard focus reveals hidden navigation and keeps focused controls available. Focus/active states retain visible contrast; reduced-motion mode removes transitions. Sticky positioning keeps the header's layout space stable. Content anchor margins account for header height.

Below 60rem, the desktop links become a compact menu button. The reused dialog traps focus, supports Escape and backdrop dismissal, restores focus to its trigger, locks background scrolling and makes the shell inert while open. Its inset navy surface retains readable light headings, links and descriptions, with a divided footer and internal scrolling for short viewports. Drawer styles are owned exclusively by `navigation.css` so global stylesheet order cannot mix dark surfaces with light-theme text. Navigation links return to the top; browser routes, query-string filters and profile links are retained.

Overview is one scrollable analytical canvas, with no global filters. Its integrated hero carries the product identity, concise description, a Research Intelligence link and the last successful ETL completion from the coverage endpoint. Publication dates are never used as ingestion freshness. The abstract background waves are decorative, contain no data and are hidden from assistive technology. KPI values appear only in the dashboard strip.

The executive canvas uses a 12-column grid and one gutter token (`--executive-gutter`). A connected four-metric strip uses subtle vertical dividers, not independent KPI cards. Its sources are total papers and this-week publications from the home response, configured topics from coverage, and unfiltered indexed author-record count from `/authors/count`. Author records are not labeled as a census of unique or active people. Missing values stay unavailable; genuine zeros remain zero.

The analytical row uses an 8/4 split at wide desktop widths and 7/5 on standard laptops: publication activity gets emphasis, while topic distribution remains a count-based horizontal bar chart because topic memberships overlap. Supporting researcher/publication panels use a 5/7 split. Below 64rem, the analytical panels stack; below 48rem, every panel stacks and the KPI strip becomes a two-by-two arrangement. Local chart/table scrolling protects labels rather than shrinking text. No repeated section headings sit outside each panel.

Panels share soft near-white surfaces, restrained lavender borders, consistent radii and no independent hover elevation. The outer canvas supplies a single subtle shadow. Navy headings, tighter heading letter spacing and tabular numerals establish hierarchy; controls use the existing blue accent and lavender selection surfaces. Hero waves, borders and shadows remain subordinate to data.

`PublicationActivity` owns the Daily/Weekly/Monthly selector. Daily and weekly reuse the home response; monthly reuses the existing trends hook with an optional enabled flag (default behavior for legacy consumers is unchanged). It fetches only when selected, and selection cannot change other panels or KPIs. The chart uses linear, unstacked area/line geometry with returned counts, null gaps and no calendar zero filling. A keyboard-accessible values table retains exact counts and period labels. Topic distribution reuses `TopicDistributionChart` with a compact presentation; legacy consumers keep their normal dimensions. All values, UTC publication dates, original source ordering and profile links remain available in supporting panels.

Dates and timestamps are explicitly displayed in UTC, but bucket aggregation and week-to-date KPI cutoffs remain defined by existing warehouse views. Those legacy views use database calendar/session settings, so this frontend does not claim to redefine or certify their timezone. Ongoing UTC calendar periods are labeled provisional; past periods do not prove ingestion completeness. Panel sources refresh independently rather than promising one transaction-consistent snapshot. Historical coverage and overlapping-topic caveats remain accessible in the dashboard disclosure.

Browser access was unavailable during implementation. Automated checks cover scroll-direction states, active routes, focus restoration/trapping, legacy route preservation, panel isolation, source failures, UTC labels and unknown/zero handling. Manual desktop/mobile visual checks remain required.

## Research Intelligence structure

The workspace opens with a compact title and analytical introduction, not a hero or repeated executive KPIs. A wrapping coverage row preserves the last successful ETL timestamp and visible unknown-completeness status, with observed publication bounds and API warnings in its disclosure. The shared filter toolbar displays the inclusive UTC reporting interval once.

The narrative sequence is Research Momentum (activity) → Momentum Matrix (growth at scale) → Topic Prevalence Change (relative prominence) → Research Relationships (co-occurrence) → Topic–Category Heatmap (concentration). Each panel has one heading and a concise question. Repeated icons, eyebrow labels and redundant per-chart reporting intervals are removed. Comparison-window dates remain local because they differ from the global reporting interval.

Panels reuse Overview's `executive-panel` surface and header primitives from `global.css`. Each visualization owns its controls and accepts an optional heading rendered by `IntelligenceChartHeader`; this keeps title, analytical description and controls in one responsive header row. Overview's component and appearance are unchanged. Intelligence uses a single responsive column, soft near-white surfaces, restrained lavender borders, tabular figures and 1rem gutters. Controls stay near the top of their panel, followed by observations, optional inspection and collapsed methodology. Shared native controls retain their semantics; scoped select styling adds a consistent chevron, borders and focus states, with native appearance restored in forced-color mode.

The topic picker uses a native disclosure. Collapsing it changes neither selections nor requests. Custom UTC dates still commit together. Presets, validation, the 104-intersecting-week limit, URL state, and browser history remain unchanged.

## Momentum interpretation and interaction

- Weekly counts and indices still come from the existing endpoint and hook.
- The chart uses linear segments, preserves null gaps and never recalculates indices or synthesizes observations.
- Tooltip values sort descending, with unavailable observations last. Included dates and partial-week status appear once per week; topic rows use labeled color indicators.
- Detailed clipping, baseline, overlap and coverage explanations live in accessible disclosures, with response warnings retained.
- The values table remains accessible. The optional point-selection callback and inclusive evidence date conversion are unchanged.
- Loading, error/retry, empty results, background refresh and request cancellation behavior is preserved.

## Formatting

Prettier is the only added development dependency. `.prettierrc.json` uses two spaces, semicolons, double quotes, trailing commas and a 100-character target. Run `npm run format` or `npm run format:check`. Generated files, lockfiles and Markdown are excluded.

Formatting-only changes span existing frontend components, pages, hooks, API files, tests and configuration. The API contracts and analytical utilities have no semantic changes. Research Momentum's request-state branches and rendering are separated into named components in the same file to reduce nested JSX.

## Verification

Automated tests cover URL/history filters, collapsed controls, coverage values, concise tooltip semantics, count/index switching, alignment/nulls/partial weeks, stable colors, cancellation, evidence payloads, Overview refresh, and Explorer search/date/sort behavior.

Local read-only API verification returned coverage and both Momentum modes successfully. Browser screenshots could not be captured: the browser access host was unavailable and native Safari attachment timed out. Desktop, laptop, tablet and mobile visual checks remain necessary, especially long topic labels, tooltip placement, 104-week ticks, and expanded disclosures.

Existing full-lint failures remain in AuthorProfilePage and AuthorsPage (`react-hooks/set-state-in-effect`). Phase 2H replaces Papers' effect-driven draft reset with a guarded render-time synchronization while preserving query/date/sort behavior. The production build retains the existing large-chunk warning.


## Phase 2C — Momentum Matrix

The Matrix reuses the existing endpoint, TanStack Query hook, global date/topic filters and topic colors. Its scatter plot maps returned `recent_paper_count` to the horizontal axis and `growth_percent` to the vertical axis. The zero line separates growth and decline; no arbitrary activity threshold or statistical stability band is introduced. Unchanged means exactly zero change, following the backend state.

A compact selector defaults to four weeks and supports every integer from two through twelve. Returned complete UTC windows are displayed as inclusive dates. The known backend range-containment rejection becomes an informative empty state. Other validation, service and network errors retain the shared retry UI, with cancellation and no automatic retry loops.

Shapes distinguish growth states. Hollow dashed markers and labels identify low baselines. Null growth is excluded from the percentage axis and listed separately with actual current/previous counts. Keyboard-focusable topic buttons highlight marks and expose counts and caveats. Detailed methodology and all response warnings stay in a collapsed disclosure.

`MatrixSelection` in `src/utils/matrixData.ts` prepares the typed evidence callback: topic ID, recent/previous window, window size, original half-open UTC boundaries and inclusive evidence dates. Chart components emit selections; the page-level Phase 2H integration below owns evidence requests.

Focused tests cover rendered scatter marks, mapping, signed/zero/null changes, low baselines, filters, window selection, errors, cancellation, empty states and evidence date conversion. Browser layout and live Matrix endpoint verification remain manual checks for this phase.


## Phase 2D — Research Relationships

The topic network reuses the relationships endpoint/hook, shared URL-backed UTC filters, topic colors and feedback components. No dependencies, API contracts or analytics calculations change.

Nodes use returned date-filtered paper counts; zero-count and isolated topics remain visible. Node area scales by count with a minimum visible size. Link width and opacity scale by returned shared-paper counts within the current view. Exact counts and the returned Jaccard fraction (0–1, including null) remain accessible in a strongest-first relationship list and a docked hover/focus tooltip. No Jaccard values are recalculated.

The layout is a static ID-ordered circle rather than a running force simulation. Counts, thresholds and highlighting cannot cause layout jitter; changing the selected topic set can reposition the remaining topics. Position and distance carry no analytical meaning. Large networks scroll locally; labels use two lines, with full names available in accessible names and the detail panel. The inspector stacks below the plot on narrower screens.

Nodes, SVG links and relationship-list buttons support focus and selection. SVG links accept Enter/Space; Escape and Clear highlight reset local selection. The optional `onSelectItem` callback emits a discriminated `RelationshipSelection` containing one or two canonical topic IDs and the response's already-inclusive UTC date bounds, preserving null/unbounded sides. It does not fetch evidence or change global filters.

Minimum shared papers is a positive-integer draft applied explicitly, keeping incomplete edits out of query keys. Thresholding only affects links; returned topic totals stay intact. Known empty, zero-activity, error, retry, cancellation and background-refresh states use the established patterns. Methodology and API warnings remain collapsed; links are explicitly described as co-occurrence, not citations, causality or semantic similarity.

Phase 2D browser verification was unavailable: the browser host and native-app connection could not be accessed. Manual desktop/mobile checks should cover long labels, large/dense networks, local scrolling, hover/focus previews and keyboard selection.


## Topic–Category Heatmap

Categories and Research Intelligence share the extracted `HeatmapCategoryPicker` and `TopicCategoryGrid` in `src/components/heatmap/TopicCategoryGrid.tsx`, with styles in `src/styles/heatmap.css`. The picker retains category chips, search/add/remove, a ten-category limit and Reset to Top 10. The scrollable semantic table adds native keyboard-focusable cell buttons, a docked hover/focus tooltip and persistent local selection. Escape or Clear cell selection clears the highlight. Intelligence keeps category controls in a compact disclosure.

Categories retains its five lavender sequential tokens. Intelligence overrides only its local heatmap variables with shared warm orange tokens: `#FFF5E9`, `#FFE2C0`, `#FFC58C`, `#F39A52`, `#A94712`. The first four levels use navy text; the deepest level uses white. No category calculations or legacy-page colors change. Explicit zeros remain white with a visible zero; unavailable observations/percentages use a patterned fill and a dash. Exact values and context remain in accessible labels/tooltips. Count shading uses the full returned grid maximum; Intelligence percentage shading uses a fixed 0–100% scale. Hiding categories never changes that scale or any denominator.

The adapters preserve different API semantics. Categories still calls its original count-only endpoint, sums duplicate category/topic overlap rows, ranks categories/topics by overlap totals, defaults to its Top 10 and fills absent legacy pairs with zero. Intelligence uses stable numeric IDs and the existing heatmap hook/endpoint with global UTC dates/topics plus category scope. It preserves returned count, category-prevalence and topic-distribution values without calculating percentages or filling missing observations.

Category prevalence's denominator includes all dated category papers, including untagged papers and papers outside the selected topics. Topic distribution's denominator includes all dated topic papers, independent of visible categories or category scope. All scope includes primary/secondary category associations; primary scope uses primary mappings. Null percentages remain unavailable. Overlapping memberships prevent sums from being interpreted as exclusive composition or distinct corpus counts.

The optional `onSelectCell` callback emits `HeatmapSelection`: one topic ID, category ID/code, response category scope, display metric and unchanged inclusive UTC bounds. Missing cells do not emit evidence payloads. Chart components emit selections; the page-level Phase 2H integration below owns evidence requests.

Focused tests cover both adapters, category selection/reset, all metrics and denominator descriptions, null/zero/missing observations, shared query filters/scope, native button accessibility, callbacks, request states/cancellation and legacy Categories behavior. Browser visual verification was unavailable because browser/native connections could not be accessed. Manual checks should cover desktop/mobile scrolling, long headers, the warm scale, focus visibility and category search.


## Phase 2F — Research Composition

The optional “View weekly prevalence trends” disclosure retains Research Composition with its existing composition hook/endpoint and shared URL-backed UTC dates/topics. It displays independent Recharts percentage lines on a 0–100% axis. Values are returned weekly topic prevalence, with the corpus denominator including untagged papers and papers outside the selected topics. Overlapping topics can total above 100%; nothing is stacked, normalized or recalculated.

The chart reuses Momentum's responsive chart shell, tooltip, legend and values-table styling, UTC date formatter and deterministic topic colors. Null values and missing topic observations stay unavailable and break the linear path. The data mapper sorts returned week keys without inventing observations and preserves the complete weekly metadata and corpus counts.

A compact checkbox sends `include_partial_weeks` to the API, defaulting to true. Exclusion does not filter or rescale observations in the frontend. Tooltips show the effective inclusive UTC interval once, partial-week status, corpus denominator, topic percentages and topic paper counts. The collapsed values table exposes every returned topic/week through native keyboard-focusable inspection buttons; chart dots offer equivalent pointer selection. Empty, invalid-range, error/retry, cancellation and background-refresh states follow the shared request patterns, including the 104-week guard.

The optional `onSelectPoint` callback emits `CompositionSelection`: one topic ID, week start, original clipped half-open timestamps, inclusive UTC evidence dates, prevalence metric and partial-week context. Missing observations cannot emit selections. Null prevalence with returned counts remains inspectable. The Phase 2H page-level integration handles this typed selection without a global selection store.

Methodology and response warnings remain in a collapsed disclosure. Historical completeness is unknown even for full weeks. `ResearchRelationships.tsx` and `global.css` received only the explicitly requested Prettier formatting cleanup; their behavior is unchanged.

Automated verification includes real rendered line paths, overlap/null/zero semantics, denominators, UTC/evidence dates, partial-week API behavior, query filters/cancellation, stable colors, keyboard inspection and request states. Browser verification remains unavailable because neither the browser host nor the native-app connection could be accessed. Manual checks should cover desktop/mobile layout, tooltip placement, long topic names, dense date ranges and the values table.


## Analytical workspace refresh — Topic Prevalence Change

The primary prevalence view is a diverging horizontal Recharts bar chart, sorted by signed percentage-point change (ID breaks ties, unavailable observations last). A symmetric zero-centered axis and explicit signed pp labels distinguish this from Matrix's percentage growth. Blue-violet `--color-prevalence-positive` marks increases; muted orange `--color-prevalence-negative` marks decreases. Topic swatches retain the deterministic topic palette in inspection controls and detail views. Zero is unchanged and unavailable comparisons do not enter the numeric axis.

No backend extension is needed. The existing Matrix endpoint resolves the adjacent equal 2–12 complete UTC week windows (default four), bounded by the global interval and current UTC time. The existing Composition endpoint is then requested for their exact union with `include_partial_weeks=false`. For each topic/window, sum weekly distinct topic papers and all-corpus paper counts before dividing. Publication weeks are disjoint, so these sums yield period-level distinct counts. Never average the returned weekly percentages or use the sum of overlapping topic counts as a denominator. Untagged and unselected-topic papers remain in the corpus denominator.

Every expected full week must be returned exactly once with matching effective UTC boundaries and topic observations. Missing, duplicate or partial observations make that comparison unavailable. An explicitly empty week contributes zero counts; a whole window with zero corpus papers has null prevalence. Calendar completeness does not prove ingestion coverage. API warnings remain in collapsed methodology, and independently refreshed responses are not described as one transaction-consistent snapshot.

Keyboard-accessible topic inspection, period counts/prevalences, exact dates, tooltips and a values table accompany the bars. `PrevalenceSelection` extends the existing `MatrixSelection` window contract with chart/metric context; inclusive evidence dates use the existing conversion. Weekly observations retain the original `CompositionSelection` callback. Chart components remain independent of evidence fetching; the Phase 2H integration below handles their typed selections. Weekly trends mount only when expanded and retain partial-week controls, gaps, colors and values-table behavior.

Momentum's legend can emphasize one topic locally without mutating global filters or issuing requests. Matrix's topic controls are compact, with exact growth states/low-baseline caution retained in accessible names and selected details. The network retains every returned edge: width remains linear in shared counts, while opacity uses a monotonic quadratic ramp to soften weak links. Node size, positioning and counts are unchanged in meaning. Exact shared counts and Jaccard remain available in the inspector/list. Its reduced minimum height preserves spatial room and deliberate local scrolling.

All workspace disclosures use native `details`/`summary`, a consistent chevron, compact spacing, visible focus and restrained hover feedback. No expansion animation delays interaction. Values tables scroll locally. Heatmap column headers and category labels remain sticky within its bounded scroll region; the category chooser explicitly names its action. Count shading still uses the full returned-grid maximum, and percentage metrics use a fixed 0–100 domain. Selecting categories never changes either domain.

Automated tests cover period aggregation with unequal weekly denominators, overlapping topics, positive/negative/zero/unavailable changes, complete-window boundaries, missing/duplicate/partial weeks, filters, comparison selector, callbacks, keyboard inspection and request states. Existing Overview, Explorer and Intelligence suites provide regression coverage. Browser visual verification remains unavailable (browser host unavailable; native Safari attachment timed out). Manual checks should cover desktop/mobile control wrapping, label/tooltip placement, dense networks and heatmap scrolling.


## Final UX polish and analytical navigation

A centered floating frosted pill near the introduction communicates Activity → Growth → Prevalence → Connections → Categories. Links target the five existing analytical sections without adding routes or changing query filters. Sticky positioning keeps the pill visible independently of the main navbar's hide-on-scroll transform, at `--analytical-nav-top` below the main header. Shared `--surface-navigation` and `--navigation-blur` tokens match the main navbar's translucent surface, with a restrained border and `--shadow-sm` distinguish it without adding another filter surface.

`IntersectionObserver` watches the viewport below the pill. The first intersecting section in narrative order is active, so tall charts are not penalized by their intersection ratio. A fully visible final section takes precedence so a short heatmap can activate at the page bottom; scrolling up restores the preceding visible section. The current section receives an `aria-current="location"` blue-violet capsule. Gaps retain the last active stage; viewport resizing recreates the observation region, and unmount disconnects it. Browsers without observation retain usable native anchors and click highlighting. The pill does not compress or wrap labels: a horizontal list scrolls locally on narrow screens. Offscreen active labels are revealed horizontally without scrolling the page. Native focus remains on the user's current control.

The document scrolls smoothly only while Intelligence is mounted; reduced-motion mode uses immediate scrolling. Section scroll margins reserve the main header, pill height and a 1rem gap, even when the main header is hidden. Targets remain programmatically focusable and receive a restrained `:target` border. Keyboard outlines use `:focus-visible`; hover/click feedback remains subtle.

`IntelligenceChartHeader` aligns a visualization's title/question left and locally owned controls right on desktop. Headers wrap below their descriptions on mobile, and heatmap selectors stack with consistent labels/control heights. Matrix and Prevalence selectors remain independent. Shared panel rhythm uses compact 0.75rem internal gaps, aligned comparison dates and lightly separated optional details. Disclosures retain native expanded state, keyboard interaction, chevrons and visible focus; expanded summaries gain blue-violet emphasis without animated height or decorative panels.

Prevalence axes use explicit symmetric nice-number ticks with zero included. Tick precision follows step size, with Unicode minus signs, signed positive values and pp units; zero is labeled `0`. This removes floating-point display artifacts without changing prevalence values, counts, denominators, sorting, exact tooltips or evidence selections. A stronger zero reference and adjusted margins keep positive and negative bars legible.

`StrongestConnections` is a separate reusable, removable component alongside the retained network inspector. It owns only the ranking selector; network selection remains in `RelationshipsVisualization`. The five leading returned edges rank by shared-paper count by default, optionally by returned Jaccard fraction. Ties use shared count then canonical topic IDs. Null Jaccard values follow valid zero scores and remain unavailable; no similarity is calculated. Long lists scroll locally within 15rem. A selected edge outside the five is pinned separately without changing the rankings or hiding any network edges.

The strongest shared-paper pair is initially highlighted without emitting an evidence callback. Ranked rows, graph links/nodes and the full relationship table share existing selection/preview handlers and unchanged payloads. Clear/Escape removes the highlight rather than immediately selecting it again. Current-network counts replace the former empty instruction panel after clearing; empty/disconnected data retains its existing states. To remove the experimental ranked panel, remove its import/render from `ResearchRelationships`; the graph, inspector, selection contracts and other polish remain independent.

Heatmap category changes remount only the internal scroll region through an optional `scrollKey`, resetting horizontal and vertical offsets. Category controls and inspection state remain mounted, so selection of a still-visible cell is retained; metric changes preserve scrolling. Scope/date/topic changes continue using the existing visualization key. The initial up-to-ten categories retain API ordering. The orange palette, count/percentage domains, zero/unavailable semantics and legacy Categories behavior are unchanged. The top-left category heading is sticky above both scrolling axes.

Focused checks cover tick precision, target mapping and focusability, independent selectors, shared/Jaccard ordering (including ties, zero and null), initial/explicit/cleared selections, graph/list synchronization, pinned selections, empty networks and category scroll reset. Browser host access remains unavailable and native Safari attachment timed out, so desktop/mobile layout, native anchor focus/scroll offset, long ranked labels and sticky heatmap intersections still require visual verification.


## Shared atmospheric surface and navigation finish

`--surface-page` in `tokens.css` supplies the shared atmospheric blue/lavender page background for Overview and Research Intelligence. The global body applies it against the viewport, so the long analytical page retains the same soft glow as the executive snapshot. Individual chart cards and Overview's layout/hero geometry are unchanged. The Intelligence introduction uses deliberate top/bottom spacing, a tight navy title and a quieter subtitle without a new banner or KPI row.

The mobile drawer uses `--color-sidebar-background`, light `--color-sidebar-text` and readable `--color-sidebar-muted` for inactive descriptions/eyebrows/footer. Its active capsule uses the darker primary accent for white-text contrast. All drawer rules now live in `navigation.css`, including the backdrop, inset, full border, rounded bottom corners, shadow, dynamic viewport height and local overflow. Safe-area-aware padding keeps every edge inside the viewport. A short product footer is separated by a divider; it makes no live-data or coverage claims.

The existing modal behavior is preserved: inert background, scroll lock, focus loop, Escape/backdrop dismissal and trigger focus restoration. The shared main navbar still hides down/reappears up. Main navigation and pill use blue keyboard rings, while the navy drawer uses the shared lavender `--color-navigation-focus` token. Mouse interactions do not retain prominent focus outlines.

Automated coverage includes observer section changes, resize/unmount cleanup, native anchor/query preservation, keyboard focus, horizontal-only active-label scrolling, drawer footer/dismissal/inertness and existing analytical/Explorer/Overview regressions. Remaining visual checks are desktop/mobile sticky offsets, frosted rendering, narrow pill scrolling, drawer contrast and short-viewport/safe-area scrolling.


This finish passed 167 frontend tests, TypeScript checks, formatting, changed-file ESLint and production build checks. Full lint retains the three existing effect-state errors in AuthorProfile, Authors and Papers; the existing large-bundle warning remains. Browser access could not be used: the browser host was unavailable and native computer-use permissions were not granted. No screenshot verification is claimed.


## Phase 2H — Contextual evidence and Paper Explorer

`EvidenceDrawer` is a light frosted sheet on the right (maximum 36rem) with a restrained backdrop. On mobile it fills the width. Charts retain their size and remain visible behind the modal. The drawer includes an observation summary, actual publication metadata, bounded pagination, coverage disclosure and “Open in Paper Explorer”. It uses shared surface, blur, border, typography and button tokens; `paperDiscovery.css` owns the compact result rows and drawer layout. No transition delays interaction or conflicts with reduced-motion settings.

`PaperResults` and `PaperPagination` serve both discovery interfaces and independent Explorer results. Rows preserve stored/versioned paper IDs, UTC publication dates, supplied authors, primary/category/topic metadata, abstract previews and actual arXiv URLs. Missing optional metadata is omitted. There are no per-paper metadata requests, synthesized links, scores, citation estimates or summaries. Existing paper detail routes remain, with a URL-backed `return_to` context as well as existing navigation state so refreshing a detail page can return to the same Explorer context.

`EvidenceResults` reuses `useIntelligenceEvidence`, its canonical query keys, five-minute cache, explicit retries and request cancellation. It mounts only after an explicit selection or an imported Explorer URL. Ten records per page are requested, with returned totals/has-more values; empty and unavailable responses remain distinct from failures. Opening the same page in Explorer reuses the evidence cache. Results are ordered by the existing endpoint (publication timestamp descending, stored ID ascending); frontend filtering or resorting never changes the evidence population.

The existing chart callbacks feed a small typed `EvidenceContext` adapter rather than a second global store. Momentum uses effective clipped topic/week dates (count and index share the same underlying paper cohort); chart dots and the keyboard-accessible values table can open evidence. Matrix and Prevalence use explicit current/previous inspection actions and keep the two windows separate. Prevalence evidence is described as window contributors, not proof of an increase: its denominator remains all indexed papers. Weekly composition inspection is also retained. Relationships passes one topic for nodes or both canonical IDs for an edge, using the endpoint's intersection semantics. Heatmap passes its topic, category code, scope and inclusive dates unchanged. Primary scope exactly matches the fact primary code; all scope includes secondary associations. Backend reconciliation tests already cover these populations, so no API/backend extension is required.

`/papers?evidence=v1&source=…` stores repeated numeric `topic_id`s, inclusive publication bounds, category/scope, comparison window/duration, chart metric, partial-week metadata and optional page. Topic names are resolved from configured topics (ID labels remain when unavailable). Refresh/back/forward restore the query. Unknown versions, unsupported/duplicate parameters, invalid dates/IDs/pages, incomplete comparisons and conflicting scopes are blocked instead of dropped. Unknown topic/category values remain backend validation errors. Context-only fields are never sent as unsupported API parameters.

Paper Explorer has two explicit modes. Imported contexts retain the exact analytical cohort through the evidence endpoint and, from Phase 2I, permit server-side keyword refinement and sorting within it. The existing independent search/sort/filter architecture remains available after “Clear imported context”. Unsupported URL constraints still yield an error rather than broadening results. Clearing the context removes every imported constraint and returns to normal independent discovery.

`useModalFocus` extracts the existing navigation drawer's focus loop, Escape handling, scroll lock and focus restoration. The evidence portal additionally makes other body surfaces inert (including the main navbar/pill), restores their previous inert states on close, and returns focus to the originating control without scrolling the chart. Pointer-only chart observations restore to their focusable plot/section; a removed trigger falls back to main content. The existing mobile navigation dialog uses the shared hook without changing its shell-managed inertness. Tab trapping is recalculated as results load or pages change. No focus or evidence request is triggered by the network's initial strongest-pair highlight.

Tests combine existing chart-emission coverage with page-level wiring for every chart, exact UTC/intersection/category filters, optional weekly prevalence, comparison labels, missing metadata/versioned IDs, modal focus/inertness/dismissal, pagination/cache reuse, cancellation, retry/empty states, URL restoration, clearing imported context and unsupported-filter blocking. Browser verification remains necessary for desktop/mobile sheet width, long metadata, background visibility, focus rings, internal scrolling and reduced-motion behavior. No backend contracts or analytical definitions change.


## Phase 2I — Searchable evidence exploration

Imported evidence uses a compact source/topic heading with wrapping chips for inclusive UTC dates, comparison window, category scope, metric and partial-week context. Explanations move into “About this selection” rather than repeating lines in the primary summary. `EvidenceSummary`'s compact variant is confined to Explorer; the Evidence Drawer retains its existing summary and selection semantics. Clear imported context resets to a clean independent search.

`PaperSearchToolbar` supplies the labeled keyword field, submit button and sorting control for both browsing modes. Independent browsing retains manual submit, category/date/topic filters and its existing newest/oldest/relevance options. Imported evidence offers newest, oldest and title A–Z, with a separate Clear search action. Controls wrap without squeezing labels on mobile. The toolbar sits immediately below the imported summary.

Explorer waits 350ms after keyword edits before committing `q`; submit and sorting apply immediately. URL changes synchronize the draft without effect-driven state resets. Changing keywords or sorting removes `page`; clearing keywords preserves the analytical context and current sort. `q`, `sort` and page are included in refresh-safe URLs and paper-detail return links. Existing default URLs remain unchanged: absent `q` and omitted `published_desc` map to the old evidence query key, preserving Drawer/Explorer cache reuse. Unknown sorts, duplicate or unsupported URL parameters and overlong queries are rejected explicitly.

`EvidenceRefinement` stays separate from `EvidenceContext`. Refinements cannot replace topic IDs, inclusive dates, category/scope, comparison metadata or chart metric. The existing evidence hook adds q/sort to its canonical query key and forwards cancellation, so stale searches cannot populate a newer view. No in-browser filtering or sorting of a single page occurs, and no chart calculations or callbacks change.

The API returns `supporting_total` for the original cohort and `total` for the keyword-refined result. Explorer shows “N supporting indexed publications” without keywords and “M matching publications out of N supporting indexed publications” with them, using only those backend counts. Empty matches retain the original cohort size. During loading/error states there is no fabricated zero. A refined response from an older server without `supporting_total` is explicitly unavailable; broader records are not displayed as search matches. The unrefined Drawer remains compatible with prior response fields.

The server reuses independent paper discovery's English full-text search expression on title and abstract, within the original UTC/topic-intersection/category cohort. Sort order is whitelisted and deterministic before pagination, with stored/versioned IDs as tie-breakers. Both counts and the bounded result page use one SQL snapshot. No analytical endpoints, warehouse schema, topic classifications or Evidence Drawer interaction semantics change.

Focused tests cover debounce and immediate submit, complete constraint preservation, exact count labels, sorting/page reset, URL refresh/history, clearing keyword versus context, empty matches, invalid sorts, older-server responses, stale request cancellation and independent-search regressions. Read-only PostgreSQL fixtures verify full-text matching, original/refined counts, all/primary category scopes, intersections and stable ordering across equal dates/titles and versioned IDs. Desktop/mobile visual checks remain necessary for summary chips, toolbar wrapping, keyboard focus and long result metadata.
