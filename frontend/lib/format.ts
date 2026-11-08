export const US_MARKET = (process.env.NEXT_PUBLIC_MARKET ?? "US") === "US";
export const CUR = US_MARKET ? "$" : "₹";
export const LOCALE = US_MARKET ? "en-US" : "en-IN";
/** One full report for one location, priced per market by the deployment (NEXT_PUBLIC_REPORT_PRICE). */
export const REPORT_PRICE = process.env.NEXT_PUBLIC_REPORT_PRICE || (US_MARKET ? "$29" : "₹999");

export function money(x: number | null | undefined, opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  const neg = x < 0;
  const a = Math.abs(x);
  let s: string;
  if (opts.compact && US_MARKET && a >= 1e6) s = `${(a / 1e6).toFixed(2)}M`;
  else if (opts.compact && US_MARKET && a >= 1e4) s = `${(a / 1e3).toFixed(1)}k`;
  else if (opts.compact && a >= 1e7) s = `${(a / 1e7).toFixed(2)} Cr`;
  else if (opts.compact && !US_MARKET && a >= 1e5) s = `${(a / 1e5).toFixed(2)} L`;
  else s = a.toLocaleString(LOCALE, { maximumFractionDigits: a < 100 ? 2 : 0 });
  const prefix = neg ? "−" : opts.sign ? "+" : "";
  return `${prefix}${CUR}${s}`;
}

/** A distance held in km, shown in the local unit. */
export function distance(km: number | null | undefined, digits = 1): string {
  if (km === null || km === undefined || Number.isNaN(km)) return "—";
  return US_MARKET ? `${(km * 0.621371).toFixed(digits)} mi` : `${km.toFixed(digits)} km`;
}

export function num(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return x.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function signed(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString(LOCALE, { maximumFractionDigits: digits })}`;
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(LOCALE, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const s = Math.round((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

export const OBJECTIVES: Record<string, string> = {
  start_new: "Start a new business",
  improve_existing: "Improve an existing business",
  compare_locations: "Compare potential locations",
  test_strategy: "Test pricing or marketing",
  diagnose: "Investigate poor performance",
};

export const GOALS: Record<string, string> = {
  profit: "Highest expected profit",
  low_risk: "Lowest risk of loss",
  break_even: "Fastest payback",
  growth: "Most customers",
};
