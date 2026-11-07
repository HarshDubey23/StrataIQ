"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal, RollLink, WordsIn } from "@/components/motion";
import { cn } from "@/components/ui";
import { SPOTS, type PreviewComp, type Spot } from "./spots";
import { US_MARKET } from "@/lib/format";

const HeroMap = dynamic(() => import("./HeroMap"), { ssr: false, loading: () => null });

const CATS = [
  { key: "cafe", label: "Cafés" },
  { key: "gym", label: "Gyms" },
  { key: "pizza", label: "Pizza" },
  { key: "pharmacy", label: "Pharmacies" },
  { key: "salon", label: "Salons" },
];

const IDEAS = US_MARKET ? ["A gym in South Austin, fees $49 a month", "A café in Wynwood, Miami, coffee at $6", "A salon in Downtown Phoenix", "A dental clinic near Downtown Austin"] : ["A gym in Bandra West, fees ₹2,000", "A café in Indiranagar, coffee at ₹250", "A salon in Sector 18, Noida", "A pharmacy near Connaught Place"];

const HEAD = "font-display text-[clamp(2.25rem,1.4rem+2.6vw,3.75rem)] font-normal leading-[0.98] tracking-[-0.03em]";

const FAQ: [string, string][] = [
  ["How accurate is it?", "We don't know yet, so we don't publish an accuracy score. Forecasts have not been measured against real business results. Use them to compare options and find what to check, not as a promise."],
  ["What is real and what is assumed?", "Places, population and neighbourhood figures are real data. Starting costs, how often people buy, and how they react to prices are assumptions. They are labelled, and you can replace them with your own numbers."],
  ["Which places does it cover?", "Anywhere in the US. Competitor lists depend on OpenStreetMap, so they are usually fuller in big cities than in small towns."],
  ["Is this financial advice?", "No. It is a planning tool. Talk to a professional and get real quotes before you sign a lease or borrow money."],
];

interface Preview {
  spot: Spot;
  category: { key: string; label: string };
  radius_m: number;
  competitors: PreviewComp[];
  source: { name: string; retrieved_at: string; detail: string; from_cache: boolean };
}

async function ensureSession(): Promise<void> {
  const me = await fetch("/api/v1/auth/me", { credentials: "include" });
  if (me.ok) return;
  const g = await fetch("/api/v1/auth/guest", { method: "POST", credentials: "include" });
  if (!g.ok) throw new Error("The server is waking up. Try again in a few seconds.");
}

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useLenis() {
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    import("lenis").then(({ default: Lenis }) => {
      lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 }) as unknown as typeof lenis;
      const loop = (t: number) => {
        lenis?.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);
}

/** Cycles placeholder ideas like someone typing, so the empty box teaches what to write. */
function useTypewriter(lines: string[]) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (reduced()) {
      setText(lines[0]);
      return;
    }
    let i = 0;
    let j = 0;
    let del = false;
    const id = setInterval(() => {
      const l = lines[i % lines.length];
      if (!del) {
        j++;
        if (j > l.length + 18) del = true;
      } else {
        j -= 2;
        if (j <= 0) {
          del = false;
          i++;
          j = 0;
        }
      }
      setText(l.slice(0, Math.max(0, Math.min(j, l.length))));
    }, 55);
    return () => clearInterval(id);
  }, [lines]);
  return text;
}

/** Scroll position as a chapter number with a fraction (0 = hero, 5 = last chapter), plus the nearest whole chapter. */
function useStoryProgress() {
  const progress = useRef(0);
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-scene]"));
    const on = () => {
      const mid = window.innerHeight / 2;
      let p = els.length - 1;
      for (let i = 0; i < els.length; i++) {
        const r = els[i].getBoundingClientRect();
        if (r.top > mid) {
          p = i - 0.5;
          break;
        }
        if (r.bottom > mid) {
          p = i + (mid - r.top) / r.height - 0.5;
          break;
        }
      }
      progress.current = Math.max(0, Math.min(els.length - 1, p));
      setScene(Math.round(progress.current));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return { progress, scene };
}

