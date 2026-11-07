"use client";

import { Check, Copy, Printer } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useProject } from "@/components/ProjectContext";
import { Button, ButtonLink, cn, EmptyState, ErrorState, Evidence, Field, NumberInput, Segmented, Skeleton, Textarea } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { money, num, pct } from "@/lib/format";
import { analyze, counterLetter, guaranteeExposure, monthRent, occupancyCeiling, openingCounter, totalCost, type Asks, type Guarantee, type LeaseTerms } from "@/lib/lease";
import type { Run, SimResult } from "@/lib/types";

const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;
const sf = (x: number) => `$${Number.isInteger(x) ? x.toLocaleString("en-US") : x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Where the offer, your counter and your walk-away rent sit on one scale. The offer handle can be dragged. */
function RentScale({ offer, walk, comfort, counter, noRent, onOffer, offerLabel }: { offer: number; walk: number; comfort: number; counter: number; noRent: boolean; onOffer: (v: number) => void; offerLabel: string }) {
  const still = useReducedMotion();
  const top = Math.max(10, Math.ceil(Math.max(offer, walk, counter) * 1.3));
  const at = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  const Mark = ({ v, label, tone, row }: { v: number; label: string; tone: string; row: string }) => (
    <motion.div className="pointer-events-none absolute top-0 h-full" initial={false} animate={{ left: at(v) }} transition={still ? { duration: 0 } : SPRING}>
      <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-night" />
      <div className={cn("absolute -translate-x-1/2 whitespace-nowrap border border-night px-2 py-0.5 text-[13px] font-semibold text-night", tone, row)}>{label} {sf(v)}</div>
    </motion.div>
  );
  return (
    <div className="px-14 pb-9 pt-[4.5rem]">
      <div className="relative h-12 border border-night bg-white focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-night">
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(135deg, #0f1f3d 0 1px, transparent 1px 7px)" }} />
        {!noRent && <motion.div className="absolute inset-y-0 left-0 bg-[#dbe6f3]" initial={false} animate={{ width: at(walk) }} transition={still ? { duration: 0 } : SPRING} />}
        {!noRent && <motion.div className="absolute inset-y-0 left-0 bg-stone" initial={false} animate={{ width: at(Math.max(0, comfort)) }} transition={still ? { duration: 0 } : SPRING} />}
        {!noRent && <Mark v={walk} label="Walk away" tone="bg-stone" row="-top-16" />}
        <Mark v={counter} label="Your counter" tone="bg-you" row="-bottom-8" />
        <Mark v={offer} label={offerLabel} tone="bg-white" row="-top-8" />
        <input type="range" min={0} max={top} step={0.5} value={offer} onChange={(e) => onOffer(Number(e.target.value))} aria-label="Their offered rent per square foot per year" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
      </div>
    </div>
  );
}

/** The whole lease as a block of lots, one per month. */
function MonthLots({ t }: { t: LeaseTerms }) {
  const months = t.termYears * 12;
  const guaranteed = t.guarantee === "full" ? months : t.guarantee === "capped" ? Math.min(t.capMonths, months) : 0;
  return (
    <div>
      <div className="space-y-1">
        {Array.from({ length: t.termYears }, (_, y) => (
          <div key={y} className="grid grid-cols-[3.25rem_repeat(12,minmax(0,1fr))] items-center gap-1">
            <div className="text-[12px] text-ink-400">Year {y + 1}</div>
            {Array.from({ length: 12 }, (_, i) => {
              const m = y * 12 + i;
              const free = m < t.freeMonths;
              const at = m < guaranteed;
              return (
                <div key={i} title={`Month ${m + 1}: ${money(monthRent(t, m))}${at ? ", you personally owe this" : ""}`} style={{ transitionDelay: `${m * 9}ms` }}
                  className={cn("relative h-7 border border-night transition-colors duration-300 motion-reduce:transition-none", at ? "bg-danger" : "bg-white")}>
                  {free && <span aria-hidden className="absolute inset-x-0 bottom-0 h-2.5 bg-you" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
        <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-4 border border-night bg-danger" /> You personally owe it</li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-4 border border-night bg-white" /> The business owes it</li>
        <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-4 border border-night bg-you" /> Free base rent</li>
      </ul>
    </div>
  );
}

function TermInputs({ t, set, full }: { t: LeaseTerms; set: (p: Partial<LeaseTerms>) => void; full: boolean }) {
  const n = (k: keyof LeaseTerms, min = 0) => (v: number | null) => set({ [k]: Math.max(min, v ?? 0) } as Partial<LeaseTerms>);
  return (
    <div className="grid grid-cols-2 items-end gap-3">
      {full && <Field label="Size"><NumberInput value={t.sqft} onChange={n("sqft", 1)} suffix="sq ft" /></Field>}
      <Field label="Base rent / sq ft / yr"><NumberInput value={t.baseRent} onChange={n("baseRent")} prefix="$" /></Field>
      {full && <Field label="CAM, tax, ins. / sq ft / yr"><NumberInput value={t.nnn} onChange={n("nnn")} prefix="$" /></Field>}
      {full && <Field label="Term"><NumberInput value={t.termYears} onChange={(v) => set({ termYears: Math.min(15, Math.max(1, Math.round(v ?? 1))) })} suffix="years" /></Field>}
      {full && <Field label="Increase a year"><NumberInput value={t.increasePct} onChange={n("increasePct")} suffix="%" /></Field>}
      <Field label="Free months"><NumberInput value={t.freeMonths} onChange={(v) => set({ freeMonths: Math.max(0, Math.round(v ?? 0)) })} /></Field>
      <Field label="Build-out / sq ft"><NumberInput value={t.tiPerSqft} onChange={n("tiPerSqft")} prefix="$" /></Field>
      <div className="col-span-2">
        <Field label="Personal guarantee">
          <Segmented<Guarantee> value={t.guarantee} onChange={(g) => set({ guarantee: g })} options={[{ value: "full", label: "Whole lease" }, { value: "capped", label: "Capped" }, { value: "none", label: "None" }]} />
        </Field>
      </div>
      {t.guarantee === "capped" && <Field label="Capped at"><NumberInput value={t.capMonths} onChange={(v) => set({ capMonths: Math.max(1, Math.round(v ?? 1)) })} suffix="months" /></Field>}
    </div>
  );
}

export default function LeaseCounter() {
  const { project: p } = useProject();
  const sc = p.scenarios?.find((s) => s.is_baseline) ?? p.scenarios?.[0];
  const runId = sc?.latest_run?.id;
  const [res, setRes] = useState<SimResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const KEY = `siq-lease-${p.id}`;

  const [offer, setOffer] = useState<LeaseTerms | null>(null);
  const [counter, setCounter] = useState<LeaseTerms | null>(null);
  const [edited, setEdited] = useState(false);
  const [asks, setAsks] = useState<Asks>({ camCapPct: 5, camAudit: true, rentAtOpening: true, renewalYears: 5, guaranteeBurnOff: true });
  const [view, setView] = useState<"offer" | "counter">("offer");
  const [tenant, setTenant] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!runId) return;
    api<Run>(`/simulation-runs/${runId}/results`)
      .then((r) => {
        setRes(r.results || null);
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load your simulation"));
  }, [runId]);

  const biz = useMemo(() => {
    if (!res || !sc) return null;
    const f = res.finance;
    return { revenue: f.revenue, variableCost: f.variable_cost, otherFixed: Math.max(0, f.fixed_cost - (sc.inputs.rent || 0)), price: sc.inputs.price };
  }, [res, sc]);
  const ceiling = occupancyCeiling(p.category.label, p.archetype?.key ?? "");

  // first look: the plan's rent, shown as an estimate until the founder enters the landlord's real numbers
  useEffect(() => {
    if (!biz || !sc || offer) return;
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved?.offer && saved?.counter) {
        setOffer(saved.offer);
        setCounter(saved.counter);
        if (saved.asks) setAsks({ guaranteeBurnOff: true, ...saved.asks });
        setTenant(saved.tenant || "");
        setEdited(true);
        return;
      }
    } catch {
      /* storage blocked: start fresh */
    }
    const sqft = 2000;
    const allIn = ((sc.inputs.rent || 0) * 12) / sqft;
    const first: LeaseTerms = { sqft, baseRent: Math.round(allIn * 0.8 * 2) / 2 || 30, nnn: Math.round(allIn * 0.2 * 2) / 2 || 6, termYears: 5, increasePct: 3, freeMonths: 0, tiPerSqft: 0, guarantee: "full", capMonths: 6 };
    setOffer(first);
    setCounter(openingCounter(first, analyze(first, biz, ceiling.share).walkAwayRent));
  }, [biz, sc, offer, KEY, ceiling.share]);

  useEffect(() => {
    if (!offer || !counter || !edited) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ offer, counter, asks, tenant }));
    } catch {
      /* storage blocked: the page still works, it just forgets */
    }
  }, [offer, counter, asks, tenant, edited, KEY]);

  // no run yet, or one that is still running or failed: there is nothing to work from
  if (!sc || !runId || (loaded && !res?.finance))
    return <div className="p-6"><EmptyState title="Run your market first" body="The Lease Counter uses your costs and forecast, so it needs one simulation." action={<ButtonLink href={`/app/projects/${p.id}/live`} variant="next">Run the live market</ButtonLink>} /></div>;
  if (error) return <div className="p-6"><ErrorState message={error} /></div>;
  if (!biz || !offer || !counter) return <div className="space-y-3 p-6"><Skeleton className="h-40" /><Skeleton className="h-96" /></div>;

  const a = analyze(offer, biz, ceiling.share);
  const over = !a.noRentWorks && offer.baseRent > a.walkAwayRent;
  const asking = edited ? "They are asking" : "Example offer:";
  const named = edited ? "Their" : "The example";
  const saved = totalCost(offer) - totalCost(counter) + (counter.tiPerSqft - offer.tiPerSqft) * counter.sqft;
  const riskOffer = guaranteeExposure(offer);
  const riskCounter = guaranteeExposure(counter);
  const shown = view === "offer" ? offer : counter;
  const address = p.locations[0]?.address || p.locations[0]?.label || "the premises";
  const auto = counterLetter({ address, tenant, business: p.category.label.toLowerCase(), offer, counter, asks, fmt: (x) => sf(x) });
  const letter = note ?? auto;
  const editOffer = (patch: Partial<LeaseTerms>) => {
    const next = { ...offer, ...patch };
    setOffer(next);
    setEdited(true);
    setNote(null);
    // the counter keeps the same lease and only differs where it negotiates
    setCounter({ ...counter, sqft: next.sqft, nnn: next.nnn, termYears: next.termYears, increasePct: next.increasePct });
  };
  const editCounter = (patch: Partial<LeaseTerms>) => {
    setCounter({ ...counter, ...patch });
    setEdited(true);
    setNote(null);
  };
  const editAsks = (patch: Partial<Asks>) => {
    setAsks({ ...asks, ...patch });
    setEdited(true);
    setNote(null);
  };
  const copy = async () => {
    await navigator.clipboard.writeText(letter).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const barTop = Math.max(a.salesNeeded, biz.revenue, 1);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-8">
      <section className={cn("wipe no-print border border-night p-6 md:p-8", a.noRentWorks || over ? "bg-danger text-white" : a.occupancyShare != null && a.occupancyShare > ceiling.share ? "bg-night text-white" : "bg-ok text-white")}>
        {a.noRentWorks ? (
          <h1 className="font-display max-w-[24ch] text-[44px] leading-[1.02]">No rent works at this forecast.</h1>
        ) : (
          <h1 className="font-display max-w-[24ch] text-[44px] leading-[1.02]"><span className="num">Walk away above {sf(Math.floor(a.walkAwayRent))}</span> a square foot.</h1>
        )}
        <p className="mt-3 max-w-[64ch] text-[17px] leading-snug">
          {a.noRentWorks
            ? `Your other costs already take more than forecast sales can cover. To take this space at ${sf(offer.baseRent)}, sales must reach ${money(a.salesNeeded)} a month. Change the plan first, or walk.`
            : over
              ? `${asking} ${sf(offer.baseRent)}. Above ${sf(a.walkAwayRent)}, forecast sales no longer cover your costs. At their rent you need ${money(a.salesNeeded)} a month, about ${num(a.unitsNeeded)} ${res!.unit_label}. Push back, or look at another space.`
              : a.occupancyShare != null && a.occupancyShare > ceiling.share
                ? `${named} ${sf(offer.baseRent)} still breaks even at the forecast, but rent and CAM would take ${pct(a.occupancyShare)} of sales, against a rule of thumb of ${pct(ceiling.share)}. You have little room for error, so ask for free months and a smaller guarantee.`
                : `${named} ${sf(offer.baseRent)} is inside your limit. You still have room to ask for free months and a smaller personal guarantee.`}
        </p>
      </section>

      <div className="no-print grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="border border-night bg-white p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-[22px]">Their offer</h2>
              <Evidence kind={edited ? "user" : "assumption"} label={edited ? "Yours" : "Estimated"} />
            </div>
            {!edited && <p className="mb-3 mt-1 text-[13px] text-ink-300">These are examples from your plan, on an assumed 2,000 sq ft. Enter the landlord&apos;s real numbers.</p>}
            <div className="mt-3"><TermInputs t={offer} set={editOffer} full /></div>
          </section>
          <section className="border border-night bg-white">
            <h2 className="font-display border-b border-night bg-you px-5 py-3 text-[22px]">Your counter</h2>
            <div className="p-5">
            <div className="mt-3"><TermInputs t={counter} set={editCounter} full={false} /></div>
            <div className="mt-4 space-y-2 border-t border-night pt-3 text-[14px]">
              <label className="flex items-center gap-2"><input type="checkbox" checked={asks.rentAtOpening} onChange={(e) => editAsks({ rentAtOpening: e.target.checked })} /> Rent starts when you can open</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={asks.camCapPct != null} onChange={(e) => editAsks({ camCapPct: e.target.checked ? 5 : null })} /> Cap CAM increases at 5% a year</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={asks.camAudit} onChange={(e) => editAsks({ camAudit: e.target.checked })} /> Right to audit CAM yearly</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={asks.renewalYears != null} onChange={(e) => editAsks({ renewalYears: e.target.checked ? 5 : null })} /> Option to renew for 5 years</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={asks.guaranteeBurnOff} onChange={(e) => editAsks({ guaranteeBurnOff: e.target.checked })} /> End the guarantee after 24 on-time months</label>
            </div>
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="border border-night bg-white p-5">
            <h2 className="font-display text-[22px]">Rent per square foot, per year</h2>
            <RentScale offer={offer.baseRent} walk={Math.max(0, a.walkAwayRent)} comfort={a.comfortRent} counter={counter.baseRent} noRent={a.noRentWorks} onOffer={(v) => editOffer({ baseRent: v })} offerLabel={edited ? "Their offer" : "Example"} />
            <p className="text-[13px] text-ink-300">Drag the bar to test a different offer. The solid part keeps rent and CAM at or under {pct(ceiling.share)} of forecast sales, a common rule of thumb for {ceiling.group}. The pale part still breaks even at the forecast. The hatched part does not.</p>

            <div className="mt-5 grid gap-4 border-t border-ink-600 pt-4 md:grid-cols-[1fr_1fr]">
              <div className="space-y-2.5">
                <h3 className="text-[14px] font-semibold">What this rent demands from sales</h3>
                {[["Sales you need a month", Math.round(a.salesNeeded), "bg-you"], ["Forecast sales a month", biz.revenue, "bg-stone"]].map(([l, v, c]) => (
                  <div key={l as string}>
                    <div className="flex justify-between text-[13px]"><span>{l}</span><span className="num font-semibold">{money(v as number)}</span></div>
                    <div className="mt-1 h-4 border border-night bg-white"><motion.div className={cn("h-full", c as string)} initial={false} animate={{ width: `${((v as number) / barTop) * 100}%` }} transition={SPRING} /></div>
                  </div>
                ))}
                <p className="text-[12px] text-ink-400">The forecast is a planning estimate. The sales you need comes from your own costs, so it moves only when they do.</p>
              </div>
              <div className="grid grid-cols-2 gap-px bg-night p-px">
                {[
                  ["Rent and CAM a month", money(a.occupancy)],
                  ["Share of forecast sales", a.occupancyShare == null ? "—" : pct(a.occupancyShare)],
                  ["Whole lease costs", money(totalCost(offer), { compact: true })],
                  ["Your counter saves", saved > 0 ? money(saved, { compact: true }) : "—"],
                ].map(([l, v]) => (
                  <div key={l} className="bg-white p-3"><div className="text-[12px] text-ink-300">{l}</div><div className="num font-display mt-1 text-[26px] leading-none">{v}</div></div>
                ))}
              </div>
            </div>
          </section>

          <section className="border border-night bg-white p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[22px]">If the business closes, you still owe</h2>
                <p className="num font-display mt-1 text-[56px] leading-none text-danger">{money(view === "offer" ? riskOffer : riskCounter)}</p>
              </div>
              <Segmented<"offer" | "counter"> value={view} onChange={setView} options={[{ value: "offer", label: "Their offer" }, { value: "counter", label: "Your counter" }]} />
            </div>
            <p className="mb-4 mt-2 max-w-[62ch] text-[14px] text-ink-300">
              {riskOffer > riskCounter ? `Your counter cuts what you personally risk by ${money(riskOffer - riskCounter)}.` : "A personal guarantee reaches your own savings. Ask to cap it, or to end it after on-time payments."}
            </p>
            <MonthLots t={shown} />
          </section>

          <section className="border border-night bg-paper p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[22px]">Your counteroffer, ready to send</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={copy} disabled={!edited} title={edited ? undefined : "Enter the landlord's real offer first"}>{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy letter"}</Button>
                <Button size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /> Print</Button>
              </div>
            </div>
            {!edited && <p className="mt-2 border border-dashed border-night bg-white px-3 py-2 text-[14px]">This draft uses example numbers. Enter the landlord&apos;s offer above before you send anything.</p>}
            <div className="mt-3 max-w-xs"><Field label="Sign as" htmlFor="tenant"><input id="tenant" value={tenant} onChange={(e) => { setTenant(e.target.value); setEdited(true); setNote(null); }} placeholder="Your name or company" className="h-10 w-full border border-ink-500 bg-white px-3 text-sm" /></Field></div>
            <Textarea value={letter} onChange={(e) => setNote(e.target.value)} aria-label="Counteroffer letter" rows={15} className="mt-3 font-[inherit] leading-relaxed" />
            <p className="mt-2 text-[13px] text-ink-300">This is a starting draft, not legal advice. Have a commercial real estate attorney read the lease before you sign.</p>
          </section>
        </div>
      </div>

      <pre className="print-only whitespace-pre-wrap font-sans text-[15px] leading-relaxed">{letter}</pre>
    </main>
  );
}
