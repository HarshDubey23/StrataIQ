// Run: node --experimental-strip-types lib/lease.check.ts
import assert from "node:assert/strict";
import { analyze, counterLetter, guaranteeExposure, monthRent, occupancyCeiling, openingCounter, totalCost, type LeaseTerms } from "./lease.ts";

const t: LeaseTerms = { sqft: 2000, baseRent: 30, nnn: 6, termYears: 2, increasePct: 0, freeMonths: 0, tiPerSqft: 0, guarantee: "full", capMonths: 6 };

// 2,000 sq ft at $36 all-in is $6,000 a month, $144,000 over two years
assert.equal(totalCost(t), 144000);
assert.equal(guaranteeExposure(t), 144000);
assert.equal(guaranteeExposure({ ...t, guarantee: "capped" }), 36000);
assert.equal(guaranteeExposure({ ...t, guarantee: "none" }), 0);
// a cap can never exceed what the whole lease costs
assert.equal(guaranteeExposure({ ...t, guarantee: "capped", capMonths: 99 }), 144000);

// free months waive base rent, but CAM is still owed
assert.equal(monthRent({ ...t, freeMonths: 2 }, 0), 1000);
assert.equal(monthRent({ ...t, freeMonths: 2 }, 2), 6000);
assert.equal(totalCost({ ...t, freeMonths: 2 }), 134000);
// increases start in year two, on base rent only
assert.equal(monthRent({ ...t, increasePct: 10 }, 12), 6500);

const biz = { revenue: 60000, variableCost: 24000, otherFixed: 20000, price: 20 };
const a = analyze(t, biz, 0.1);
// margin 60%, so sales needed = (20,000 + 6,000) / 0.6
assert.equal(a.salesNeeded, 43333.33);
// break-even allows $16,000 of occupancy, so that is the hard limit: $96 all-in less $6 CAM
assert.equal(a.walkAwayRent, 90);
// the 10% rule of thumb ($6,000 of occupancy) only marks the comfortable part
assert.equal(a.comfortRent, 30);
assert.equal(a.noRentWorks, false);
assert.equal(a.occupancyShare, 0.1);

// when other costs already swallow the margin, no rent works
const none = analyze(t, { ...biz, otherFixed: 50000 }, 0.1);
assert.equal(none.noRentWorks, true);
assert.ok(none.salesNeeded > biz.revenue);

// zero revenue must not divide by zero
assert.equal(analyze(t, { ...biz, revenue: 0, variableCost: 0 }, 0.1).salesGap, null);

// the opening counter sits under the offer, and never more than 15% under it
const c = openingCounter({ ...t, baseRent: 40 }, 37);
assert.ok(c.baseRent < 37 && c.baseRent >= 34);
assert.ok(openingCounter({ ...t, baseRent: 100 }, 20).baseRent >= 85);
assert.equal(c.guarantee, "capped");
// with no workable rent it still asks for less than the offer
assert.ok(openingCounter({ ...t, baseRent: 40 }, -5).baseRent < 40);

assert.equal(occupancyCeiling("Coffee shop", "takeaway").share, 0.1);
assert.equal(occupancyCeiling("Gym", "membership").share, 0.15);
assert.equal(occupancyCeiling("Grocery store", "retail").share, 0.03);

const letter = counterLetter({ address: "1 Main St", tenant: "", business: "a gym", offer: { ...t, baseRent: 40 }, counter: c, asks: { camCapPct: 5, camAudit: true, rentAtOpening: true, renewalYears: 5 }, fmt: (x) => `$${x}` });
assert.ok(letter.includes("in place of the $40 proposed"));
assert.ok(letter.includes("non-binding"));
assert.ok(letter.includes("limited to 6 months"));
assert.ok(letter.includes("[Your name]"));
console.log("lease math ok");
