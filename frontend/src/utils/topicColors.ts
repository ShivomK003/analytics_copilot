// Fixed contrast palette; IDs beyond its length repeat predictably, independent of order.
export const TOPIC_COLORS = [
  "#3057c8",
  "#087f73",
  "#a54800",
  "#823bb4",
  "#b33053",
  "#176e9e",
  "#626b16",
  "#7d4d35",
] as const;
export function topicColor(topicId: number): string {
  return TOPIC_COLORS[
    (((topicId - 1) % TOPIC_COLORS.length) + TOPIC_COLORS.length) % TOPIC_COLORS.length
  ];
}
