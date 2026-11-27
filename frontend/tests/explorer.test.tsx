import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { AuthorProfilePage } from "../src/pages/AuthorProfilePage";
import { AuthorsPage } from "../src/pages/AuthorsPage";
import { PapersPage } from "../src/pages/PapersPage";

function explorer(path: "authors" | "papers") {
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      new Response(JSON.stringify(url.includes("/count") ? { total: 0 } : []), {
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const router = createMemoryRouter(
    [{ path: `/${path}`, element: path === "authors" ? <AuthorsPage /> : <PapersPage /> }],
    { initialEntries: [`/${path}`] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, fetch };
}

it("preserves author search and topic selection with shared controls", async () => {
  const { router, fetch } = explorer("authors");
  await screen.findByText("No researchers found");
  fireEvent.change(screen.getByLabelText("Search researcher names"), {
    target: { value: "Researcher" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(router.state.location.search).toBe("?query=Researcher"));
  fireEvent.change(screen.getByLabelText("Research topic"), { target: { value: "llm" } });
  expect(new URLSearchParams(router.state.location.search).get("topic")).toBe("llm");
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url]) => url.includes("query=Researcher") && url.includes("topic=llm"),
      ),
    ).toBe(true),
  );
});

it("retains an author search draft for topic edits and resets it on query navigation", async () => {
  const { router } = explorer("authors");
  await screen.findByText("No researchers found");
  const input = screen.getByLabelText<HTMLInputElement>("Search researcher names");
  fireEvent.change(input, { target: { value: "unfinished draft" } });
  fireEvent.change(screen.getByLabelText("Research topic"), { target: { value: "llm" } });
  expect(input.value).toBe("unfinished draft");

  await act(async () => {
    await router.navigate("/authors?query=Committed");
  });
  expect(input.value).toBe("Committed");

  fireEvent.change(input, { target: { value: "another draft" } });
  await act(async () => {
    await router.navigate(-1);
  });
  expect(input.value).toBe("");

  fireEvent.change(input, { target: { value: "draft without query" } });
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(input.value).toBe("");
});

it("opens a new author profile at the first page with all topics", async () => {
  const fetch = vi.fn((path: string) => {
    const url = new URL(path, "https://example.test");
    const papers = Array.from({ length: 11 }, (_, index) => ({
      paper_id: String(index),
      title: `Paper ${index}`,
      topics: [],
    }));
    const body =
      url.pathname === "/authors/topics"
        ? [{ topic_id: 1, topic_name: "llm", paper_count: 11 }]
        : url.pathname.endsWith("/papers")
          ? papers
          : {
              author_name: `Researcher ${url.pathname.split("/").at(-1)}`,
              paper_count: 11,
              distinct_topic_count: 1,
              distinct_category_count: 1,
            };
    return Promise.resolve(Response.json(body));
  });
  vi.stubGlobal("fetch", fetch);
  const router = createMemoryRouter(
    [{ path: "/authors/:authorId", element: <AuthorProfilePage /> }],
    { initialEntries: ["/authors/1"] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  await screen.findByRole("option", { name: "llm" });
  fireEvent.change(screen.getByLabelText("Filter by topic"), { target: { value: "llm" } });
  fireEvent.click(await screen.findByRole("button", { name: "Next" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([path]) =>
        path.includes("/authors/1/papers?topic=llm&limit=11&offset=10"),
      ),
    ).toBe(true),
  );

  await act(async () => {
    await router.navigate("/authors/2");
  });
  await screen.findByRole("heading", { name: "Researcher 2" });
  expect(screen.getByLabelText<HTMLSelectElement>("Filter by topic").value).toBe("");
  expect(
    fetch.mock.calls.map(([path]) => path).filter((path) => path.includes("/authors/2/papers")),
  ).toEqual([expect.stringContaining("/authors/2/papers?limit=11&offset=0")]);
});

it("preserves paper search, UTC date filters, sorting and reset", async () => {
  const { router, fetch } = explorer("papers");
  await screen.findByText("No publications found");
  fireEvent.change(screen.getByLabelText("Search papers"), { target: { value: "reasoning" } });
  fireEvent.change(screen.getByLabelText("arXiv category"), { target: { value: "cs.AI" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  fireEvent.change(screen.getByLabelText("Published from"), { target: { value: "2026-07-01" } });
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "oldest" } });
  const params = new URLSearchParams(router.state.location.search);
  expect(params.get("query")).toBe("reasoning");
  expect(params.get("category")).toBe("cs.AI");
  expect(params.get("date_from")).toBe("2026-07-01");
  expect(params.get("sort")).toBe("oldest");
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(
        ([url]) => url.includes("sort=oldest") && url.includes("date_from=2026-07-01"),
      ),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect(router.state.location.search).toBe("");
});

it("keeps independent search drafts across date/sort edits and restores URL-backed inputs", async () => {
  const { router } = explorer("papers");
  await screen.findByText("No publications found");
  fireEvent.change(screen.getByLabelText("Search papers"), {
    target: { value: "unfinished draft" },
  });
  fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "oldest" } });
  expect((screen.getByLabelText("Search papers") as HTMLInputElement).value).toBe(
    "unfinished draft",
  );
  await act(async () => {
    await router.navigate("/papers?query=restored&category=cs.CV");
  });
  expect((screen.getByLabelText("Search papers") as HTMLInputElement).value).toBe("restored");
  expect((screen.getByLabelText("arXiv category") as HTMLInputElement).value).toBe("cs.CV");
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  fireEvent.change(screen.getByLabelText("Search papers"), {
    target: { value: "draft without query" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
  expect((screen.getByLabelText("Search papers") as HTMLInputElement).value).toBe("");
});
