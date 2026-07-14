import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
};

export function Card({ title, description, action, children }: CardProps) {
  return (
    <article className="card">
      {title || description || action ? (
        <div className="card-header">
          <div>
            {title ? <h3>{title}</h3> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </article>
  );
}
