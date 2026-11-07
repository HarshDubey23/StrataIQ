"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Chip, CountUp, Magnetic, Marquee, Reveal, RollLink, ScrollBar, ScrollOut, Tilt3D, WordsIn } from "@/components/motion";
import { SiteFooter } from "@/components/SiteFooter";
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
  ["What do I need to start?", "Just your idea and an address. StrataIQ fills in the market data and starting costs, and you can replace any number with your own quotes."],
  ["What makes this different from a demographics report?", "A report tells you who lives nearby. StrataIQ shows what they would do: choose you, choose a rival, or stay home, at your price, on your street."],
  ["How does it reach its numbers?", "Every forecast is a range built from local data and your inputs, with each assumption shown so you can check it and change it."],
  ["Has it been tested on real data?", "Yes. We score its market-size estimates against Census business payroll in up to 1,810 US counties it never trained on. Median error is 26% for grocery and 32% for restaurants, roughly half of what population alone gets for restaurants. Single-store revenue is the next test."],
  ["Where does it work?", "Anywhere in the United States, from a downtown corner to a small-town main street."],
];

const STATS: [number, string][] = [[10000, "simulated customers per test"], [84091, "US neighborhoods profiled"], [84, "days of market played out"]];
const SCENES = ["Your street, in 3D", "Your rivals, live", "Your neighborhood", "Your customers deciding", "Your numbers"];

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

