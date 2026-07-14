import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  ChartColumnIncreasing,
  FolderKanban,
  Home,
  Shapes,
  UsersRound,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  path: string;
  description: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  {
    label: "Overview",
    path: "/overview",
    description: "Research activity summary",
    icon: Home,
  },
  {
    label: "Trends",
    path: "/trends",
    description: "Publication volume and growth",
    icon: ChartColumnIncreasing,
  },
  {
    label: "Topics",
    path: "/topics",
    description: "Semantic topic intelligence",
    icon: Shapes,
  },
  {
    label: "Categories",
    path: "/categories",
    description: "arXiv category analysis",
    icon: FolderKanban,
  },
  {
    label: "Authors",
    path: "/authors",
    description: "Collaboration and activity",
    icon: UsersRound,
  },
  {
    label: "Papers",
    path: "/papers",
    description: "Latest paper discovery",
    icon: BookOpenText,
  },
];
