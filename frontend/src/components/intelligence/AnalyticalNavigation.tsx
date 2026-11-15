import { useEffect, useRef, useState } from "react";

const analyticalSections = [
  { id: "research-momentum", label: "Activity" },
  { id: "momentum-matrix", label: "Growth" },
  { id: "topic-prevalence-change", label: "Prevalence" },
  { id: "research-relationships", label: "Connections" },
  { id: "topic-category-heatmap", label: "Categories" },
] as const;
type SectionId = (typeof analyticalSections)[number]["id"];

export function AnalyticalNavigation() {
  const [activeId, setActiveId] = useState<SectionId>(analyticalSections[0].id);
  const navigationRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const sections = analyticalSections.flatMap(({ id }) => {
      const section = document.getElementById(id);
      return section ? [section] : [];
    });
    let observer: IntersectionObserver | undefined;
    function observeSections() {
      observer?.disconnect();
      const navigation = navigationRef.current;
      if (!navigation) return;
      const top = Number.parseFloat(getComputedStyle(navigation).top) || 0;
      const height = navigation.getBoundingClientRect().height;
      const viewportHeight = window.innerHeight;
      const readingLine = Math.min(Math.round(top + height + 16), viewportHeight - 1);
      const visibility = new Map<string, IntersectionObserverEntry>();
      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => visibility.set(entry.target.id, entry));
          const last = analyticalSections[analyticalSections.length - 1];
          // A short final section may be fully visible before it reaches the reading line.
          const current =
            visibility.get(last.id)?.intersectionRatio === 1
              ? last
              : analyticalSections.find(({ id }) => visibility.get(id)?.isIntersecting);
          if (current) setActiveId(current.id);
        },
        { rootMargin: `-${readingLine}px 0px 0px 0px`, threshold: [0, 1] },
      );
      sections.forEach((section) => observer!.observe(section));
    }
    observeSections();
    window.addEventListener("resize", observeSections);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", observeSections);
    };
  }, []);

  useEffect(() => {
    const list = listRef.current;
    const link = list?.querySelector<HTMLElement>('[aria-current="location"]');
    if (!list || !link) return;
    const left = link.offsetLeft;
    const right = left + link.offsetWidth;
    const visibleRight = list.scrollLeft + list.clientWidth;
    const nextLeft =
      left < list.scrollLeft ? left : right > visibleRight ? right - list.clientWidth : null;
    if (nextLeft !== null) {
      list.scrollTo?.({ left: nextLeft, behavior: "instant" });
    }
  }, [activeId]);

  return (
    <nav className="analytical-navigation" aria-label="Analytical journey" ref={navigationRef}>
      <ol ref={listRef}>
        {analyticalSections.map(({ id, label }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={activeId === id ? "location" : undefined}
              onClick={(event) => {
                if (
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.shiftKey &&
                  !event.altKey &&
                  event.button === 0
                ) {
                  setActiveId(id);
                }
              }}
            >
              {label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
