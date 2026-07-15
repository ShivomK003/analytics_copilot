import type { ReactNode } from "react";

type PageSectionProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
};

export function PageSection({
  children,
  title,
  description,
  eyebrow,
  action,
}: PageSectionProps) {
  return (
    <section className="page-section">
      {title || description || action ? (
        <div className="page-section-header">
          <div>
            {eyebrow ? <p className="page-section-eyebrow">{eyebrow}</p> : null}
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