export default function Landing() {
  const router = useRouter();
  const [spot, setSpot] = useState<Spot>(SPOTS[0]);
  const [cat, setCat] = useState("cafe");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState<null | "live" | "idea">(null);
  const [goErr, setGoErr] = useState<string | null>(null);
  const placeholder = useTypewriter(IDEAS);
  const { progress, scene } = useStoryProgress();
  useLenis();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadErr(null);
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 75_000);
    try {
      const r = await fetch(`/api/v1/market/preview?spot=${spot.key}&category=${cat}`, { signal: ctl.signal });
      if (!r.ok) throw new Error(r.status === 502 || r.status === 503 ? "OpenStreetMap is busy" : `HTTP ${r.status}`);
      setPreview(await r.json());
    } catch (e) {
      setLoadErr(e instanceof Error && e.name !== "AbortError" ? e.message : "The live-data server is waking up");
    } finally {
      clearTimeout(to);
      setLoading(false);
    }
  }, [spot.key, cat]);
  useEffect(() => {
    void load();
  }, [load]);

  async function simulate(text: string) {
    const t = text.trim();
    if (t.length < 3) return;
    setBusy("idea");
    setGoErr(null);
    try {
      await ensureSession();
      router.push(`/app?idea=${encodeURIComponent(t)}`);
    } catch (e) {
      setGoErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  async function liveDemo() {
    setBusy("live");
    setGoErr(null);
    try {
      await ensureSession();
      const demoKind = ["cafe", "pizza", "gym"].includes(cat) ? cat : "cafe";
      const r = await fetch(`/api/v1/demo/live?spot=${spot.key}&kind=${demoKind}`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Could not start the live example. Try again in a moment.");
      const p = await r.json();
      router.push(`/app/projects/${p.id}/market`);
    } catch (e) {
      setGoErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  const comps = preview && preview.spot.key === spot.key ? preview.competitors : [];
  const catLabel = CATS.find((c) => c.key === cat)?.label.toLowerCase() || "businesses";
  const area = spot.label.split(",")[0];
  const action = "inline-flex min-h-12 items-center justify-center gap-2 bg-accent px-6 text-[17px] font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 motion-reduce:transform-none";

  return (
    <div className="lp2 bg-paper text-night lg:grid lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      {/* The fixed half: the real street, changing with the story beside it */}
      <div className="sticky top-0 z-0 order-2 h-[30svh] overflow-hidden bg-night lg:h-svh">
        <HeroMap spot={spot} comps={comps} scene={scene} progress={progress} />
      </div>

      <main className="relative z-10 order-1 bg-paper px-5 md:px-10 lg:px-14">
        <header className="flex items-center justify-between py-6">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight">StrataIQ</Link>
          <nav className="flex items-center gap-5 text-[16px]">
            <RollLink href="#pricing" className="hidden sm:inline-block">Pricing</RollLink>
            <RollLink href="/methodology" className="hidden sm:inline-block">Method</RollLink>
            <RollLink href="/sign-in">Sign in</RollLink>
          </nav>
        </header>

        <section data-scene className="max-w-[46ch] pb-24 pt-[3svh] lg:min-h-[calc(100svh-5rem)] lg:pt-[8svh]">
          <WordsIn as="h1" text="Test the location before you sign." className="font-display text-[clamp(2.5rem,1.4rem+3vw,4.25rem)] font-normal leading-[0.97] tracking-[-0.03em]" />
          <Reveal delay={0.25}>
            <p className="mt-7 text-[19px] leading-[1.45]">
              See the real competitors, the people who live nearby, and how many customers a day you need to break even. The first look is free.
            </p>
          </Reveal>
          <Reveal delay={0.35}>
            <form className="mt-8" onSubmit={(e) => { e.preventDefault(); void simulate(idea); }}>
              <label htmlFor="idea" className="mb-2 block text-[16px] font-medium">Your business idea</label>
              <input id="idea" aria-label="Your business idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={placeholder}
                className="min-h-12 w-full bg-white px-4 text-[17px] text-night placeholder:text-night/55" />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                <button type="submit" disabled={busy !== null || idea.trim().length < 3} className={action}>
                  {busy === "idea" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Test my location
                </button>
                <button type="button" onClick={() => void liveDemo()} disabled={busy !== null} className="min-h-12 text-[17px] underline underline-offset-4 disabled:opacity-60">
                  {busy === "live" ? "Opening…" : `See ${area}`}
                </button>
              </div>
              {goErr && <p role="alert" className="mt-3 text-[16px] text-danger">{goErr}</p>}
            </form>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Every rival, counted live." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">Pick a neighbourhood and a business. This list comes from OpenStreetMap right now, not from a saved example.</p>
            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="City">
              {SPOTS.map((s) => (
                <button key={s.key} aria-pressed={s.key === spot.key} onClick={() => setSpot(s)}
                  className={cn("min-h-11 px-4 text-[16px] transition-colors", s.key === spot.key ? "bg-night text-white" : "bg-white hover:bg-night/10")}>{s.label.split(",")[0]}</button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Business type">
              {CATS.map((c) => (
                <button key={c.key} aria-pressed={c.key === cat} onClick={() => setCat(c.key)}
                  className={cn("min-h-11 px-4 text-[16px] transition-colors", c.key === cat ? "bg-data text-white" : "bg-white hover:bg-night/10")}>{c.label}</button>
              ))}
            </div>
            <div aria-live="polite" className="mt-8">
              {loading ? <p className="flex items-center gap-2 text-[18px]"><Loader2 className="h-4 w-4 animate-spin" /> Checking {area}…</p>
                : loadErr ? <p className="text-[18px]">{loadErr}. <button onClick={() => void load()} className="underline underline-offset-4">Try again</button></p>
                : <>
                    <p className="font-display text-[clamp(4rem,3rem+4vw,7rem)] leading-none tracking-[-0.03em]">{comps.length}</p>
                    <p className="mt-2 text-[18px]">{catLabel} mapped around {area}</p>
                    {comps.length > 0 && <p className="mt-3 text-[17px]">Including {comps.slice(0, 3).map((c) => c.name).join(", ")}.</p>}
                    <p className="mt-3 text-[16px] text-night/75">Maps miss some places, so check the street yourself too.</p>
                  </>}
            </div>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Know who lives nearby." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">
              Income, age, household size, jobs, students and how people travel come from the US Census for 84,091 neighbourhoods. A block of renters and a block of retirees stop looking the same.
            </p>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Simulated customers decide." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">
              Thousands of simulated people choose you, a rival, or nothing, day after day. They have budgets and routines, remember bad visits, and tell their friends. Their traits follow local statistics, and none of them is a real person.
            </p>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Get numbers you can check." className={HEAD} />
          <Reveal delay={0.15}>
            <ul className="mt-6 space-y-3 text-[18px] leading-[1.45]">
              <li>Customers a day you need to break even.</li>
              <li>Profit in a bad, normal and good month, as a range.</li>
              <li>What happens if you change your price.</li>
              <li>The assumptions to check before you sign, in order of how much they matter.</li>
            </ul>
          </Reveal>
        </section>

        <section id="pricing" className="-mx-5 bg-night px-5 py-24 text-white md:-mx-10 md:px-10 lg:-mx-14 lg:px-14">
          <WordsIn text="Pay only for a location you like." className={HEAD} />
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            <Reveal>
              <p className="font-display text-5xl tracking-[-0.03em]">Free</p>
              <p className="mt-3 text-[18px] leading-[1.45]">Your first look: the map, nearby competitors, and your break-even point.</p>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="font-display text-5xl tracking-[-0.03em]">$29</p>
              <p className="mt-3 text-[18px] leading-[1.45]">One location&apos;s full report: profit range, pricing tests and your checklist. One payment, no subscription.</p>
            </Reveal>
          </div>
        </section>

        <section className="max-w-[46ch] py-24">
          <WordsIn text="Before you rely on it" className={HEAD} />
          {FAQ.map(([q, a]) => (
            <Reveal key={q} className="mt-9">
              <h3 className="text-[20px] font-medium leading-snug">{q}</h3>
              <p className="mt-2 text-[17px] leading-[1.5]">{a}</p>
            </Reveal>
          ))}
        </section>

        <section className="max-w-[46ch] pb-20">
          <WordsIn text="Which street are you considering?" className={HEAD} />
          <Reveal delay={0.15}>
            <button onClick={() => { document.getElementById("idea")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className={cn(action, "mt-7")}>Test my location</button>
          </Reveal>
        </section>

        <footer className="max-w-[46ch] pb-8 text-[14px] leading-[1.5]">
          <nav className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[16px]">
            <RollLink href="/terms">Terms</RollLink>
            <RollLink href="/privacy">Privacy</RollLink>
            <RollLink href="/refunds">Refunds</RollLink>
            <RollLink href="/methodology">Method</RollLink>
          </nav>
          Map data © OpenStreetMap contributors (ODbL). Population © WorldPop (CC BY 4.0). Income and neighbourhood figures: U.S. Census Bureau ACS 2023, not endorsed or certified by the Census Bureau. Tiles © OpenFreeMap / OpenMapTiles. Forecasts are estimates, not guarantees or financial advice.
        </footer>
      </main>
    </div>
  );
}
