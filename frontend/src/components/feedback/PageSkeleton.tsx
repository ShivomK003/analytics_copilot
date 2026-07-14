type PageSkeletonProps = {
  title?: string;
};

export function PageSkeleton({
  title = "Loading dashboard section",
}: PageSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label={title}
      className="page-skeleton"
      role="status"
    >
      <div className="page-skeleton-header">
        <span className="skeleton-line skeleton-line-title" />
        <span className="skeleton-line skeleton-line-copy" />
      </div>
      <div className="page-skeleton-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="skeleton-card" key={index}>
            <span className="skeleton-line skeleton-line-kicker" />
            <span className="skeleton-line skeleton-line-copy" />
            <span className="skeleton-line skeleton-line-copy short" />
          </div>
        ))}
      </div>
    </div>
  );
}
