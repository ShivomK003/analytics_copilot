import { useId, useRef, useState } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useModalFocus } from "../../hooks/useModalFocus";
import type { TopicOption } from "../../types/intelligence";
import type { EvidenceContext } from "../../utils/evidenceContext";
import { evidenceExplorerUrl } from "../../utils/evidenceContext";
import { EvidenceResults } from "./EvidenceResults";
import { EvidenceSummary } from "./EvidenceSummary";
import "../../styles/paperDiscovery.css";

export function EvidenceDrawer({
  context,
  topics,
  onClose,
  returnFocusRef,
}: {
  context: EvidenceContext;
  topics?: TopicOption[];
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | SVGElement | null>;
}) {
  const [page, setPage] = useState(1);
  const drawerRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useModalFocus({
    isOpen: true,
    containerRef: drawerRef,
    returnFocusRef,
    onClose,
    isolateBackground: true,
  });
  return createPortal(
    <div className="evidence-backdrop" role="presentation" onClick={onClose}>
      <div
        className="evidence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={drawerRef}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="evidence-drawer-header">
          <h2 id={headingId}>Supporting indexed publications</h2>
          <button
            type="button"
            className="button button-secondary"
            aria-label="Close evidence"
            onClick={onClose}
          >
            Close
          </button>
        </header>
        <EvidenceSummary context={context} topics={topics} />
        <Link
          className="button button-accent evidence-explorer-link"
          to={evidenceExplorerUrl(context, page)}
        >
          Open in Paper Explorer
        </Link>
        <EvidenceResults
          key={JSON.stringify(context)}
          context={context}
          page={page}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            drawerRef.current?.scrollTo?.({ top: 0, behavior: "instant" });
          }}
        />
      </div>
    </div>,
    document.body,
  );
}
