"use client";

import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Chip, CountUp, FactItem, Magnetic, Marquee, Reveal, RollLink, ScrollBar, ScrollOut, Tilt3D, WordsIn, type Fact } from "@/components/motion";
import { AtlasKey, Logo } from "@/components/brand";
import { SiteFooter } from "@/components/SiteFooter";
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

const HEAD = "font-display text-[clamp(2.5rem,1.6rem+2.8vw,4.25rem)] leading-[1.02]";
const SHEET = "sheet relative mx-5 my-[42svh] max-w-xl p-7 md:mx-10 md:p-10";

const FAQ: [string, string][] = [
  ["What do I need to start?", "Just your idea and an address. StrataIQ fills in the market data and starting costs, and you can replace any number with your own quotes."],
  ["What makes this different from a demographics report?", "A report tells you who lives nearby. StrataIQ shows what they would do: choose you, choose a rival, or stay home, at your price, on your street."],
  ["How does it reach its numbers?", "Every forecast is a range built from local data and your inputs, with each assumption shown so you can check it and change it."],
  ["Has it been tested on real data?", "Yes. We score its market-size estimates against Census business payroll in up to 1,810 US counties it never trained on. Median error is 26% for grocery and 32% for restaurants, roughly half of what population alone gets for restaurants. Single-store sales are harder: in a test against 5,546 Texas bars and restaurants, location data explained under 3% of the difference between venues, because concept and operator matter far more. So use a forecast to test your plan, not as a promise."],
  ["Where does it work?", "Anywhere in the United States, from a downtown corner to a small-town main street."],
];

