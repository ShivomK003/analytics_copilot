import { Card } from "../components/ui/Card";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { ResponsiveGrid } from "../components/layout/ResponsiveGrid";
import type { PlaceholderPageContent } from "../config/placeholders";

type PlaceholderDashboardPageProps = {
  content: PlaceholderPageContent;
};

export function PlaceholderDashboardPage({
  content,
}: PlaceholderDashboardPageProps) {
  return (
    <PageContainer>
      <PageHeader description={content.description} title={content.title} />
      {content.sections.map((section) => (
        <PageSection
          description={section.description}
          key={section.title}
          title={section.title}
        >
          <ResponsiveGrid variant={section.gridVariant}>
            {section.cards.map((card) => (
              <Card
                description={card.detail}
                key={`${section.title}-${card.title}`}
                title={card.title}
              >
                <p className="placeholder-copy">
                  This area is intentionally structural-only for Dashboard Phase B.
                </p>
              </Card>
            ))}
          </ResponsiveGrid>
        </PageSection>
      ))}
    </PageContainer>
  );
}
