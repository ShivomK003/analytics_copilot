# Dashboard Phase A --- Product Design & Information Architecture

## Status

**Status:** ✅ Complete

This document records the completed product design decisions for the
frontend dashboard of the **AI Research Intelligence Copilot**. It
serves as the architectural blueprint before any React implementation
begins.

------------------------------------------------------------------------

# Objectives

The dashboard should:

-   Present AI research activity in a clear and analytical manner.
-   Transform continuously updated arXiv data into actionable insights.
-   Act as the presentation layer above the ETL pipeline, warehouse,
    analytics views, and FastAPI backend.
-   Provide an intuitive path from high-level summaries to detailed
    paper exploration.

------------------------------------------------------------------------

# Primary User

-   AI researchers
-   Data scientists
-   Students
-   Engineers
-   Technical recruiters and interviewers reviewing the portfolio

------------------------------------------------------------------------

# Dashboard Purpose

The dashboard should answer:

1.  How much AI research is being published?
2.  Which topics and categories are most active?
3.  Which topics, categories, and authors are growing?
4.  Which new papers should users read?

------------------------------------------------------------------------

# Page Structure

## Primary Navigation

-   Overview
-   Trends
-   Topics
-   Categories
-   Authors
-   Papers

Future:

-   Copilot

------------------------------------------------------------------------

# Route Structure

``` text
/
└── redirects to /overview

/overview
/trends
/topics
/categories
/authors
/papers
```

------------------------------------------------------------------------

# Global Layout

Desktop:

-   Persistent left sidebar
-   Top utility header
-   Responsive content area

Tablet:

-   Collapsible drawer navigation

Mobile:

-   Top header
-   Navigation drawer

------------------------------------------------------------------------

# Overview Page

Sections:

1.  Page Header
2.  KPI Cards
3.  Weekly Publication Trend
4.  Topic Distribution
5.  Topic Momentum
6.  Primary Category Preview
7.  Top Authors Preview
8.  Latest Papers Preview

Primary API:

    GET /dashboard/home

------------------------------------------------------------------------

# Trends Page

Purpose:

Publication velocity and historical growth.

Endpoints:

-   `/trends/daily`
-   `/trends/weekly`
-   `/trends/monthly`
-   `/trends/cumulative`

------------------------------------------------------------------------

# Topics Page

Purpose:

Semantic topic analysis.

Endpoints:

-   `/topics/distribution`
-   `/topics/weekly`
-   `/topics/growth`

------------------------------------------------------------------------

# Categories Page

Purpose:

Formal arXiv category analysis.

Endpoints:

-   `/categories/distribution`
-   `/categories/primary-distribution`
-   `/categories/weekly`
-   `/categories/growth`
-   `/categories/topic-matrix`

Important UI distinction:

-   Primary Categories
-   All Category Associations

------------------------------------------------------------------------

# Authors Page

Purpose:

Researcher activity and collaboration.

Endpoints:

-   `/authors/rankings`
-   `/authors/topics`
-   `/authors/statistics`

Disclaimer:

Author names are not guaranteed unique identities.

------------------------------------------------------------------------

# Papers Page

Purpose:

Research discovery.

Endpoint:

    GET /dashboard/latest-papers

Initial MVP:

-   Paper cards
-   Abstract preview
-   Topic badges
-   Category badges
-   arXiv link
-   PDF link

------------------------------------------------------------------------

# Shared Component Inventory

## Layout

-   AppShell
-   Sidebar
-   MobileDrawer
-   TopHeader
-   PageContainer
-   PageHeader
-   PageSection
-   ResponsiveGrid

## Data Components

-   KpiCard
-   PaperCard
-   RankedList
-   DataTable
-   BadgeGroup
-   StatusBadge

## Charts

-   TimeSeriesChart
-   HorizontalBarChart
-   Heatmap
-   MultiSeriesLineChart
-   ChartCard

## Feedback

-   PageSkeleton
-   CardSkeleton
-   ChartSkeleton
-   EmptyState
-   ErrorState
-   RetryButton

------------------------------------------------------------------------

# API → UI Mapping

  API                          UI
  ---------------------------- -----------------
  `/dashboard/home`            Overview
  `/trends/*`                  Trends Page
  `/topics/*`                  Topics Page
  `/categories/*`              Categories Page
  `/authors/*`                 Authors Page
  `/dashboard/latest-papers`   Papers Page

------------------------------------------------------------------------

# Visual Direction

Theme:

-   Modern
-   Clean
-   Analytical
-   Research-oriented

Design:

-   Light theme
-   Neutral backgrounds
-   White cards
-   Single accent colour
-   Spacious layout
-   Minimal shadows
-   Strong typography

------------------------------------------------------------------------

# Responsive Behaviour

Desktop:

-   Sidebar
-   Multi-column analytics

Tablet:

-   Drawer
-   Adaptive grids

Mobile:

-   Single-column layout
-   Responsive charts
-   Card-based content

------------------------------------------------------------------------

# UI States

Every page should define:

-   Loading
-   Background Refresh
-   Empty
-   Error
-   Stale Data
-   ETL Warning

------------------------------------------------------------------------

# Backend Requirements

No backend work is required for Dashboard Phase A.

Existing backend already provides:

-   ETL pipeline
-   Warehouse
-   Analytics views
-   FastAPI endpoints
-   Dashboard endpoint
-   Validation
-   Connection pooling

------------------------------------------------------------------------

# Deliverables Completed

-   Product definition
-   Dashboard information architecture
-   Navigation
-   Route structure
-   Responsive layouts
-   Wireframes
-   Component hierarchy
-   API-to-component mapping
-   Visual design direction
-   Loading, empty and error states
-   Responsive strategy
-   Backend gap analysis
-   MVP scope

------------------------------------------------------------------------

# Dashboard Phase A Status

**Complete**

The project is now ready to begin **Dashboard Phase B -- Frontend
Foundation**.
