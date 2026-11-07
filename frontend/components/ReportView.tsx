/* eslint-disable @typescript-eslint/no-explicit-any */
import { MarketingCurve, PriceCurve, ProfitHistogram, RampChart, Tornado } from "@/components/charts";
import { IncomeMix } from "@/components/RealData";
import { money, num, pct, when, distance } from "@/lib/format";
import type { CompetitorRec, Decision, Scenario, SimResult, Snapshot, Location, Archetype, Category } from "@/lib/types";

export interface ReportContent {
  generated_at: string;
  project: { name: string; objective: string; decision_goal: string; category: Category; profile: Record<string, unknown>; is_demo: boolean };
  archetype: Archetype;
  locations: { location: Location; snapshot: (Pick<Snapshot, "retrieved_at" | "status" | "catchment_method" | "population" | "coverage" | "sources" | "errors" | "catchment_geojson">) | null }[];
  competitors: CompetitorRec[];
  scenarios: { scenario: Scenario; result: Partial<SimResult> | null }[];
  decision: Decision;
  disclaimer: string;
}

function H({ children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-10 break-after-avoid font-display text-[28px] text-ink-100">
      {children}
    </h2>
  );
}

const VERDICT: Record<string, { label: string; tone: string }> = {
  potentially_viable: { label: "Can work under these inputs", tone: "bg-moss" },
  financially_challenging: { label: "Loses money as planned", tone: "bg-brick" },
  high_uncertainty: { label: "Too uncertain to call yet", tone: "bg-you" },
};

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-b border-r border-night bg-white p-4">
      <div className="text-[13px] text-ink-300">{label}</div>
      <div className="num mt-1 font-display text-[30px] leading-none text-ink-100">{value}</div>
      {note && <div className="mt-1.5 text-[12px] text-ink-400">{note}</div>}
    </div>
  );
}

function ChartCard({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid border border-ink-600 bg-white p-4">
      <h3 className="font-display text-[19px] text-ink-100">{title}</h3>
      <p className="mb-3 mt-0.5 text-xs text-ink-400">{note}</p>
      {children}
    </section>
  );
}

