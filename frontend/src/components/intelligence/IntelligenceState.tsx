import { useEffect, useState } from "react";
import { ApiError } from "../../api/client";
import { EmptyState } from "../feedback/EmptyState";
import { ErrorState } from "../feedback/ErrorState";

export function IntelligenceLoading({ label }: { label: string }) {
  return (
    <div className="feedback-state" role="status" aria-live="polite">
      <p>{label}</p>
    </div>
  );
}

export function IntelligenceEmpty({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}

/** Respect server cooldowns for manual retry; no background retry loop is created. */
export function IntelligenceError({
  error,
  onRetry,
  label = "data",
}: {
  error: Error;
  onRetry: () => void;
  label?: string;
}) {
  const [receivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(receivedAt);
  const apiError = error instanceof ApiError ? error : null;
  const retryAt = receivedAt + (apiError?.retryAfterMs ?? 0);
  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1000));
  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const title =
    apiError?.status === 422
      ? "Check the request filters"
      : apiError?.status === 503
        ? "Database temporarily busy"
        : apiError?.status === 500
          ? "Server error"
          : `Unable to load ${label}`;
  const description =
    apiError?.status === 503
      ? "Database capacity is temporarily unavailable. Your filters have been kept."
      : apiError
        ? apiError.message
        : "A network error interrupted the request. Check your connection and try again.";
  return (
    <ErrorState
      title={title}
      description={description}
      action={
        <button
          type="button"
          className="button button-accent"
          disabled={seconds > 0}
          onClick={onRetry}
        >
          {seconds > 0 ? `Retry in ${seconds}s` : `Retry ${label}`}
        </button>
      }
    />
  );
}
