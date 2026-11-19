export const USAGE_THRESHOLDS = {
  medium: 50,
  high: 80
};

export const getUsageLevel = (percent) => {
  if (percent === null || percent === undefined) return 'unknown';
  if (percent >= USAGE_THRESHOLDS.high) return 'high';
  if (percent >= USAGE_THRESHOLDS.medium) return 'medium';
  return 'low';
};
