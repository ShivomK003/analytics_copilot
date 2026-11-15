import type { LucideIcon } from "lucide-react";
import { BookOpenText, Home, Radar } from "lucide-react";

export type NavigationItem = {
  label: string;
  path: string;
  description: string;
  icon: LucideIcon;
};

// Legacy analytical routes remain registered; this list defines only primary navigation.
export const navigationItems: NavigationItem[] = [
  {
    label: "Overview",
    path: "/overview",
    description: "Whole-corpus executive snapshot",
    icon: Home,
  },
  {
    label: "Research Intelligence",
    path: "/intelligence",
    description: "Discover where AI research is heading",
    icon: Radar,
  },
  {
    label: "Paper Explorer",
    path: "/papers",
    description: "Search and explore indexed publications",
    icon: BookOpenText,
  },
];
