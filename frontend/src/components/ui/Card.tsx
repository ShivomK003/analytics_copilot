import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  tone?: "accent" | "info" | "success" | "warning";
  action?: ReactNode;
  children: ReactNode;
};

export function Card({
  title,
  description,
  eyebrow,
  icon,
  tone = "accent",
  action,
  children,
}: CardProps) {
  return (
    <article className={`card card-tone-${tone}`}>
      {title || description || action ? (
        <div className="card-header">
          <div className="card-header-main">
            {icon ? (
              <div className={`card-icon card-icon-${tone}`} aria-hidden="true">
                {icon}
              </div>
            ) : null}
            <div>
              {eyebrow ? <p className="card-eyebrow">{eyebrow}</p> : null}
              {title ? <h3>{title}</h3> : null}
              {description ? <p>{description}</p> : null}
            </div>
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      <div className="card-body">{children}</div>
    </article>
  );
}
