"use client";

import { ArrowRight, FlaskConical, GitCompareArrows, MapPinned, Rocket, Trash2, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/AppShell";
import { QuickStart } from "@/components/QuickStart";
import { Badge, Button, ButtonLink, Dialog, EmptyState, ErrorState, Evidence, Skeleton } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { ago, money, num, OBJECTIVES, pct } from "@/lib/format";
import type { Project } from "@/lib/types";

const actions = [
  { href: "/app/projects/new?objective=start_new", t: "Start a business", d: "Test a new idea at a location", i: Rocket },
  { href: "/app/projects/new?objective=improve_existing", t: "Grow my business", d: "Diagnose and improve with your figures", i: TrendingUp },
  { href: "/app/projects/new?objective=compare_locations", t: "Compare locations", d: "Rank candidate sites side by side", i: MapPinned },
  { href: "/app/projects/new?objective=test_strategy", t: "Optimize my strategy", d: "Price, marketing and capacity tests", i: GitCompareArrows },
];

export default function Dashboard() {
  const { user } = useSession();
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
    <main className="mx-auto w-full max-w-7xl px-4 py-10 md:px-10">
      <div className="rise bg-night text-white">
        <div className="relative flex flex-col justify-between gap-8 p-6 md:flex-row md:items-end md:p-10">
          <div>
            <h1 className="font-display max-w-3xl text-[clamp(2.25rem,1.5rem+2.4vw,3.75rem)] font-medium leading-[1] tracking-[-0.03em]">Which location are you considering?</h1>
            <p className="mt-5 max-w-xl text-[17px] leading-snug text-white">Describe your business and pick a street. We load the competition and the neighborhood, then test your plan.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={liveDemo} loading={liveBusy}>
              See an example
            </Button>
            <Link href="/app/projects/new" className="inline-flex h-10 items-center gap-2 whitespace-nowrap bg-accent px-4.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 motion-reduce:transform-none">New analysis <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </div>
      </div>

      <div className="rise rise-1 mt-8">
        <QuickStart />
      </div>

      <div className="rise rise-2 mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <Link key={a.t} href={a.href} className="group relative bg-white p-5 transition-colors duration-300 hover:bg-night hover:text-white">
            <div>
              <a.i className="h-4.5 w-4.5 text-ink-400 transition-colors group-hover:text-accent" />
            </div>
            <div className="font-display mt-8 text-[17px] tracking-tight">{a.t}</div>
            <div className="mt-1 flex items-center justify-between text-[13px] text-ink-400 group-hover:text-white/60">
              {a.d}
              <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-14 flex items-end justify-between border-b border-ink-100 pb-3">
        <h2 className="font-display text-2xl tracking-tight">Your simulations {projects && projects.length > 0 && <span className="num ml-1 text-sm text-ink-400">{projects.length}</span>}</h2>
        <Button size="sm" variant="ghost" onClick={demo} loading={busy}>
          <FlaskConical className="h-3.5 w-3.5" /> Open a sample project
        </Button>
      </div>

      <div className="mt-4">
        {error && <ErrorState message={error} onRetry={load} />}
        {!projects && !error && (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1].map((i) => <Skeleton key={i} className="h-36" />)}
          </div>
        )}
        {projects && projects.length === 0 && (
          <EmptyState
            icon={<MapPinned className="h-6 w-6" />}
            title="No simulations yet"
            body="Describe a business, pick a place, and StrataIQ will load live market evidence and simulate customer choices."
            action={<ButtonLink href="/app/projects/new" variant="primary">Build your first market simulation</ButtonLink>}
          />
        )}
        {projects && projects.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {projects.map((p) => (
              <div key={p.id} className="lift group flex flex-col rounded-md border border-ink-100/[0.12] bg-white p-5 hover:border-ink-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/app/projects/${p.id}`} className="font-display block truncate text-lg tracking-tight group-hover:text-accent">{p.name}</Link>
                    <div className="mt-0.5 truncate text-xs text-ink-400">
                      {p.category.label} · {p.locations[0]?.address || `${p.locations[0]?.lat.toFixed(4)}, ${p.locations[0]?.lng.toFixed(4)}`}
                    </div>
                  </div>
                  <button aria-label={`Delete ${p.name}`} onClick={() => setDel(p)} className="rounded-md p-1 text-ink-500 opacity-0 transition-opacity hover:text-red-700 focus:opacity-100 group-hover:opacity-100">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {p.is_demo && <Evidence kind="demo" />}
                  {p.data_kinds?.connected_sources && !p.is_demo && <Evidence kind="observed" label="Live sources" />}
                  <Badge>{OBJECTIVES[p.objective]}</Badge>
                </div>
                <div className="mt-5 flex-1 text-sm">
                  {p.summary ? (
                    <div className="grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-4">
                      <div>
                        <div className="label-mono text-[10px] text-ink-400">{p.summary.unit_label}</div>
                        <div className="num font-display mt-1 text-lg">{num(p.summary.units_sold)}</div>
                      </div>
                      <div>
                        <div className="label-mono text-[10px] text-ink-400">Profit / month</div>
                        <div className={`num font-display mt-1 text-lg ${p.summary.operating_profit < 0 ? "text-red-700" : "text-ok"}`}>{money(p.summary.operating_profit, { compact: true })}</div>
                      </div>
                      <div>
                        <div className="label-mono text-[10px] text-ink-400">Chance of a loss</div>
                        <div className="num font-display mt-1 text-lg">{pct(p.summary.prob_loss)}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="border-t border-black/[0.06] pt-4 text-xs text-ink-400">Not simulated yet — open it and load the market.</p>
                  )}
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-ink-400">
                  <span>Updated {ago(p.updated_at)}</span>
                  <Link href={`/app/projects/${p.id}`} className="inline-flex items-center gap-1 text-accent hover:underline">Open <ArrowRight className="h-3 w-3" /></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
