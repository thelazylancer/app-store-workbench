/** Compact label: one decimal below 100, whole numbers above. */
export function formatMetric(value: number): string {
  return Math.abs(value) >= 100 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

/** Rounds the domain to 1/2/5 x 10^n so ticks land on readable values. */
export function metricTicks(values: number[]): { min: number; max: number; ticks: number[] } {
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const rawStep = (high - low || 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const norm = rawStep / magnitude;
  const step = (norm <= 1.2 ? 1 : norm <= 2.5 ? 2 : norm <= 6 ? 5 : 10) * magnitude;
  const min = Math.floor(low / step) * step;
  const max = Math.max(step, Math.ceil(high / step) * step);
  const ticks: number[] = [];
  for (let tick = min; tick <= max + step / 1000; tick += step) ticks.push(Number(tick.toFixed(6)));
  return { min, max, ticks };
}