export function useLenis() {
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
export function useStoryProgress() {
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
  const named = comps.map((c) => c.name).filter((n) => n && n !== "Unnamed");
  const catLabel = CATS.find((c) => c.key === cat)?.label.toLowerCase() || "businesses";
  const area = spot.label.split(",")[0];
  const action = "inline-flex min-h-14 items-center justify-center gap-2 bg-accent px-7 text-[18px] font-medium text-white transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 motion-reduce:transform-none";

  return (
    <div className="lp2 bg-paper text-night lg:grid lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
      {/* The fixed half: the real street, changing with the story beside it */}
      <div className="sticky top-0 z-0 order-2 h-[30svh] overflow-hidden bg-night lg:h-svh">
        <HeroMap spot={spot} comps={comps} scene={scene} progress={progress} />
        <ScrollBar />
        <AnimatePresence mode="wait">
          <motion.p key={scene} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }}
            className="pointer-events-none absolute bottom-8 left-5 bg-night px-4 py-2 font-display text-[clamp(1.125rem,0.9rem+1vw,1.75rem)] font-medium tracking-[-0.02em] text-white md:left-8">
            {SCENES[scene] ?? SCENES[0]}
          </motion.p>
        </AnimatePresence>
      </div>

      <main className="relative z-10 order-1 bg-paper px-5 md:px-10 lg:px-14">
        <header className="flex items-center justify-between py-6">
          <Link href="/" className="font-display text-2xl font-medium tracking-tight">StrataIQ</Link>
          <nav className="flex items-center gap-5 text-[16px]">
            <RollLink href="#pricing" className="hidden sm:inline-block">Pricing</RollLink>
            <RollLink href="/methodology" className="hidden sm:inline-block">How it works</RollLink>
            <RollLink href="/sign-in">Sign in</RollLink>
          </nav>
        </header>

        <section data-scene className="max-w-[46ch] pb-20 pt-[3svh] lg:min-h-[calc(100svh-5rem)] lg:pt-[7svh]">
          <WordsIn as="h1" text="See if your location wins before you sign." className="font-display text-[clamp(2.5rem,1.4rem+3vw,4.25rem)] font-medium leading-[0.98] tracking-[-0.035em]" />
          <Reveal delay={0.25}>
            <p className="mt-6 text-[20px] leading-[1.4]">
              StrataIQ puts 10,000 simulated customers on the real streets around your address, then shows your rivals, your break-even and your profit range in minutes.
            </p>
          </Reveal>
          <Reveal delay={0.35}>
            <form className="mt-7" onSubmit={(e) => { e.preventDefault(); void simulate(idea); }}>
              <label htmlFor="idea" className="mb-2 block text-[16px] font-medium">Your business idea</label>
              <input id="idea" aria-label="Your business idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={placeholder}
                className="min-h-14 w-full bg-white px-4 text-[17px] text-night outline-offset-2 transition-shadow placeholder:text-night/55 focus:outline-2 focus:outline-accent" />
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3">
                <Magnetic>
                  <button type="submit" disabled={busy !== null || idea.trim().length < 3} className={action}>
                    {busy === "idea" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Test my location free
                  </button>
                </Magnetic>
                <button type="button" onClick={() => void liveDemo()} disabled={busy !== null} className="min-h-12 text-[17px] underline underline-offset-4 disabled:opacity-60">
                  {busy === "live" ? "Opening…" : `See ${area}`}
                </button>
              </div>
              {goErr && <p role="alert" className="mt-3 text-[16px] text-danger">{goErr}</p>}
            </form>
          </Reveal>
          <Reveal delay={0.45}>
            <dl className="mt-10 grid grid-cols-3 gap-4">
              {STATS.map(([n, label]) => (
                <div key={label}>
                  <dd className="font-display text-[clamp(1.5rem,1rem+1.4vw,2.5rem)] font-medium leading-none tracking-[-0.03em]"><CountUp to={n} /></dd>
                  <dt className="mt-2 text-[14px] leading-snug">{label}</dt>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Your competition, mapped live." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">Pick a neighborhood and a business type. Your rivals load from OpenStreetMap right now, on a real 3D map of the block.</p>
            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="City">
              {SPOTS.map((s) => <Chip key={s.key} group="city" on={s.key === spot.key} tone="bg-night" onClick={() => setSpot(s)}>{s.label.split(",")[0]}</Chip>)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Business type">
              {CATS.map((c) => <Chip key={c.key} group="type" on={c.key === cat} tone="bg-data" onClick={() => setCat(c.key)}>{c.label}</Chip>)}
            </div>
            <div aria-live="polite" className="mt-8 min-h-40">
              {loading ? <p className="flex items-center gap-2 text-[18px]"><Loader2 className="h-4 w-4 animate-spin" /> Scanning {area}…</p>
                : loadErr ? <button onClick={() => void load()} className="text-[18px] underline underline-offset-4">Reload the live count</button>
                : <>
                    <p className="font-display text-[clamp(4rem,3rem+4vw,7rem)] font-medium leading-none tracking-[-0.04em] text-data"><CountUp to={comps.length} /></p>
                    <p className="mt-2 text-[18px]">{catLabel} found around {area}</p>
                    {named.length > 0 && <p className="mt-3 text-[17px]">Including {named.slice(0, 3).join(", ")}.</p>}
                  </>}
            </div>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Know your customers, block by block." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">
              Income, age, households, jobs, students and how people get around, from US Census data for 84,091 neighborhoods. Two streets apart can mean two different markets, and you will see it.
            </p>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Watch 10,000 customers decide." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">
              Each simulated person has an income, a budget, a job, a weekly routine and friends. Day by day they choose you, a rival, or nothing. They remember bad visits, and word of mouth spreads through the neighborhood. Then you see why you won them or lost them.
            </p>
          </Reveal>
        </section>

        <section data-scene className="max-w-[46ch] py-[10svh] lg:py-[14svh]">
          <WordsIn text="Change the plan before it costs you." className={HEAD} />
          <Reveal delay={0.15}>
            <ul className="mt-6 space-y-3 text-[18px] leading-[1.45]">
              <li>Customers a day you need to break even.</li>
              <li>Profit in a bad, normal and good month.</li>
              <li>The price that earns you the most.</li>
              <li>Better spots nearby that your rivals left open.</li>
              <li>The risks to check before you sign.</li>
            </ul>
          </Reveal>
        </section>

        <section className="-mx-5 overflow-hidden bg-white px-5 py-24 md:-mx-10 md:px-10 lg:-mx-14 lg:px-14">
          <WordsIn text="A report built for the decision." className={HEAD} />
          <Reveal delay={0.15}><p className="mt-5 max-w-[46ch] text-[18px] leading-[1.5]">A clean PDF with your verdict, profit range, charts, risks and next steps.</p></Reveal>
          <div className="mt-10">
            <ScrollOut>
              <Tilt3D>
                <Link href="/sample-report" aria-label="Open the sample report">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/product/report.png" alt="The first page of a StrataIQ report for a cafe in Downtown Austin, with the verdict, key numbers and profit charts" width={1440} height={1100} loading="lazy" className="w-full bg-paper" />
                </Link>
              </Tilt3D>
            </ScrollOut>
          </div>
          <RollLink href="/sample-report" className="mt-7 text-[18px] font-medium underline underline-offset-4">Read the sample report</RollLink>
        </section>

        <section className="-mx-5 overflow-hidden bg-paper py-14 md:-mx-10 lg:-mx-14">
          <p className="mb-6 px-5 text-[18px] font-medium md:px-10 lg:px-14">Built on public data</p>
          <Marquee items={["U.S. Census ACS", "Census LODES jobs", "County Business Patterns", "OpenStreetMap", "Foursquare Places", "WorldPop"]} />
        </section>

        <section id="pricing" className="-mx-5 bg-night px-5 py-24 text-white md:-mx-10 md:px-10 lg:-mx-14 lg:px-14">
          <WordsIn text="$29 now, or years on the wrong lease." className={HEAD} />
          <div className="mt-10 grid gap-10 sm:grid-cols-2">
            <Reveal>
              <p className="font-display text-6xl font-medium tracking-[-0.04em]">Free</p>
              <p className="mt-3 text-[18px] leading-[1.45]">Your first look: the live map, your rivals and your break-even point.</p>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="font-display text-6xl font-medium tracking-[-0.04em]">$29</p>
              <p className="mt-3 text-[18px] leading-[1.45]">The full report for one location: profit range, price tests, better spots and your checklist. One payment, no subscription.</p>
              <RollLink href="/sample-report" className="mt-4 text-[18px] font-medium underline underline-offset-4">See a sample report</RollLink>
            </Reveal>
          </div>
        </section>

        <section className="max-w-[46ch] py-24">
          <WordsIn text="Questions founders ask" className={HEAD} />
          {FAQ.map(([q, a]) => (
            <Reveal key={q} className="mt-9">
              <h3 className="text-[20px] font-medium leading-snug">{q}</h3>
              <p className="mt-2 text-[17px] leading-[1.5]">{a}</p>
            </Reveal>
          ))}
        </section>

        <section className="-mx-5 bg-accent px-5 py-20 text-white md:-mx-10 md:px-10 lg:-mx-14 lg:px-14">
          <WordsIn text="Which street are you betting on?" className={HEAD} />
          <Reveal delay={0.15}>
            <button onClick={() => { document.getElementById("idea")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              className="mt-7 inline-flex min-h-14 items-center bg-white px-7 text-[18px] font-medium text-night transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none">Test it free</button>
          </Reveal>
        </section>

        <SiteFooter />
      </main>
    </div>
  );
}
