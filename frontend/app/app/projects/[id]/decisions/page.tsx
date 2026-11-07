"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, ListChecks, Sparkles, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/AppShell";
import { useProject } from "@/components/ProjectContext";
import { Badge, Button, ButtonLink, Card, CardHeader, cn, EmptyState, ErrorState, Evidence, Notice, Segmented, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { money, num, pct } from "@/lib/format";
import type { Decision, Goal } from "@/lib/types";

const VERDICT: Record<Decision["verdict"], { label: string; tone: "ok" | "warn" | "danger" | "neutral"; icon: typeof CheckCircle2 }> = {
  potentially_viable: { label: "Can work under these inputs", tone: "ok", icon: CheckCircle2 },
  financially_challenging: { label: "Loses money as planned", tone: "danger", icon: TrendingDown },
  high_uncertainty: { label: "High uncertainty", tone: "warn", icon: CircleHelp },
  more_evidence_required: { label: "More evidence required", tone: "warn", icon: AlertTriangle },
  no_conclusion: { label: "No conclusion yet", tone: "neutral", icon: CircleHelp },
};

export default function Decisions() {
  const { project: p, reload } = useProject();
  const { caps } = useSession();
  const [goal, setGoal] = useState<Goal>(p.decision_goal);
  const [d, setD] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<{ status: string; text: string | null } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(() => {
    setD(null);
    api<Decision>(`/projects/${p.id}/decisions?goal=${goal}`).then(setD).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load"));
  }, [p.id, goal]);
  useEffect(load, [load]);

  async function changeGoal(g: Goal) {
    setGoal(g);
    setAi(null);
    await api(`/projects/${p.id}`, { method: "PATCH", json: { decision_goal: g } }).catch(() => undefined);
    reload();
  }

  async function explain() {
    setAiBusy(true);
    try {
      setAi(await api(`/projects/${p.id}/explain?goal=${goal}`, { method: "POST" }));
    } catch (e) {
      setAi({ status: "error", text: e instanceof ApiError ? e.message : null });
    } finally {
      setAiBusy(false);
    }
  }

  if (error) return <div className="p-6"><ErrorState message={error} onRetry={load} /></div>;
  if (!d) return <div className="space-y-3 p-6"><Skeleton className="h-28" /><Skeleton className="h-64" /></div>;
  if (d.verdict === "no_conclusion")
    return (
      <div className="p-6">
        <EmptyState title="No simulation results yet" body="Run at least the baseline scenario in the Simulation Lab." action={<ButtonLink href={`/app/projects/${p.id}/simulation`} variant="primary">Open Simulation Lab</ButtonLink>} />
      </div>
    );

  const V = VERDICT[d.verdict];
  const fs = d.financial_summary!;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-300">Optimize recommendations for</div>
        <Segmented<Goal>
          value={goal}
          onChange={changeGoal}
          options={[{ value: "profit", label: "Expected profit" }, { value: "low_risk", label: "Low risk" }, { value: "break_even", label: "Fast payback" }, { value: "growth", label: "Most customers" }]}
        />
      </div>

      {(d.stale_scenarios?.length || d.not_run?.length) ? (
        <Notice tone="warn">
          {d.stale_scenarios?.length ? <>Inputs changed since the last run for: <b>{d.stale_scenarios.join(", ")}</b>. </> : null}
          {d.not_run?.length ? <>Not yet simulated: <b>{d.not_run.join(", ")}</b>. </> : null}
          <Link href={`/app/projects/${p.id}/simulation`} className="underline">Re-run in the lab</Link> to include them.
        </Notice>
      ) : null}

      <section className={cn("wipe border border-night p-6 text-night", V.tone === "ok" ? "bg-moss" : V.tone === "danger" ? "bg-brick" : V.tone === "warn" ? "bg-you" : "bg-ink-800")}>
        <div className="flex items-center gap-2 text-[15px] font-semibold"><V.icon className="h-5 w-5" /> {V.label}</div>
        <p className="font-display mt-2 max-w-[44ch] text-[30px] leading-[1.1]">{d.headline}</p>
      </section>

      <div className="grid border-l border-t border-night bg-white sm:grid-cols-3 lg:grid-cols-6">
        {[
          { l: "Profit / month", v: <span className={fs.operating_profit < 0 ? "text-danger" : "text-ok"}>{money(fs.operating_profit, { compact: true })}</span>, n: `${money(fs.profit_p10, { compact: true })} to ${money(fs.profit_p90, { compact: true })}` },
          { l: "Revenue / month", v: money(fs.revenue, { compact: true }), n: fs.scenario },
          { l: "Costs / month", v: money(fs.operating_cost, { compact: true }), n: `${pct(fs.utilization)} of capacity used` },
          { l: "To break even", v: fs.break_even_units === null ? "Not reached" : num(fs.break_even_units), n: `${fs.unit_label} a month` },
          { l: "Chance of a losing month", v: pct(fs.prob_loss), n: "Under these inputs" },
          { l: "Payback", v: fs.payback_months ? `${num(fs.payback_months, 1)} mo` : "Not reached", n: `${money(fs.startup_cost, { compact: true })} to open` },
        ].map((x, i) => (
          <div key={x.l} className="rise border-b border-r border-night p-4" style={{ animationDelay: `${150 + i * 45}ms` }}>
            <div className="text-[13px] text-ink-300">{x.l}</div>
            <div className="num font-display mt-1.5 text-[30px] leading-none">{x.v}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-400"><span aria-hidden className="h-2 w-3 shrink-0 border border-night bg-stone" title="Estimated" /> <span className="truncate">{x.n}</span></div>
          </div>
        ))}
      </div>
      <p className="-mt-3 text-[12px] text-ink-400">Ranked for {d.objective_label}. {d.method_note}</p>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Recommendations" subtitle="Each one is derived from computed results and states what would change it." />
            {d.recommendations.length === 0 ? (
              <p className="p-4 text-sm text-ink-400">No change from the current plan stands out under the model. Focus on verifying the evidence below.</p>
            ) : (
              <ul className="divide-y divide-black/[0.06]">
                {d.recommendations.map((r, i) => (
                  <li key={i} className="space-y-2 p-4 text-sm">
                    <div className="font-medium text-ink-100">{r.action}</div>
                    <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[150px_1fr]">
                      <dt className="text-ink-400">Modeled reason</dt><dd className="text-ink-200">{r.reason}</dd>
                      {Object.keys(r.change_vs_baseline).length > 0 && (<><dt className="text-ink-400">Change vs baseline</dt><dd className="num text-ink-200">{Object.entries(r.change_vs_baseline).map(([k, v]) => `${k.replace("_", " ")} ${k.includes("profit") ? money(v, { sign: true }) : `${v > 0 ? "+" : ""}${num(v)}`}`).join(" · ")}</dd></>)}
                      <dt className="text-ink-400">Main uncertainty</dt><dd className="text-ink-200">{r.main_uncertainty}</dd>
                      <dt className="text-ink-400">Verify next</dt><dd className="text-ink-200">{r.verify_next}</dd>
                      <dt className="text-ink-400">Reconsider if</dt><dd className="text-ink-200">{r.reconsider_if}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Scenario ranking" subtitle={`By ${d.objective_label}`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-black/[0.06] text-left text-xs text-ink-400"><th className="px-3 py-2 font-normal">#</th><th className="font-normal">Scenario</th><th className="text-right font-normal">Units</th><th className="text-right font-normal">Profit / mo</th><th className="text-right font-normal">P10</th><th className="text-right font-normal">P(loss)</th><th className="px-3 text-right font-normal">Payback</th></tr></thead>
                <tbody>
                  {d.ranking.map((r) => (
                    <tr key={r.scenario_id} className={cn("border-b border-black/[0.06]/60", r.rank === 1 && "bg-accent-dim")}>
                      <td className="num px-3 py-2">{r.rank}</td>
                      <td>{r.name} {r.is_baseline && <span className="text-xs text-ink-500">(baseline)</span>}</td>
                      <td className="num text-right">{num(r.units)}</td>
                      <td className={cn("num text-right", r.profit < 0 && "text-danger")}>{money(r.profit, { compact: true })}</td>
                      <td className="num text-right">{money(r.profit_p10, { compact: true })}</td>
                      <td className="num text-right">{pct(r.prob_loss)}</td>
                      <td className="num px-3 text-right">{r.payback_months ? `${num(r.payback_months, 1)} mo` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-3 py-2 text-xs text-ink-400">Switch the goal above: the highest-profit scenario is not always the lowest-risk one.</p>
          </Card>

          {caps?.ai && (
            <Card>
              <CardHeader title="Plain-language summary" right={<Button size="sm" onClick={explain} loading={aiBusy}><Sparkles className="h-3.5 w-3.5" /> {ai ? "Regenerate" : "Explain this result"}</Button>} />
              <div className="p-4 text-sm">
                {!ai && <p className="text-ink-400">An AI model can paraphrase the result above. It may only use numbers that already appear in the result; otherwise the text is discarded.</p>}
                {ai?.status === "ok" && (
                  <div className="space-y-2">
                    <Evidence kind="ai" />
                    <p className="whitespace-pre-line leading-relaxed text-ink-200">{ai.text}</p>
                  </div>
                )}
                {ai && ai.status === "rejected_ungrounded" && <Notice tone="warn">The AI summary introduced numbers not present in the model output, so it was discarded. Please rely on the structured result above.</Notice>}
                {ai && ai.status !== "ok" && ai.status !== "rejected_ungrounded" && <Notice tone="warn">The AI summary is unavailable right now.</Notice>}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title={<span className="flex items-center gap-1.5"><ListChecks className="h-4 w-4" /> What to do next</span>} />
            <ul className="divide-y divide-black/[0.06]">
              {d.next_actions.map((a, i) => (
                <li key={i} className="space-y-1 p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-ink-100">{a.action}</span>
                    <Badge tone={a.priority === "high" ? "danger" : a.priority === "medium" ? "warn" : "neutral"}>{a.priority}</Badge>
                  </div>
                  <p className="text-xs text-ink-400">Why: {a.why}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="What could make this result wrong?" />
            <ul className="divide-y divide-black/[0.06]">
              {d.risks.map((r, i) => (
                <li key={i} className="p-3 text-sm">
                  <div className="flex items-center gap-2 text-xs text-ink-400">{r.factor} {r.status === "assumption" && <Evidence kind="assumption" />} {r.status === "user" && <Evidence kind="user" />}</div>
                  <p className="mt-0.5 text-ink-200">{r.text}</p>
                </li>
              ))}
            </ul>
          </Card>
          {d.drivers && d.drivers.length > 0 && (
            <Card className="p-4 text-sm">
              <div className="mb-2 font-medium">Most influential assumptions</div>
              {d.drivers.map((x) => (
                <div key={x.param} className="mb-1.5">
                  <div className="flex justify-between text-xs"><span className="text-ink-300">{x.label}</span><span className="num">{x.spearman_rho.toFixed(2)}</span></div>
                  <div className="mt-1 h-1.5 rounded bg-ink-800"><div className={cn("h-1.5 rounded", x.spearman_rho >= 0 ? "bg-stone" : "bg-brick")} style={{ width: `${Math.abs(x.spearman_rho) * 100}%` }} /></div>
                </div>
              ))}
              <p className="mt-2 text-[11px] text-ink-500">Rank correlation with profit across Monte Carlo draws (model attribution, not causation).</p>
            </Card>
          )}
          <ButtonLink href={`/app/projects/${p.id}/report`} variant="next" size="lg" className="w-full">Create the report</ButtonLink>
        </div>
      </div>
    </main>
  );
}
