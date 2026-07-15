import type { ReactNode } from "react";
import {
  Activity,
  BookOpenText,
  BrainCircuit,
  ChartColumnIncreasing,
  FileStack,
  Lightbulb,
  Radar,
  UsersRound,
} from "lucide-react";
import { Card } from "../components/ui/Card";
import { PageContainer } from "../components/layout/PageContainer";
import { PageHeader } from "../components/layout/PageHeader";
import { PageSection } from "../components/layout/PageSection";
import { ResponsiveGrid } from "../components/layout/ResponsiveGrid";
import type { PlaceholderIcon, PlaceholderPageContent } from "../config/placeholders";

type PlaceholderDashboardPageProps = {
  content: PlaceholderPageContent;
};

export function PlaceholderDashboardPage({
  content,
}: PlaceholderDashboardPageProps) {
  return (
    <PageContainer>
      <PageHeader description={content.description} title={content.title} />
      {content.hero ? (
        <section className="overview-hero" aria-label={content.hero.title}>
          <div className="overview-hero-copy">
            <p className="page-eyebrow">Daily intelligence snapshot</p>
            <h2>{content.hero.title}</h2>
            <div className="overview-hero-metrics">
              <p className="overview-hero-primary">{content.hero.primaryMetric}</p>
              <div className="overview-hero-secondary">
                <span>{content.hero.secondaryMetric}</span>
                <span className="overview-hero-growth">{content.hero.growthLabel}</span>
              </div>
            </div>
            <div className="overview-hero-chips">
              {content.hero.chips.map((chip) => (
                <span className="overview-hero-chip" key={chip}>
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <div className="overview-hero-visual" aria-hidden="true">
            <div className="hero-visual-panel">
              <div className="hero-bars">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="hero-orbit" />
              <div className="hero-grid">
                <span />
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        </section>
      ) : null}
      {content.sections.map((section) => (
        <PageSection
          description={section.description}
          eyebrow={section.eyebrow}
          key={section.title}
          title={section.title}
        >
          <ResponsiveGrid variant={section.gridVariant}>
            {section.cards.map((card) => (
              <Card
                description={card.detail}
                eyebrow={card.layout === "preview" ? "Preview surface" : "Reserved module"}
                icon={getPlaceholderIcon(card.icon)}
                key={`${section.title}-${card.title}`}
                tone={card.tone}
                title={card.title}
              >
                {card.layout === "preview" ? (
                  <div className="placeholder-preview" aria-hidden="true">
                    <div className="placeholder-preview-chart">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="placeholder-preview-copy">
                      <p>{card.message ?? "Interactive insights will appear here next."}</p>
                    </div>
                  </div>
                ) : (
                  <p className="placeholder-copy">
                    {card.message ?? "Live metrics will appear once backend data is connected."}
                  </p>
                )}
              </Card>
            ))}
          </ResponsiveGrid>
        </PageSection>
      ))}
    </PageContainer>
  );
}

function getPlaceholderIcon(icon: PlaceholderIcon): ReactNode {
  const iconMap: Record<PlaceholderIcon, ReactNode> = {
    activity: <Activity size={18} />,
    authors: <UsersRound size={18} />,
    categories: <FileStack size={18} />,
    papers: <BookOpenText size={18} />,
    signals: <Lightbulb size={18} />,
    spark: <BrainCircuit size={18} />,
    topics: <Radar size={18} />,
    trend: <ChartColumnIncreasing size={18} />,
  };

  return iconMap[icon];
}
