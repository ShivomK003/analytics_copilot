import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="feedback-state" role="status">
      <span className="feedback-state-eyebrow">No data yet</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="feedback-state-action">{action}</div> : null}
    </div>
  );
}
