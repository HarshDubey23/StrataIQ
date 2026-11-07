"use client";

import { ArrowRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { BlockPlan } from "@/components/brand";
import { QuickStart } from "@/components/QuickStart";
import { Button, ButtonLink, Dialog, ErrorState, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ago, money, num, pct } from "@/lib/format";
import type { Project } from "@/lib/types";

const actions = [
  { href: "/app/projects/new?objective=improve_existing", t: "Grow a business I already run" },
  { href: "/app/projects/new?objective=compare_locations", t: "Compare several locations" },
  { href: "/app/projects/new?objective=test_strategy", t: "Test a pricing or marketing plan" },
];

export default function Dashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [del, setDel] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError(null);
    api<Project[]>("/projects").then(setProjects).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load projects"));
  }, []);
  useEffect(load, [load]);

  const [liveBusy, setLiveBusy] = useState(false);
  async function liveDemo() {
    setLiveBusy(true);
    try {
      const p = await api<Project>("/demo/live", { method: "POST" });
      router.push(`/app/projects/${p.id}/market`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create the live demo");
      setLiveBusy(false);
    }
  }

  async function demo() {
    setBusy(true);
    try {
      const p = await api<Project>("/demo", { method: "POST" });
      router.push(`/app/projects/${p.id}/live`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create demo");
      setBusy(false);
    }
  }

  async function remove() {
    if (!del) return;
    await api(`/projects/${del.id}`, { method: "DELETE" });
    setDel(null);
    load();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8">
      <h1 className="font-display text-[40px] leading-[1.05]">Which location are you considering?</h1>
      <p className="mt-2 max-w-[60ch] text-[16px] text-ink-300">Describe your business and pick a street. We load the competition and the neighborhood, then test your plan.</p>

      <div className="mt-6"><QuickStart /></div>

      <nav aria-label="Other ways to start" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px]">
        {actions.map((a) => <Link key={a.t} href={a.href} className="text-atlas underline underline-offset-4 hover:text-night">{a.t}</Link>)}
        <button onClick={liveDemo} disabled={liveBusy} className="text-atlas underline underline-offset-4 hover:text-night disabled:opacity-60">{liveBusy ? "Opening…" : "See an example"}</button>
      </nav>

      <div className="mt-12 flex items-baseline justify-between border-b border-night pb-2">
        <h2 className="font-display text-[26px]">Your locations{projects && projects.length > 0 && <span className="num ml-2 text-[18px] font-medium text-ink-400">{projects.length}</span>}</h2>
        <Button size="sm" variant="ghost" onClick={demo} loading={busy}>Open a sample project</Button>
      </div>

      {error && <div className="mt-4"><ErrorState message={error} onRetry={load} /></div>}
      {!projects && !error && <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>}
      {projects && projects.length === 0 && (
        <div className="mt-4 grid border border-night bg-white md:grid-cols-[1fr_1.1fr]">
          <div className="p-7">
            <h3 className="font-display text-[28px] leading-tight">Your first sheet is blank.</h3>
            <p className="mt-2 max-w-[44ch] text-[15px] text-ink-300">Name a business and a place above, and StrataIQ will draw the block, load the rivals and test your plan.</p>
            <ButtonLink href="/app/projects/new" variant="secondary" className="mt-5">Use the full form</ButtonLink>
          </div>
          <div className="h-48 overflow-hidden border-t border-night bg-atlas md:h-auto md:border-l md:border-t-0"><BlockPlan seed={23} className="h-full w-full" /></div>
        </div>
      )}
      {projects && projects.length > 0 && (
        <ul>
          {projects.map((p) => (
            <li key={p.id} className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 border-b border-ink-600 py-4 transition-colors hover:bg-white md:grid-cols-[minmax(0,1fr)_6rem_7rem_6rem_6rem_2rem] md:px-2">
              <div className="min-w-0">
                <Link href={`/app/projects/${p.id}`} className="font-display block truncate text-[20px] leading-tight underline-offset-4 hover:underline">{p.name}{p.is_demo && <span className="ml-2 border border-dashed border-night px-1 align-middle font-sans text-[11px] font-medium">Demo</span>}</Link>
                <div className="mt-0.5 truncate text-[13px] text-ink-400">{p.category.label} · {p.locations[0]?.address || `${p.locations[0]?.lat.toFixed(4)}, ${p.locations[0]?.lng.toFixed(4)}`}</div>
              </div>
              {p.summary ? (
                <>
                  <div className="hidden md:block"><div className="text-[12px] capitalize text-ink-400">{p.summary.unit_label}</div><div className="num font-semibold">{num(p.summary.units_sold)}</div></div>
                  <div><div className="text-[12px] text-ink-400">Profit / month</div><div className={`num font-semibold ${p.summary.operating_profit < 0 ? "text-danger" : "text-ok"}`}>{money(p.summary.operating_profit, { compact: true })}</div></div>
                  <div className="hidden md:block"><div className="text-[12px] text-ink-400">Loss risk</div><div className="num font-semibold">{pct(p.summary.prob_loss)}</div></div>
                </>
              ) : (
                <Link href={`/app/projects/${p.id}`} className="inline-flex items-center gap-1 text-[13px] font-medium text-atlas md:col-span-3">Not tested yet. Open <ArrowRight className="h-3 w-3" /></Link>
              )}
              <div className="hidden text-[13px] text-ink-400 md:block">{ago(p.updated_at)}</div>
              <button aria-label={`Delete ${p.name}`} onClick={() => setDel(p)} className="hidden p-1 text-ink-400 opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100 md:block"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete project?"
        footer={
          <>
            <Button onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="danger" onClick={remove}>Delete permanently</Button>
          </>
        }
      >
        “{del?.name}” and all its scenarios, runs, competitors you added and reports will be deleted. This cannot be undone.
      </Dialog>
    </main>
  );
}