const PLAN: Fact[] = [
  { label: "Customers a day to break even", detail: "The exact number of sales or members you need each month to cover rent, staff and running costs, next to what the model forecasts for your street." },
  { label: "Profit in a bad, normal and good month", detail: "A range across 800 market scenarios, including how often you would lose money, so you see the downside before you commit." },
  { label: "The price that earns you the most", detail: "Sales and profit at every price point, using the incomes of the people who actually live and work around your address." },
  { label: "Better spots nearby", detail: "We test other points around your address and show where the same plan performs better, and which rivals it avoids." },
  { label: "The risks to check before you sign", detail: "The assumptions that move your profit most, in order, so you know exactly which quotes to get and what to check on the street." },
];

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
  const action = "inline-flex min-h-14 w-full items-center justify-center gap-2 whitespace-nowrap border border-night bg-you px-6 text-[18px] font-semibold text-night transition-colors duration-150 hover:bg-you-deep disabled:opacity-60";
  const sheetNo = (n: number) => <p className="absolute right-4 top-3 font-display text-[14px] font-medium">Sheet {n} of 5</p>;

  return (
    <div className="relative text-night">
      {/* The whole page sits on one live atlas sheet of the real street */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-atlas">
        <HeroMap spot={spot} comps={comps} scene={scene} progress={progress} />
        <div className="absolute inset-x-0 top-16"><ScrollBar /></div>
        <div className="sheet pointer-events-none absolute bottom-10 right-5 hidden w-56 p-3 md:right-10 md:block">
          <AnimatePresence mode="wait">
            <motion.p key={scene} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25 }} className="mb-2.5 font-display text-[19px] leading-tight">
              {SCENES[scene] ?? SCENES[0]}
            </motion.p>
          </AnimatePresence>
          <AtlasKey />
        </div>
      </div>

      <main className="relative z-10">
        <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between bg-atlas px-5 text-white md:px-10">
          <Logo tone="dark" />
          <nav className="flex items-center gap-5 text-[16px]">
            <RollLink href="#pricing" className="hidden sm:inline-block">Pricing</RollLink>
            <RollLink href="/methodology" className="hidden sm:inline-block">How it works</RollLink>
            <RollLink href="/sign-in">Sign in</RollLink>
          </nav>
        </header>

        <section data-scene className="flex min-h-svh items-end px-5 pb-5 pt-20 md:px-10">
          <div className="sheet relative w-full max-w-[42rem] p-6 md:p-9">
            {sheetNo(1)}
            <WordsIn as="h1" text="Know your numbers before you sign the lease." className="font-display pr-14 text-[clamp(2.5rem,1.6rem+3.2vw,4.75rem)] leading-[1]" />
            <Reveal delay={0.25}>
              <p className="mt-5 text-[18px] leading-[1.4]">StrataIQ puts 10,000 simulated customers on the real streets around your address, then shows your rivals, your break-even and your profit range in minutes.</p>
            </Reveal>
            <Reveal delay={0.35}>
              <form className="mt-6" onSubmit={(e) => { e.preventDefault(); if (idea.trim().length < 3) document.getElementById("idea")?.focus(); else void simulate(idea); }}>
                <label htmlFor="idea" className="mb-1.5 block text-[14px] font-semibold">Your business and where</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id="idea" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder={placeholder}
                    className="min-h-14 min-w-0 flex-1 border border-night bg-white px-4 text-[18px] text-night placeholder:text-ink-400 focus:outline-2 focus:outline-atlas" />
                  <Magnetic>
                    <button type="submit" disabled={busy !== null} className={action}>
                      {busy === "idea" ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Test my location free
                    </button>
                  </Magnetic>
                </div>
                {goErr && <p role="alert" className="mt-3 text-[16px] text-danger">{goErr}</p>}
              </form>
            </Reveal>
            <Reveal delay={0.45}>
              <button type="button" onClick={() => void liveDemo()} disabled={busy !== null} className="mt-4 min-h-11 text-[17px] font-medium underline underline-offset-4 disabled:opacity-60">
                {busy === "live" ? "Opening…" : `Or watch it run in ${area}`}
              </button>
            </Reveal>
          </div>
        </section>

        <section data-scene className={`${SHEET} md:ml-auto`}>
          {sheetNo(2)}
          <WordsIn text="Your competition, mapped live." className={`${HEAD} pr-14`} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">Pick a neighborhood and a business type. Your rivals load from OpenStreetMap right now and rise in pink on a real 3D map of the block.</p>
            <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="City">
              {SPOTS.map((s) => <Chip key={s.key} group="city" on={s.key === spot.key} tone="bg-atlas" onClick={() => setSpot(s)}>{s.label.split(",")[0]}</Chip>)}
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Business type">
              {CATS.map((c) => <Chip key={c.key} group="type" on={c.key === cat} tone="bg-atlas" onClick={() => setCat(c.key)}>{c.label}</Chip>)}
            </div>
            <div aria-live="polite" className="mt-8 min-h-40">
              {loading ? <p className="flex items-center gap-2 text-[18px]"><Loader2 className="h-4 w-4 animate-spin" /> Scanning {area}…</p>
                : loadErr ? <button onClick={() => void load()} className="text-[18px] underline underline-offset-4">Reload the live count</button>
                : <>
                    <p className="font-display inline-block bg-brick px-3 text-[clamp(4rem,3rem+4vw,6rem)] leading-[1.05]"><CountUp to={comps.length} /></p>
                    <p className="mt-2 text-[18px]">{catLabel} found around {area}</p>
                    {named.length > 0 && <p className="mt-3 text-[17px]">Including {named.slice(0, 3).join(", ")}.</p>}
                  </>}
            </div>
          </Reveal>
        </section>

        <section data-scene className={SHEET}>
          {sheetNo(3)}
          <WordsIn text="Know your customers, block by block." className={`${HEAD} pr-14`} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">Income, age, households, jobs, students and how people get around, from US Census data for 84,091 neighborhoods. Two streets apart can mean two different markets, and you will see it.</p>
          </Reveal>
        </section>

        <section data-scene className={`${SHEET} md:ml-auto`}>
          {sheetNo(4)}
          <WordsIn text="Watch 10,000 customers decide." className={`${HEAD} pr-14`} />
          <Reveal delay={0.15}>
            <p className="mt-6 text-[18px] leading-[1.5]">Each simulated person has an income, a budget, a job, a weekly routine and friends. For 84 days they choose you, a rival, or nothing. They remember bad visits, and word of mouth spreads through the neighborhood. Then you see why you won them or lost them.</p>
            <ul className="mt-6 space-y-2 text-[16px]">
              <li className="flex items-center gap-2.5"><span aria-hidden className="h-3 w-3 rounded-full border border-night bg-you" /> Chose you</li>
              <li className="flex items-center gap-2.5"><span aria-hidden className="h-3 w-3 rounded-full border border-night bg-brick" /> Chose a rival</li>
              <li className="flex items-center gap-2.5"><span aria-hidden className="h-3 w-3 rounded-full border border-night bg-stone" /> Stayed home</li>
            </ul>
          </Reveal>
        </section>

        <section data-scene className={SHEET}>
          {sheetNo(5)}
          <WordsIn text="Change the plan before it costs you." className={`${HEAD} pr-14`} />
          <Reveal delay={0.15}>
            <ul className="mt-6 space-y-2">{PLAN.map((f) => <FactItem key={f.label} fact={f} />)}</ul>
          </Reveal>
        </section>

        <section className="relative overflow-hidden border-t border-night bg-atlas px-5 py-24 text-white md:px-10 lg:px-14">
          <div className="mx-auto max-w-6xl">
            <WordsIn text="A report built for the decision." className={HEAD} />
            <Reveal delay={0.15}><p className="mt-5 max-w-[46ch] text-[18px] leading-[1.5]">A clean PDF with your verdict, profit range, charts, risks and next steps, every number marked measured, yours or estimated.</p></Reveal>
            <div className="mt-10">
              <ScrollOut>
                <Tilt3D>
                  <Link href="/sample-report" aria-label="Open the sample report">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/product/report.png" alt="The first page of a StrataIQ report for a gym in South Austin, with the verdict, key numbers and charts" width={1440} height={1100} loading="lazy" className="w-full border border-night bg-paper" />
                  </Link>
                </Tilt3D>
              </ScrollOut>
            </div>
            <RollLink href="/sample-report" className="mt-7 text-[18px] font-medium underline underline-offset-4">Read the sample report</RollLink>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-night bg-paper py-14">
          <p className="mb-6 px-5 text-[18px] font-semibold md:px-10 lg:px-14">Built on public data</p>
          <Marquee items={["U.S. Census ACS", "Census LODES jobs", "County Business Patterns", "OpenStreetMap", "Foursquare Places", "WorldPop"]} />
        </section>

        <section id="pricing" className="relative border-t border-night bg-atlas px-5 py-24 text-white md:px-10 lg:px-14">
          <div className="mx-auto max-w-6xl">
            <WordsIn text="$29 now, or years on the wrong lease." className={HEAD} />
            <div className="mt-10 grid gap-10 sm:grid-cols-2">
              <Reveal>
                <p className="font-display text-[5rem] leading-none">Free</p>
                <p className="mt-3 max-w-[40ch] text-[18px] leading-[1.45]">Your first look: the live map, your rivals and your break-even point.</p>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="font-display text-[5rem] leading-none text-you">$29</p>
                <p className="mt-3 max-w-[40ch] text-[18px] leading-[1.45]">The full report for one location: profit range, price tests, better spots and your checklist. One payment, no subscription.</p>
                <RollLink href="/sample-report" className="mt-4 text-[18px] font-medium underline underline-offset-4">See a sample report</RollLink>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="relative border-t border-night bg-paper px-5 py-24 md:px-10 lg:px-14">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.5fr]">
            <WordsIn text="Questions founders ask" className={HEAD} />
            <div>
              {FAQ.map(([q, a]) => (
                <Reveal key={q} className="border-t border-night py-6">
                  <h3 className="text-[20px] font-semibold leading-snug">{q}</h3>
                  <p className="mt-2 max-w-[62ch] text-[17px] leading-[1.5]">{a}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="relative border-t border-night bg-you px-5 py-24 text-night md:px-10 lg:px-14">
          <div className="mx-auto max-w-6xl">
            <WordsIn text="Which street are you betting on?" className={HEAD} />
            <Reveal delay={0.15}>
              <button onClick={() => { document.getElementById("idea")?.focus(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="mt-7 inline-flex min-h-14 items-center bg-night px-7 text-[18px] font-semibold text-white transition-colors hover:bg-atlas">Test it free</button>
            </Reveal>
          </div>
        </section>

        <div className="relative border-t border-night bg-paper px-5 md:px-10 lg:px-14"><div className="mx-auto max-w-6xl"><SiteFooter /></div></div>
      </main>
    </div>
  );
}
