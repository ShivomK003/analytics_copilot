import type { ReactNode } from "react";
import { RetryButton } from "./RetryButton";

type ErrorStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorState({
  title,
  description,
  action,
  onRetry,
  retryLabel,
}: ErrorStateProps) {
  return (
    <div className="feedback-state" role="alert">
      <span className="feedback-state-eyebrow">Something needs attention</span>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="feedback-state-action">
        {onRetry ? <RetryButton label={retryLabel} onRetry={onRetry} /> : null}
        {action}
      </div>
    </div>
  );
}
