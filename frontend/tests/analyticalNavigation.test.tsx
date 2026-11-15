import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticalNavigation } from "../src/components/intelligence/AnalyticalNavigation";

const sections = [
  ["research-momentum", "Activity"],
  ["momentum-matrix", "Growth"],
  ["topic-prevalence-change", "Prevalence"],
  ["research-relationships", "Connections"],
  ["topic-category-heatmap", "Categories"],
];
function Workspace() {
  return (
    <>
      <AnalyticalNavigation />
      {sections.map(([id, label]) => (
        <section key={id} id={id} tabIndex={-1}>
          <h2>{label} observations</h2>
        </section>
      ))}
    </>
  );
}
function observeMock() {
  const observers: {
    callback: IntersectionObserverCallback;
    options?: IntersectionObserverInit;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        const observer = { callback, options, observe: vi.fn(), disconnect: vi.fn() };
        observers.push(observer);
        return observer;
      }
    },
  );
  return observers;
}
function emit(
  callback: IntersectionObserverCallback,
  id: string,
  intersecting = true,
  ratio = 0.01,
) {
  act(() =>
    callback(
      [
        {
          target: document.getElementById(id)!,
          isIntersecting: intersecting,
          boundingClientRect: new DOMRect(0, 0, 720, 500),
          intersectionRatio: intersecting ? ratio : 0,
          intersectionRect: new DOMRect(0, 0, 720, intersecting ? 1 : 0),
          rootBounds: null,
          time: 0,
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    ),
  );
}
function activeLink() {
  const navigation = screen.getByRole("navigation", { name: "Analytical journey" });
  return within(navigation)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "location");
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("Floating analytical navigation", () => {
  it("observes all sections at the reading line below the pill and highlights one visible stage", () => {
    const observers = observeMock();
    vi.stubGlobal("innerHeight", 800);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 80, 500, 56),
    );
    render(
      <>
        <style>{".analytical-navigation { top: 80px; }"}</style>
        <Workspace />
      </>,
    );
    const observer = observers[0];
    expect(observer.observe.mock.calls.map(([target]) => (target as HTMLElement).id)).toEqual(
      sections.map(([id]) => id),
    );
    expect(observer.options?.rootMargin).toBe("-152px 0px 0px 0px");
    expect(activeLink().map((link) => link.textContent)).toEqual(["Activity"]);
    emit(observer.callback, "momentum-matrix");
    expect(activeLink().map((link) => link.textContent)).toEqual(["Growth"]);
    emit(observer.callback, "momentum-matrix", false);
    expect(activeLink().map((link) => link.textContent)).toEqual(["Growth"]);
    emit(observer.callback, "topic-prevalence-change");
    expect(activeLink().map((link) => link.textContent)).toEqual(["Prevalence"]);
    emit(observer.callback, "topic-prevalence-change", false);
    emit(observer.callback, "research-relationships");
    expect(activeLink().map((link) => link.textContent)).toEqual(["Connections"]);
    emit(observer.callback, "research-momentum");
    expect(activeLink().map((link) => link.textContent)).toEqual(["Activity"]);
  });
  it("recognizes a short final section at the page bottom and restores the preceding stage on scroll up", () => {
    const observers = observeMock();
    render(<Workspace />);
    const callback = observers[0].callback;
    emit(callback, "research-relationships");
    emit(callback, "topic-category-heatmap", true, 0.3);
    expect(activeLink().map((link) => link.textContent)).toEqual(["Connections"]);
    emit(callback, "topic-category-heatmap", true, 1);
    expect(activeLink().map((link) => link.textContent)).toEqual(["Categories"]);
    emit(callback, "topic-category-heatmap", true, 0.8);
    expect(activeLink().map((link) => link.textContent)).toEqual(["Connections"]);
  });
  it("rebuilds observation when the viewport resizes and disconnects on unmount", () => {
    const observers = observeMock();
    const view = render(<Workspace />);
    fireEvent.resize(window);
    expect(observers).toHaveLength(2);
    expect(observers[0].disconnect).toHaveBeenCalledTimes(1);
    expect(observers[1].observe).toHaveBeenCalledTimes(5);
    view.unmount();
    expect(observers[1].disconnect).toHaveBeenCalledTimes(1);
    fireEvent.resize(window);
    expect(observers).toHaveLength(2);
  });
  it("retains focusable native anchors and query filters, with a click fallback when observation is unavailable", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    window.history.replaceState(null, "", "/intelligence?range=12w&topic_id=5");
    render(<Workspace />);
    const link = screen.getByRole("link", { name: "Connections" });
    expect(link.getAttribute("href")).toBe("#research-relationships");
    act(() => link.focus());
    expect(document.activeElement).toBe(link);
    fireEvent.click(link);
    expect(activeLink().map((current) => current.textContent)).toEqual(["Connections"]);
    await waitFor(() => expect(window.location.hash).toBe("#research-relationships"));
    expect(window.location.search).toBe("?range=12w&topic_id=5");
    expect(window.location.pathname).toBe("/intelligence");
  });
  it("reveals an offscreen active label by scrolling only the pill horizontally", () => {
    const observers = observeMock();
    render(<Workspace />);
    const list = screen.getByRole("list");
    const link = screen.getByRole("link", { name: "Categories" });
    Object.defineProperty(list, "clientWidth", { value: 150, configurable: true });
    Object.defineProperty(link, "offsetLeft", { value: 400, configurable: true });
    Object.defineProperty(link, "offsetWidth", { value: 100, configurable: true });
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;
    const pageScroll = vi.fn();
    vi.stubGlobal("scrollTo", pageScroll);
    emit(observers[0].callback, "topic-category-heatmap");
    expect(scrollTo).toHaveBeenCalledWith({ left: 350, behavior: "instant" });
    expect(pageScroll).not.toHaveBeenCalled();
    expect(activeLink().map((current) => current.textContent)).toEqual(["Categories"]);
  });
});
