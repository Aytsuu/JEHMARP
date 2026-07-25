export type MetricTrendDirection = "up" | "down" | "flat";

export function getMetricTrendDirection(diff: number): MetricTrendDirection {
  if (diff > 0) {
    return "up";
  }

  if (diff < 0) {
    return "down";
  }

  return "flat";
}

export function formatSignedMetricTrendDiff(
  diff: number,
  formatValue: (value: number) => string,
) {
  if (diff > 0) {
    return `+${formatValue(diff)}`;
  }

  if (diff < 0) {
    return `-${formatValue(Math.abs(diff))}`;
  }

  return formatValue(0);
}