function ShareBars({ data }: { data: Record<string, number | null | undefined> }) {
  const rows = Object.entries(data).filter(([, v]) => typeof v === "number" && v > 0).sort((a, b) => Number(b[1]) - Number(a[1]));
  return (
    <ul className="space-y-2 text-xs">
      {rows.map(([k, v]) => (
        <li key={k}>
          <div className="flex justify-between"><span className="capitalize">{({ two_wheeler: "motorcycle", auto: "taxi" } as Record<string, string>)[k] ?? k.replaceAll("_", " ")}</span><span className="num font-medium">{pct(Number(v))}</span></div>
          <div className="mt-0.5 h-2 border border-night bg-white"><div className="h-full bg-stone" style={{ width: `${Number(v) * 100}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

/** The closing page: what the numbers mean and what to do next, in plain sentences built only from this report's figures. */
function BottomLine({ c }: { c: ReportContent }) {
  const d = c.decision;
  const best = c.scenarios.find((s) => s.scenario.id === d.best_scenario_id && s.result?.finance) || c.scenarios.find((s) => s.result?.finance);
  const r = best?.result as any;
  if (!r) return null;
  const mc = r.monte_carlo;
  const risk = d.risks.find((x) => x.factor !== "Data gap");
  const steps = d.next_actions.slice(0, 3);
  return (
    <section className="mt-10 break-inside-avoid bg-atlas p-6 text-white">
      <h2 className="font-display text-[32px] leading-tight">Bottom line and what to do</h2>
      <p className="mt-3 text-[15px] leading-relaxed">
        {d.headline} Under the best plan tested, &ldquo;{best!.scenario.name}&rdquo;, the model puts a typical month at {money(mc?.profit?.p50 ?? r.finance.operating_profit)}{mc ? `, within a range of ${money(mc.profit.p10)} to ${money(mc.profit.p90)}, with a ${pct(mc.prob_loss)} chance of a monthly loss` : ""}.
        {r.finance.payback_months ? ` Startup costs would pay back in about ${num(r.finance.payback_months, 1)} months.` : " Startup costs do not pay back on these inputs."}
        {risk ? ` The main risk: ${risk.text}` : ""}
      </p>
      {steps.length > 0 && (
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-snug">
          {steps.map((a, i) => <li key={i}><b>{a.action}</b> {a.why}</li>)}
        </ol>
      )}
      <p className="mt-4 text-[13px] text-white">Before you sign, replace the example costs with real quotes and check the street in person.</p>
    </section>
  );
}

/** The first pages: the answer, the numbers and the charts behind them. */
function Executive({ c }: { c: ReportContent }) {
  const d = c.decision;
  const best = c.scenarios.find((s) => s.scenario.id === d.best_scenario_id && s.result?.finance) || c.scenarios.find((s) => s.scenario.is_baseline && s.result?.finance) || c.scenarios.find((s) => s.result?.finance);
  const r = best?.result as any;
  if (!r) return null;
  const f = r.finance;
  const mc = r.monte_carlo;
  const abm = r.abm;
  const unit = r.unit_label ?? c.archetype.unit_label;
  const membership = c.archetype.key === "membership";
  const verdict = VERDICT[d.verdict];
  // The chart shows the pace of growth from the simulated customers, on the same scale as the forecast above.
  const last = abm?.weekly?.[abm.weekly.length - 1]?.units || 1;
  const ramp = (abm?.weekly || []).map((w: any) => ({ ...w, units: (w.units / last) * (r.summary.modeled_demand_units / (membership ? 1 : 30 / 7)) }));
  return (
    <>
      <div className={`mt-6 border border-night p-5 text-night ${verdict?.tone ?? "bg-ink-800"}`}>
        <div className="font-display text-[32px] leading-tight">{verdict?.label ?? "Result"}</div>
        <p className="mt-1 text-[15px] leading-snug">{d.headline}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 border-l border-t border-night md:grid-cols-3">
        <Kpi label="Profit in a typical month" value={money(mc?.profit?.p50 ?? f.operating_profit)} note={mc ? `Range ${money(mc.profit.p10, { compact: true })} to ${money(mc.profit.p90, { compact: true })}` : undefined} />
        <Kpi label={membership ? "Members to break even" : "Sales a day to break even"} value={f.break_even_units == null ? "Not reached" : num(membership ? f.break_even_units : f.break_even_units / 30)} note={`At ${money(r.summary.price)} and your costs`} />
        <Kpi label={membership ? "Members forecast" : "Sales a day forecast"} value={num(membership ? r.summary.modeled_demand_units : r.summary.modeled_demand_units / 30)} note="Planning estimate" />
        <Kpi label="Chance of a monthly loss" value={mc ? pct(mc.prob_loss) : "Not run"} note={mc ? `From ${num(mc.draws)} market scenarios` : undefined} />
        <Kpi label="Payback on startup cost" value={f.payback_months ? `${num(f.payback_months, 1)} months` : "Not reached"} note={`${money(r.finance?.startup_cost ?? (best?.scenario as any)?.inputs?.startup_cost ?? 0, { compact: true })} to open`} />
        <Kpi label="Monthly revenue" value={money(f.revenue, { compact: true })} note="Planning estimate" />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {mc?.histogram && <ChartCard title="Range of monthly profit" note="Each bar is how often a profit level came up across market scenarios."><ProfitHistogram mc={mc} /></ChartCard>}
        {r.sensitivity?.price_curve?.length > 0 && <ChartCard title="Price test" note="Profit and sales at each price, using this neighborhood's customers."><PriceCurve data={r.sensitivity.price_curve} current={r.summary.price} unit={unit} /></ChartCard>}
        {abm?.weekly?.length > 0 && <ChartCard title="First months after opening" note="How quickly sales and awareness build toward the forecast."><RampChart data={ramp} unit={unit} /></ChartCard>}
        {r.sensitivity?.tornado?.length > 0 && <ChartCard title="What moves your profit most" note="Check the longest bars first. These assumptions matter most."><Tornado data={r.sensitivity.tornado} base={f.operating_profit} /></ChartCard>}
        {r.sensitivity?.marketing_curve?.length > 0 && <ChartCard title="Marketing test" note="Profit at each monthly marketing budget."><MarketingCurve data={r.sensitivity.marketing_curve} current={Number((best?.scenario as any)?.inputs?.marketing_spend ?? 0)} /></ChartCard>}
        {abm?.metrics?.customer_modes && <ChartCard title="How customers reach you" note="From commute data for these neighborhoods."><ShareBars data={abm.metrics.customer_modes} /></ChartCard>}
        {abm?.life?.occupation_shares && <ChartCard title="Who lives in your catchment" note="Job and student status of simulated residents, drawn from Census figures."><ShareBars data={abm.life.occupation_shares} /></ChartCard>}
      </div>
      {r.income && <div className="mt-3 break-inside-avoid"><IncomeMix income={r.income} price={r.summary.price} /></div>}
      {r.sensitivity?.stress_tests?.length > 0 && (
        <section className="mt-3 break-inside-avoid border border-ink-600 bg-white p-4">
          <h3 className="font-display text-[19px] text-ink-100">Stress tests</h3>
          <table className="mt-2 w-full text-xs">
            <thead><tr className="text-left text-ink-400"><th className="py-1 font-normal">If this happens</th><th className="text-right font-normal">Sales</th><th className="text-right font-normal">Profit / month</th><th className="text-right font-normal">Change</th></tr></thead>
            <tbody>{r.sensitivity.stress_tests.map((t: any) => <tr key={t.label} className="border-t border-black/[0.06]"><td className="py-1">{t.label}</td><td className="num text-right">{num(t.units)}</td><td className="num text-right">{money(t.profit)}</td><td className={`num text-right ${t.delta_profit < 0 ? "text-danger" : "text-ok"}`}>{money(t.delta_profit, { sign: true })}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </>
  );
}

function MiniMap({ loc, snap, comps }: { loc: Location; snap: ReportContent["locations"][number]["snapshot"]; comps: CompetitorRec[] }) {
  const ring = snap?.catchment_geojson?.coordinates?.[0] || [];
  if (!ring.length) return null;
  const xs = ring.map((c) => c[0]);
  const ys = ring.map((c) => c[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const W = 260;
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * W;
  const sy = (y: number) => W - ((y - y0) / (y1 - y0 || 1)) * W;
  return (
    <svg viewBox={`-10 -10 ${W + 20} ${W + 20}`} className="h-56 w-56 shrink-0 rounded border border-black/[0.07] bg-ink-900" role="img" aria-label="Catchment and competitors">
      <polygon points={ring.map((c) => `${sx(c[0])},${sy(c[1])}`).join(" ")} fill="rgba(34,211,238,0.07)" stroke="#D93A1E" strokeDasharray="4 3" />
      {comps.filter((c) => c.active).map((c) => (
        <circle key={c.id} cx={sx(c.lng)} cy={sy(c.lat)} r={4} fill={c.source === "user" ? "#C59BFF" : "#F59E0B"} stroke="#FFFFFF" />
      ))}
      <circle cx={sx(loc.lng)} cy={sy(loc.lat)} r={6} fill="#D93A1E" stroke="#FFFFFF" strokeWidth={2} />
    </svg>
  );
}

export function ReportView({ c }: { c: ReportContent }) {
  const d = c.decision;
  const prof = c.project.profile as Record<string, any>;
  const ran = c.scenarios.filter((s) => s.result);
  return (
    <article className="print-light mx-auto max-w-4xl bg-ink-950 p-6 text-sm leading-relaxed text-ink-200 md:p-10">
      {c.project.is_demo && <div className="mb-4 rounded border border-amber-500/40 bg-you/200/10 px-3 py-2 text-xs font-medium text-amber-800">DEMO SCENARIO — Illustrative market data; not verified live conditions.</div>}
      <header>
        <div className="print-only font-display text-lg font-medium text-ink-100">StrataIQ</div>
        <h1 className="mt-5 font-display text-4xl font-medium leading-[1.02] tracking-[-0.03em] text-ink-100">{c.project.name}</h1>
        <p className="mt-2 text-sm text-ink-300">Location feasibility report, generated {when(c.generated_at)}</p>
      </header>

      <Executive c={c} />

      <H n={1}>Business concept</H>
      <p><b>{c.project.category.label}</b> — modeled as <b>{c.archetype.label}</b> ({c.archetype.unit_label} per month).</p>
      {prof.description && <p className="mt-1">{prof.description}</p>}
      {Array.isArray(prof.positioning) && prof.positioning.length > 0 && <p className="mt-1 text-ink-300">Claimed positioning (unverified): {prof.positioning.join(", ")}.</p>}
      <p className="mt-1 text-xs text-ink-400">Competitor search tags: {c.project.category.filters.join(" OR ")} ({c.project.category.method} match)</p>

      <H n={2}>Geographic area</H>
      <div className="space-y-4">
        {c.locations.map(({ location: l, snapshot: s }) => (
          <div key={l.id} className="flex flex-col gap-4 sm:flex-row">
            <MiniMap loc={l} snap={s} comps={c.competitors} />
            <div className="space-y-1">
              <div className="font-medium text-ink-100">{l.label}</div>
              <div className="text-xs text-ink-300">{l.address}</div>
              <div className="text-xs">Catchment: {s?.catchment_method === "isochrone" ? `${l.catchment.minutes} min ${l.catchment.profile}` : `${distance(l.catchment.radius_km)} straight-line radius`}</div>
              {s?.population?.total ? <div className="text-xs">Population: {num(s.population.total)} ({s.population.source === "worldpop" ? "WorldPop estimate" : s.population.source === "user" ? "user-entered" : s.population.source}; placement: {s.population.method})</div> : <div className="text-xs text-warn">Population unavailable</div>}
              {s && <div className="text-xs">Data coverage: {s.coverage.level} — {s.coverage.note}</div>}
            </div>
          </div>
        ))}
      </div>

      <H n={3}>Data sources and timestamps</H>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-ink-400"><th className="py-1 font-normal">Source</th><th className="font-normal">Layer</th><th className="font-normal">Retrieved</th><th className="font-normal">Source data as of</th><th className="font-normal">License</th></tr></thead>
        <tbody>
          {c.locations.flatMap(({ location: l, snapshot: s }) => (s?.sources || []).map((src, i) => (
            <tr key={`${l.id}-${i}`} className="border-t border-black/[0.06]">
              <td className="py-1">{src.name}</td><td>{src.layer}</td><td>{when(src.retrieved_at)}</td><td>{src.source_updated_at || "not reported"}</td><td>{src.license}</td>
            </tr>
          )))}
        </tbody>
      </table>
      {c.locations.some((l) => l.snapshot?.errors?.length) && <p className="mt-2 text-xs text-warn">Some sources failed: {c.locations.flatMap((l) => l.snapshot?.errors || []).map((e) => `${e.source} (${e.message})`).join("; ")}</p>}

      <H n={4}>Competitor overview</H>
      <p className="mb-2 text-xs text-ink-400">{c.competitors.filter((x) => x.active).length} active competitors ({c.competitors.filter((x) => x.source === "user").length} user-entered, {c.competitors.filter((x) => x.is_hypothetical).length} hypothetical). Prices are unknown unless recorded by the user.</p>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-ink-400"><th className="py-1 font-normal">Name</th><th className="font-normal">Source</th><th className="text-right font-normal">Price</th><th className="text-right font-normal">Last edited</th></tr></thead>
        <tbody>
          {c.competitors.slice(0, 30).map((x) => (
            <tr key={x.id} className="border-t border-black/[0.06]"><td className="py-1">{x.name}{!x.active && " (excluded)"}</td><td>{x.source === "osm" ? "OpenStreetMap" : x.source === "foursquare" ? "Foursquare Places" : x.source === "user" ? (x.is_hypothetical ? "Hypothetical" : "User-observed") : "Demo"}</td><td className="text-right">{x.price ? money(x.price) : "unknown"}</td><td className="text-right">{x.source_updated_at ? when(x.source_updated_at).split(",")[0] : "—"}</td></tr>
          ))}
        </tbody>
      </table>

      <H n={5}>Catchment and accessibility</H>
      <p>Distances in the model are {c.locations.some((l) => l.snapshot?.catchment_method === "isochrone") ? "travel-time catchments from a routing engine where configured, otherwise" : ""} straight-line distances multiplied by a road-circuity factor (assumption). Customers beyond the category’s consideration radius do not consider the business.</p>

      <H n={6}>Main modeling assumptions</H>
      {ran[0]?.result?.parameters && (
        <table className="w-full text-xs">
          <tbody>
            {Object.entries(ran[0].result.parameters).map(([k, v]) => (
              <tr key={k} className="border-t border-black/[0.06]"><td className="py-1">{v.label}</td><td className="num text-right">{num(v.value, 4)}</td><td className="text-right text-ink-400">[{num(v.low, 3)} – {num(v.high, 3)}]</td><td className="text-right">{v.status}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <H n={7}>Estimated demand and financial results</H>
      {ran.map(({ scenario: s, result: r }) => r?.summary && r.finance && (
        <div key={s.id} className="mb-3">
          <div className="font-medium text-ink-100">{s.name}{s.is_baseline && " (baseline)"}</div>
          <p className="text-xs">Price {money(r.summary.price)} · modeled demand {num(r.summary.modeled_demand_units)} {r.unit_label ?? c.archetype.unit_label}/month (capacity {num(r.summary.capacity_units)}) · revenue {money(r.finance.revenue)} · operating cost {money((r.finance.fixed_cost || 0) + (r.finance.variable_cost || 0))} · <b>operating profit {money(r.finance.operating_profit)}</b> · break-even {num(r.finance.break_even_units)} units · payback {r.finance.payback_months ? `${num(r.finance.payback_months, 1)} months` : "not reached"}.</p>
          {r.monte_carlo && <p className="text-xs text-ink-400">Across {num(r.monte_carlo.draws)} market scenarios: bad month {money(r.monte_carlo.profit.p10)}, typical month {money(r.monte_carlo.profit.p50)}, good month {money(r.monte_carlo.profit.p90)}. Chance of a monthly loss: {pct(r.monte_carlo.prob_loss)}.</p>}
        </div>
      ))}

      <H n={8}>Scenario comparison</H>
      <table className="w-full text-xs">
        <thead><tr className="text-left text-ink-400"><th className="py-1 font-normal">Rank</th><th className="font-normal">Scenario</th><th className="text-right font-normal">Units</th><th className="text-right font-normal">Profit / mo</th><th className="text-right font-normal">Chance of loss</th></tr></thead>
        <tbody>{d.ranking.map((r) => <tr key={r.scenario_id} className="border-t border-black/[0.06]"><td className="py-1">{r.rank}</td><td>{r.name}</td><td className="text-right">{num(r.units)}</td><td className="text-right">{money(r.profit)}</td><td className="text-right">{pct(r.prob_loss)}</td></tr>)}</tbody>
      </table>
      <p className="mt-2"><b>Result:</b> {d.headline}</p>

      <H n={9}>Downside risks</H>
      <ul className="list-disc space-y-1 pl-5">{d.risks.filter((r) => r.factor !== "Data gap").map((r, i) => <li key={i}>{r.text}</li>)}</ul>

      <H n={10}>Major unknowns</H>
      <ul className="list-disc space-y-1 pl-5">{(d.gaps || []).map((g) => <li key={g.key}>{g.text}</li>)}{!(d.gaps || []).length && <li>No critical data gaps were flagged by the rules; local verification is still recommended.</li>}</ul>

      <H n={11}>Recommended next actions</H>
      <ol className="list-decimal space-y-1 pl-5">{d.next_actions.map((a, i) => <li key={i}>{a.action} <span className="text-ink-400">— {a.why}</span></li>)}</ol>
      {d.recommendations.length > 0 && (
        <ul className="mt-3 space-y-2">
          {d.recommendations.map((r, i) => <li key={i} className="rounded border border-black/[0.07] p-2 text-xs"><b>{r.action}</b> {r.reason} Reconsider if: {r.reconsider_if}</li>)}
        </ul>
      )}

      <H n={12}>Methodology and limitations</H>
      <p>The demand figure is a planning estimate. In a test against a year of reported alcohol sales at 5,546 Texas bars and restaurants, location data explained under 3% of the difference between individual venues, so your concept, size and operation can move real sales far from this figure.</p>
      <p>Demand is estimated with a multinomial-logit customer-choice model over synthetic customer segments placed on a population grid, with an outside option, lognormal affordability, distance decay and capacity limits. Uncertainty is propagated by Monte Carlo over documented parameter ranges. Default behaviour parameters are not calibrated against observed sales; no accuracy figure is claimed. See /methodology for formulas.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-ink-300">{(ran[0]?.result?.limitations || []).map((l) => <li key={l}>{l}</li>)}</ul>
      <BottomLine c={c} />
      <p className="mt-6 text-[11px] leading-snug text-ink-400">{c.disclaimer} Map data © OpenStreetMap contributors (ODbL). Population © WorldPop (CC BY 4.0). Neighborhood figures: U.S. Census Bureau ACS 2023, not endorsed or certified by the Census Bureau.</p>
    </article>
  );
}
