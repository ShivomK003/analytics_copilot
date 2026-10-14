import { createBrowserRouter, Navigate } from "react-router-dom";
import { ShellLayout } from "./ShellLayout";
import { AuthorsPage } from "../pages/AuthorsPage";
import { CategoriesPage } from "../pages/CategoriesPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { OverviewPage } from "../pages/OverviewPage";
import { PapersPage } from "../pages/PapersPage";
import { TopicsPage } from "../pages/TopicsPage";
import { TrendsPage } from "../pages/TrendsPage";
import { AuthorProfilePage } from "../pages/AuthorProfilePage";
import { PaperProfilePage } from "../pages/PaperProfilePage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <ShellLayout />,
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <OverviewPage /> },
      { path: "trends", element: <TrendsPage /> },
      { path: "topics", element: <TopicsPage /> },
      { path: "categories", element: <CategoriesPage /> },
      { path: "authors", element: <AuthorsPage /> },
      { path: "authors/:authorId", element: <AuthorProfilePage /> },
      { path: "papers", element: <PapersPage /> },
      { path: "papers/:paperId", element: <PaperProfilePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
