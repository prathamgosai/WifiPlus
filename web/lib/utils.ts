/** Tiny helpers shared across the app. No dependencies on purpose. */

/** Merge class names, dropping falsy entries. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/** Sorted, de-duplicated list — used to build every location dropdown. */
export function unique(items: string[]): string[] {
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
}

/** 1234 → "1.2K", 1_200_000 → "1.2M". Keeps stat tiles narrow. */
export function compact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** Mbps readings jump between 3 and 4 digits; keep the column width stable. */
export function formatSpeed(value: number | null, digits = 1): string {
  return value === null ? "—" : value.toFixed(digits);
}

/** Percentage a range input sits at, for the gradient track fill. */
export function rangeProgress(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}
