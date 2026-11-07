/**
 * Lease Counter math. Founder's numbers go in; what the lease costs, what it demands in sales and what the founder
 * personally risks come out. Nothing here depends on the single-store forecast except the walk-away rent, which says so.
 */
export type Guarantee = "full" | "capped" | "none";

export interface LeaseTerms {
  sqft: number;
  baseRent: number; // per sq ft per year
  nnn: number; // CAM, taxes and insurance, per sq ft per year
  termYears: number;
  increasePct: number; // base rent increase per year
  freeMonths: number;
  tiPerSqft: number; // landlord's build-out allowance
  guarantee: Guarantee;
  capMonths: number;
}

export interface Business {
  revenue: number; // forecast sales a month (planning estimate)
  variableCost: number; // a month, at that revenue
  otherFixed: number; // fixed costs a month, without rent
  price: number;
}

const round = (x: number) => Math.round(x * 100) / 100;

export const monthlyOccupancy = (t: LeaseTerms) => (t.sqft * (t.baseRent + t.nnn)) / 12;

/** Base rent for one month of the term (0-based), after yearly increases and free months. */
export function monthRent(t: LeaseTerms, m: number): number {
  const base = (t.sqft * t.baseRent * Math.pow(1 + t.increasePct / 100, Math.floor(m / 12))) / 12;
  const nnn = (t.sqft * t.nnn) / 12;
  return (m < t.freeMonths ? 0 : base) + nnn;
}

/** Everything owed across the term, with a flat CAM. */
export function totalCost(t: LeaseTerms): number {
  let sum = 0;
  for (let m = 0; m < t.termYears * 12; m++) sum += monthRent(t, m);
  return round(sum);
}

/** The most the founder can personally owe if the business closes. */
export function guaranteeExposure(t: LeaseTerms): number {
  if (t.guarantee === "none") return 0;
  const total = totalCost(t);
  if (t.guarantee === "full") return total;
  return round(Math.min(total, t.capMonths * monthlyOccupancy(t)));
}

/** Rule-of-thumb ceiling for occupancy as a share of sales. Trade guidance, not a law. */
export function occupancyCeiling(categoryLabel: string, archetype: string): { share: number; group: string } {
  const c = categoryLabel.toLowerCase();
  if (/grocer|supermarket/.test(c)) return { share: 0.03, group: "groceries" };
  if (/cloth|apparel|fashion|boutique/.test(c)) return { share: 0.15, group: "apparel" };
  if (archetype === "dine_in" || archetype === "takeaway" || /restaurant|cafe|café|coffee|pizza|bar\b/.test(c)) return { share: 0.1, group: "restaurants" };
  return { share: 0.15, group: "retail tenants" };
}

export function analyze(t: LeaseTerms, b: Business, ceiling: number) {
  const margin = b.revenue > 0 ? Math.max(0.01, 1 - b.variableCost / b.revenue) : 0.7;
  const occupancy = monthlyOccupancy(t);
  const salesNeeded = (b.otherFixed + occupancy) / margin;
  const breakEvenOccupancy = margin * b.revenue - b.otherFixed;
  const toRent = (occ: number) => (t.sqft > 0 ? (occ * 12) / t.sqft - t.nnn : 0);
  // The hard limit is break-even at forecast sales. The trade rule of thumb only marks the comfortable part.
  const walkAwayRent = toRent(breakEvenOccupancy);
  const comfortRent = Math.min(walkAwayRent, toRent(b.revenue * ceiling));
  return {
    margin,
    occupancy: round(occupancy),
    salesNeeded: round(salesNeeded),
    unitsNeeded: b.price > 0 ? salesNeeded / b.price : 0,
    salesGap: b.revenue > 0 ? salesNeeded / b.revenue - 1 : null,
    occupancyShare: b.revenue > 0 ? occupancy / b.revenue : null,
    walkAwayRent: round(walkAwayRent),
    comfortRent: round(comfortRent),
    noRentWorks: walkAwayRent <= 0,
  };
}

/** First counter: under the walk-away rent where that is a believable ask, and never so far below the offer that it ends the talk. */
export function openingCounter(offer: LeaseTerms, walkAwayRent: number): LeaseTerms {
  const believable = offer.baseRent * 0.85;
  const rent = walkAwayRent > 0 && offer.baseRent > walkAwayRent ? Math.max(walkAwayRent * 0.92, believable) : offer.baseRent * 0.92;
  return {
    ...offer,
    baseRent: Math.round(rent * 2) / 2,
    freeMonths: Math.max(offer.freeMonths, 3),
    tiPerSqft: offer.tiPerSqft,
    guarantee: offer.guarantee === "none" ? "none" : "capped",
    capMonths: 6,
  };
}

export interface Asks {
  camCapPct: number | null;
  camAudit: boolean;
  rentAtOpening: boolean;
  renewalYears: number | null;
}

/** A plain, non-binding counterproposal the founder can edit and send. */
export function counterLetter(p: { address: string; tenant: string; business: string; offer: LeaseTerms; counter: LeaseTerms; asks: Asks; fmt: (x: number) => string }): string {
  const { counter: c, offer: o, asks: a, fmt } = p;
  const items = [
    `Premises: about ${c.sqft.toLocaleString("en-US")} square feet at ${p.address}.`,
    `Term: ${c.termYears} years.`,
    `Base rent: ${fmt(c.baseRent)} per square foot per year${c.baseRent !== o.baseRent ? `, in place of the ${fmt(o.baseRent)} proposed` : ""}, with increases of ${c.increasePct}% a year.`,
    c.freeMonths > 0 ? `Free base rent: the first ${c.freeMonths} months of the term.` : null,
    c.tiPerSqft > 0 ? `Tenant improvement allowance: ${fmt(c.tiPerSqft)} per square foot.` : null,
    a.rentAtOpening ? "Rent start: rent begins on the earlier of the day we open for business or the date we receive our certificate of occupancy." : null,
    a.camCapPct != null ? `Operating expenses: controllable CAM increases capped at ${a.camCapPct}% a year.` : null,
    a.camAudit ? "Audit: tenant may review the landlord's CAM records once a year." : null,
    c.guarantee === "capped" ? `Personal guarantee: limited to ${c.capMonths} months of rent, and ending once the tenant has paid on time for 24 months.` : c.guarantee === "none" ? "Personal guarantee: none." : null,
    a.renewalYears ? `Renewal: one option to renew for ${a.renewalYears} years, exercisable by the tenant.` : null,
  ].filter(Boolean) as string[];
  return [
    `Re: Counterproposal for ${p.address}`,
    "",
    `Thank you for your proposal. We would like to lease this space for our ${p.business} and propose these terms:`,
    "",
    ...items.map((x, i) => `${i + 1}. ${x}`),
    "",
    "This letter is a non-binding proposal for discussion. Neither party is bound until a lease is signed by both.",
    "",
    "Sincerely,",
    p.tenant || "[Your name]",
  ].join("\n");
}
