import { Link } from "react-router-dom";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { EmptyState } from "../components/feedback/EmptyState";
import { PageSection } from "../components/layout/PageSection";

export function NotFoundPage() {
  return (
    <PageContainer>
      <PageHeader
        description="The requested route does not match a dashboard page in this phase."
        title="Page not found"
      />
      <PageSection>
        <EmptyState
          action={
            <Link className="button button-accent" to="/overview">
              Back to overview
            </Link>
          }
          description="Try returning to the overview page to continue exploring the dashboard foundation."
          title="This page is not available in the current dashboard shell."
        />
      </PageSection>
    </PageContainer>
  );
}
