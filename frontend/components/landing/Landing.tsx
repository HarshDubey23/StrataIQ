"use client";

import { ArrowDown, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { CountUp, FactItem, Magnetic, Marquee, Reveal, RollLink, ScrollBar, ScrollOut, Stamp, Tilt3D, WipeSection, WordsIn, type Fact } from "@/components/motion";
import { AtlasKey, BlockPlan, Logo, LogoMark } from "@/components/brand";
import { SiteFooter } from "@/components/SiteFooter";
import { SPOTS, type PreviewComp, type Spot } from "./spots";
import type { Tract } from "./HeroMap";
import { money, num, US_MARKET } from "@/lib/format";

const HeroMap = dynamic(() => import("./HeroMap"), { ssr: false, loading: () => null });

const CATS = [
  { key: "gym", label: "gym", many: "gyms" },
  { key: "cafe", label: "café", many: "cafés" },
  { key: "restaurant", label: "restaurant", many: "restaurants" },
  { key: "pizza", label: "pizza shop", many: "pizza shops" },
  { key: "salon", label: "salon", many: "salons" },
  { key: "pharmacy", label: "pharmacy", many: "pharmacies" },
  { key: "grocery", label: "grocery", many: "groceries" },
  { key: "clothing", label: "clothing store", many: "clothing stores" },
];

const HEAD = "font-display text-[clamp(2.5rem,1.6rem+2.8vw,4.25rem)] leading-[1.02]";
const BIG = "text-[clamp(3rem,1.5rem+6vw,7rem)]";
const SHEETS = ["Your address", "Your rivals", "Your neighborhood", "Your customers", "Your numbers"];

const FAQ: [string, string][] = [
  ["What do I need to start?", "Just your idea and an address. StrataIQ fills in the market data and starting costs, and you can replace any number with your own quotes."],
  ["What makes this different from a demographics report?", "A report tells you who lives nearby. StrataIQ shows what they would do: choose you, choose a rival, or stay home, at your price, on your street."],
  ["How does it reach its numbers?", "Every forecast is a range built from local data and your inputs, with each assumption shown so you can check it and change it."],
  ["Has it been tested on real data?", "Yes. We score its market-size estimates against Census business payroll in up to 1,810 US counties it never trained on. Median error is 26% for grocery and 32% for restaurants, roughly half of what population alone gets for restaurants. Single-store sales are harder: in a test against 5,546 Texas bars and restaurants, location data explained under 3% of the difference between venues, because concept and operator matter far more. So use a forecast to test your plan, not as a promise."],
  ["Where does it work?", "Anywhere in the United States, from a downtown corner to a small-town main street."],
];

const PLAN: Fact[] = [
  { label: "Customers you need to break even", detail: "The exact number of sales or members you need each month to cover rent, staff and running costs, next to what the model forecasts for your street." },
  { label: "Profit in a bad, normal and good month", detail: "A range across 800 market scenarios, including how often you would lose money, so you see the downside before you commit." },
  { label: "The price that earns you the most", detail: "Sales and profit at every price point, using the incomes of the people who actually live and work around your address." },
  { label: "Better spots nearby", detail: "We test other points around your address and show where the same plan performs better, and which rivals it avoids." },
  { label: "Your walk-away rent and counteroffer", detail: "Enter the landlord's offer. See the rent your plan can carry, what you would personally owe if the business closed, and get a counteroffer letter ready to send." },
  { label: "The risks to check before you sign", detail: "The assumptions that move your profit most, in order, so you know exactly which quotes to get and what to check on the street." },
];

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

/** The opening: one block is drawn, then the sheet lifts off the real city. Once a session, never with reduced motion. */
function Opening({ first }: { first: boolean }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (!first || reduced()) return setOn(false);
    try {
      sessionStorage.setItem("siq-intro", "1");
    } catch {
      /* storage blocked: the opening just plays again */
    }
    const t = setTimeout(() => setOn(false), 1150);
    return () => clearTimeout(t);
  }, [first]);
  return (
    <AnimatePresence>
      {on && (
        <motion.div aria-hidden exit={{ clipPath: "inset(0 0 100% 0)" }} initial={{ clipPath: "inset(0 0 0% 0)" }} transition={{ duration: 0.85, ease: [0.76, 0, 0.24, 1] }}
          className="curtain pointer-events-none fixed inset-0 z-50 flex items-center justify-center gap-5 bg-atlas text-white">
          <LogoMark size={84} tone="dark" draw /><span className="font-display text-[64px] leading-none">StrataIQ</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DrawnBlock() {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, margin: "-20% 0px" });
  return <div ref={ref} aria-hidden className="absolute inset-y-0 right-0 hidden w-[46%] overflow-hidden border-l border-night bg-atlas md:block">{seen && <BlockPlan seed={31} draw className="h-full w-full" />}</div>;
}

interface Peek {
  place: { label: string; lat: number; lng: number };
  area: { people: number; median_household_income: number; jobs: number; tracts: Tract[]; radius_miles: number; source: string };
  typical: { price: number; unit: string; per_day: boolean; variable_cost_ratio: number; rent: number; payroll: number; utilities: number; other_fixed: number; marketing_spend: number };
}
interface Preview {
  spot: { lat: number; lng: number };
  competitors: PreviewComp[];
  source: { name: string };
}

/** Lines of type printed on the map as labels: the city stays visible and every word stays readable. */
function Strips({ lines, as: Tag = "h2", className, tone = "bg-paper text-night", delay = 0, label }: { lines: ReactNode[]; as?: "h1" | "h2" | "p"; className?: string; tone?: string; delay?: number; label?: string }) {
  const still = useReducedMotion();
  return (
    <Tag className={`font-display leading-[1.12] ${className ?? ""}`} aria-label={label}>
      {lines.map((l, i) => (
        <motion.span key={i} className={`strip -mt-px block w-fit border border-night px-[0.2em] pb-[0.06em] ${tone}`}
          initial={still ? false : { clipPath: "inset(0 100% 0 0)" }} animate={{ clipPath: "inset(0 0% 0 0)" }} exit={still ? undefined : { clipPath: "inset(0 0 0 100%)", transition: { duration: 0.28, ease: [0.76, 0, 0.24, 1] } }}
          transition={{ duration: 0.6, delay: delay + i * 0.09, ease: [0.76, 0, 0.24, 1] }}>
          {l}
        </motion.span>
      ))}
    </Tag>
  );
}

function Note({ children, delay = 0.4 }: { children: ReactNode; delay?: number }) {
  return <Strips as="p" lines={[children]} delay={delay} className="mt-2 max-w-[46ch] !font-sans text-[14px] !leading-snug" />;
}

/** The day counter is the scroll itself: nothing moves unless you move it. */
function DayCounter({ progress }: { progress: MutableRefObject<number> }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const day = 1 + Math.round(Math.max(0, Math.min(1, progress.current - 2.6)) * 83);
      if (ref.current) ref.current.textContent = String(day);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [progress]);
  return <span ref={ref} className="num">1</span>;
}

export default function Landing() {
  const [first] = useState(() => {
    try {
      return typeof window !== "undefined" && !sessionStorage.getItem("siq-intro") && !reduced();
    } catch {
      return false;
    }
  });
  const lift = first ? 1.15 : 0;
  const router = useRouter();
  const [spot, setSpot] = useState<Spot>(SPOTS[0]);
  const [cat, setCat] = useState("gym");
  const [address, setAddress] = useState("");
  const [peek, setPeek] = useState<Peek | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [findErr, setFindErr] = useState<string | null>(null);
  const [goErr, setGoErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rent, setRent] = useState<number | null>(null);
  const [inStory, setInStory] = useState(true);
  const storyEnd = useRef<HTMLDivElement>(null);
  const { progress, scene } = useStoryProgress();
  useLenis();

  // everything here comes from the API: Census figures first because they are instant, then live rivals
  const load = useCallback(async () => {
    setLoading(true);
    setPreview(null);
    setRent(null);
    const at = `lat=${spot.lat}&lng=${spot.lng}&category=${cat}`;
    fetch(`/api/v1/market/peek?${at}&label=${encodeURIComponent(spot.label)}`).then((r) => (r.ok ? r.json() : null)).then(setPeek).catch(() => setPeek(null));
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 60_000);
    try {
      const r = await fetch(`/api/v1/market/preview?${at}`, { signal: ctl.signal });
      setPreview(r.ok ? await r.json() : null);
    } catch {
      setPreview(null);
    } finally {
      clearTimeout(to);
      setLoading(false);
    }
  }, [spot, cat]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const on = () => {
      const b = storyEnd.current?.getBoundingClientRect().bottom ?? 1;
      setInStory(b > window.innerHeight * 0.55);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  const goTo = (i: number) => document.querySelectorAll("[data-scene]")[i]?.scrollIntoView({ behavior: "smooth", block: "center" });

  async function find(e: React.FormEvent) {
    e.preventDefault();
    const q = address.trim();
    if (q.length < 3) return document.getElementById("address")?.focus();
    setFinding(true);
    setFindErr(null);
    try {
      const r = await fetch(`/api/v1/market/peek?q=${encodeURIComponent(q)}&category=${cat}`);
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : j.error?.message || "We could not find that address.");
      setSpot({ key: `${j.place.lat},${j.place.lng}`, label: j.place.label, lat: j.place.lat, lng: j.place.lng });
      setTimeout(() => goTo(1), 500);
    } catch (err) {
      setFindErr(err instanceof Error ? err.message : "We could not find that address.");
    } finally {
      setFinding(false);
    }
  }

  async function runReal() {
    setBusy(true);
    setGoErr(null);
    try {
      await ensureSession();
      const place = spot.label.split(",").slice(0, 3).join(",");
      const c = CATS.find((x) => x.key === cat)!;
      router.push(`/app?idea=${encodeURIComponent(`A ${c.label} at ${place}`)}`);
    } catch (e) {
      setGoErr(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  const c = CATS.find((x) => x.key === cat)!;
  const comps = preview?.spot && Math.abs(preview.spot.lat - spot.lat) < 1e-6 ? preview.competitors : [];
  const named = comps.map((x) => x.name).filter((n) => n && n !== "Unnamed");
  const area = spot.label.split(",")[0];
  const a = peek?.area;
  const t = peek?.typical;
  const rentNow = rent ?? t?.rent ?? 0;
  const fixed = t ? rentNow + t.payroll + t.utilities + t.other_fixed + t.marketing_spend : 0;
  const breakEven = t ? fixed / (t.price * (1 - t.variable_cost_ratio)) : 0;
  const needed = t ? Math.ceil(t.per_day ? breakEven / 30 : breakEven) : 0;
  const oneIn = a && breakEven > 0 ? Math.round(a.people / breakEven) : null;

  return (
    <div className="relative overflow-x-clip text-night">
      <Opening first={first} />
      {/* The one continuous shot: the real street stays under the whole story */}
      <div className="fixed inset-0 z-0 overflow-hidden bg-atlas">
        <HeroMap spot={spot} comps={comps} tracts={a?.tracts ?? []} scene={scene} progress={progress} crosshair />
        <div className="absolute inset-x-0 top-16 z-10"><ScrollBar /></div>
      </div>

      <AnimatePresence>
        {inStory && (
          <motion.div key="story" initial={false} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="pointer-events-none fixed inset-0 z-20">
            {/* the printed key and the sheet index stay in one place for the whole shot */}
            <div className="sheet pointer-events-auto absolute bottom-9 right-5 hidden w-52 p-3 md:right-8 md:block">
              <AtlasKey on={[undefined, "Measured", "Measured", "Estimated", "Yours"][scene]} />
            </div>
            <nav aria-label="Story" className="pointer-events-auto absolute right-5 top-1/2 hidden -translate-y-1/2 flex-col items-end gap-1 md:right-8 md:flex">
              {SHEETS.map((l, i) => (
                <button key={l} onClick={() => goTo(i)} aria-current={scene === i ? "step" : undefined} className={`group flex items-center gap-2 border border-night px-2 py-1 text-[13px] font-medium transition-colors duration-200 ${scene === i ? "bg-you text-night" : "bg-paper text-night hover:bg-white"}`}>
                  <span className="num">{i + 1}</span>
                  <span className={scene === i ? "" : "hidden group-hover:inline"}>{l}</span>
                </button>
              ))}
            </nav>

            <div className="absolute inset-x-0 bottom-0 px-4 pb-5 md:bottom-auto md:top-24 md:px-10">
              <AnimatePresence mode="wait">
                {scene === 0 && (
                  <motion.div key="s0" exit={{ opacity: 1 }} transition={{ duration: 0.28 }} className="pointer-events-auto">
                    <Strips as="h1" delay={lift} label="Know your numbers before you sign the lease." lines={["Know your", "numbers before", "you sign the lease."]} className={BIG} />
                    <motion.form initial={reduced() ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: lift + 0.5, ease: [0.16, 1, 0.3, 1] }} onSubmit={find}
                      className="sheet mt-4 flex max-w-[52rem] flex-col gap-2 p-3 md:flex-row md:items-center">
                      <div className="flex items-center gap-2 font-display text-[22px]">
                        <label htmlFor="category" className="whitespace-nowrap">I&apos;m opening a</label>
                        <select id="category" value={cat} onChange={(e) => setCat(e.target.value)} className="min-h-12 border-b-2 border-night bg-transparent font-display text-[22px] font-semibold">
                          {CATS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                        </select>
                        <span>at</span>
                      </div>
                      <label htmlFor="address" className="sr-only">Street address, city and state</label>
                      <input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="1402 South Lamar, Austin, TX" autoComplete="street-address"
                        className="min-h-12 min-w-0 flex-1 border-b-2 border-night bg-transparent px-1 text-[18px] placeholder:text-ink-400 focus:outline-2 focus:outline-atlas" />
                      <Magnetic>
                        <button type="submit" disabled={finding} className="inline-flex min-h-12 w-full items-center justify-center gap-2 whitespace-nowrap border border-night bg-you px-5 text-[17px] font-semibold text-night transition-colors hover:bg-you-deep active:translate-y-px disabled:opacity-60">
                          {finding && <Loader2 className="h-4 w-4 animate-spin" />} See this street
                        </button>
                      </Magnetic>
                    </motion.form>
                    {findErr && <p role="alert" className="sheet mt-1 w-fit px-3 py-1.5 text-[15px] text-danger">{findErr}</p>}
                    <motion.button initial={reduced() ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: lift + 0.8 }} onClick={() => goTo(1)}
                      className="sheet mt-2 inline-flex min-h-10 items-center gap-2 px-3 text-[15px] font-medium hover:bg-white">
                      <ArrowDown className="h-4 w-4" /> Or scroll, and see {area} first
                    </motion.button>
                  </motion.div>
                )}
                {scene === 1 && (
                  <motion.div key="s1" exit={{ opacity: 1 }} transition={{ duration: 0.28 }}>
                    {loading && !comps.length ? (
                      <Strips lines={[<span key="l" className="inline-flex items-center gap-3"><Loader2 className="h-8 w-8 animate-spin" /> Finding rivals</span>, `around ${area}`]} className={BIG} />
                    ) : comps.length ? (
                      <Strips label={`${comps.length} ${c.many} already around ${area}.`} lines={[<span key="n" className="num"><CountUp to={comps.length} /></span>, `${comps.length === 1 ? c.label : c.many} already`, `around ${area}.`]} className={BIG} tone="bg-paper text-night" />
                    ) : (
                      <Strips lines={[`Rival data is`, `busy right now.`]} className={BIG} />
                    )}
                    {named.length > 0 && <Note>Including {named.slice(0, 3).join(", ")}. {preview?.source.name ? `Live from ${preview.source.name}.` : ""}</Note>}
                    <div className="pointer-events-auto mt-2 flex flex-wrap gap-1">
                      {SPOTS.map((s) => <button key={s.key} onClick={() => setSpot(s)} aria-pressed={s.lat === spot.lat} className={`min-h-10 border border-night px-3 text-[14px] font-medium transition-colors ${s.lat === spot.lat ? "bg-atlas text-white" : "bg-paper text-night hover:bg-white"}`}>{s.label.split(",")[0]}</button>)}
                    </div>
                  </motion.div>
                )}
                {scene === 2 && (
                  <motion.div key="s2" exit={{ opacity: 1 }} transition={{ duration: 0.28 }}>
                    {a ? (
                      <>
                        <Strips label={`${num(a.people)} people live within 2 miles.`} lines={[<span key="p" className="num"><CountUp to={a.people} /></span>, "people within 2 miles"]} className={BIG} />
                        <div className="mt-3 grid max-w-xl grid-cols-2 gap-2">
                          <Strips as="p" delay={0.25} lines={[<span key="i" className="num">{money(a.median_household_income, { compact: true })}</span>, <span key="il" className="block font-sans text-[15px] font-medium leading-[1.5]">median household income</span>]} className="text-[clamp(2rem,1.2rem+2.4vw,3.5rem)]" />
                          <Strips as="p" delay={0.35} lines={[<span key="j" className="num">{num(a.jobs)}</span>, <span key="jl" className="block font-sans text-[15px] font-medium leading-[1.5]">jobs located here</span>]} className="text-[clamp(2rem,1.2rem+2.4vw,3.5rem)]" />
                        </div>
                        <Note delay={0.55}>Each pink column is a real Census tract, as tall as its population. {a.source}.</Note>
                      </>
                    ) : <Strips lines={["Reading the", "Census…"]} className={BIG} />}
                  </motion.div>
                )}
                {scene === 3 && (
                  <motion.div key="s3" exit={{ opacity: 1 }} transition={{ duration: 0.28 }}>
                    <Strips label="Watch 10,000 customers decide." lines={[<span key="d">Day <DayCounter progress={progress} /> of 84</span>, "10,000 customers", "decide."]} className={BIG} />
                    <Strips as="p" delay={0.3} className="mt-2 !font-sans text-[15px]" lines={[
                      <span key="k" className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1">
                        <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-full border border-night bg-you" /> Chose you</span>
                        <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-full border border-night bg-white" /> Chose a rival</span>
                        <span className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-3 rounded-full border border-night bg-stone" /> Stayed home</span>
                      </span>,
                    ]} />
                    <Note delay={0.5}>Keep scrolling to move through the days. This is a drawing of how it works: people sit on real streets in real Census numbers, but these choices are illustrative. Your test runs the full simulation.</Note>
                  </motion.div>
                )}
                {scene === 4 && (
                  <motion.div key="s4" exit={{ opacity: 1 }} transition={{ duration: 0.28 }} className="pointer-events-auto">
                    {t ? (
                      <>
                        <Strips label={`You need ${num(needed)} ${t.unit}.`} lines={["You need", <span key="n" className="num bg-you px-[0.15em]">{num(needed)}</span>, t.per_day ? `${t.unit} a day` : t.unit]} className={BIG} />
                        <div className="sheet mt-3 max-w-xl p-4">
                          <label htmlFor="rent" className="flex items-baseline justify-between text-[15px] font-semibold">Drag the rent <span className="num font-display text-[28px]">{money(rentNow)}<span className="font-sans text-[14px] font-normal"> a month</span></span></label>
                          <input id="rent" type="range" min={Math.round(t.rent * 0.4)} max={Math.round(t.rent * 2.5)} step={100} value={rentNow} onChange={(e) => setRent(Number(e.target.value))} className="mt-2 h-8 w-full" />
                          <p className="mt-1 text-[14px] leading-snug">
                            {!t.per_day && oneIn ? <>That is about 1 in every {num(oneIn)} people within 2 miles. </> : null}
                            At {money(t.price)} each with typical {c.label} costs of {money(fixed - rentNow)} a month besides rent. <span className="inline-block border border-night bg-stone px-1 text-[12px] font-medium">Estimated</span>
                          </p>
                          <button onClick={() => void runReal()} disabled={busy} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 border border-night bg-you px-5 text-[17px] font-semibold transition-colors hover:bg-you-deep active:translate-y-px disabled:opacity-60">
                            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Test it with my real numbers
                          </button>
                          {goErr && <p role="alert" className="mt-2 text-[15px] text-danger">{goErr}</p>}
                        </div>
                      </>
                    ) : <Strips lines={["Adding up", "your costs…"]} className={BIG} />}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="relative z-10">
        <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between bg-atlas px-5 text-white md:px-10">
          <Logo tone="dark" />
          <nav className="flex items-center gap-5 text-[16px]">
            <RollLink href="#pricing" className="max-sm:!hidden">Pricing</RollLink>
            <RollLink href="/methodology" className="max-sm:!hidden">How it works</RollLink>
            <RollLink href="/sign-in">Sign in</RollLink>
          </nav>
        </header>

        {/* the story has no boxes of its own: these only give the scroll its length */}
        <div ref={storyEnd}>
          <section data-scene className="h-svh" aria-hidden />
          {SHEETS.slice(1).map((l) => <section key={l} data-scene className="h-[135svh]" aria-hidden />)}
        </div>

        <WipeSection className="relative overflow-hidden border-t border-night bg-atlas px-5 py-24 text-white md:px-10 lg:px-14">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-center">
            <div>
              <WordsIn text="A report built for the decision." className={HEAD} />
              <Reveal delay={0.15}><p className="mt-5 text-[18px] leading-[1.5]">A clean PDF with your verdict, profit range, charts and next steps.</p></Reveal>
              <ul className="mt-6 space-y-2">{PLAN.map((x) => <FactItem key={x.label} fact={x} />)}</ul>
              <RollLink href="/sample-report" className="mt-6 border-b border-current text-[18px] font-medium">Read the sample report</RollLink>
            </div>
            <ScrollOut>
              <Tilt3D>
                <Link href="/sample-report" aria-label="Open the sample report">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/product/report.png" alt="The first page of a StrataIQ report for a gym in South Austin, with the verdict, key numbers and charts" width={1440} height={1100} loading="lazy" className="w-full border border-night bg-paper" />
                </Link>
              </Tilt3D>
            </ScrollOut>
          </div>
        </WipeSection>

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
                <button onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); document.getElementById("address")?.focus(); }} className="mt-4 border-b border-current text-[18px] font-medium">Start with an address</button>
              </Reveal>
              <Reveal delay={0.1}>
                <Stamp className="font-display text-[5rem] leading-none text-you">$29</Stamp>
                <p className="mt-3 max-w-[40ch] text-[18px] leading-[1.45]">The full report for one location: profit range, price tests, your walk-away rent, a counteroffer letter and your checklist. One payment, no subscription.</p>
                <RollLink href="/sample-report" className="mt-4 border-b border-current text-[18px] font-medium">See a sample report</RollLink>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="relative border-t border-night bg-paper px-5 py-24 md:px-10 lg:px-14">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.5fr]">
            <WordsIn text="Questions founders ask" className={HEAD} />
            <div>
              {FAQ.map(([q, ans]) => (
                <Reveal key={q} className="border-t border-night py-6">
                  <h3 className="text-[20px] font-semibold leading-snug">{q}</h3>
                  <p className="mt-2 max-w-[62ch] text-[17px] leading-[1.5]">{ans}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <WipeSection className="relative overflow-hidden border-t border-night bg-you px-5 py-28 text-night md:px-10 lg:px-14">
          <DrawnBlock />
          <div className="relative md:max-w-[46%]">
            <WordsIn text="Which street are you betting on?" className={HEAD} />
            <Reveal delay={0.15}>
              <button onClick={() => { window.scrollTo({ top: 0, behavior: "smooth" }); document.getElementById("address")?.focus(); }}
                className="mt-7 inline-flex min-h-14 items-center bg-night px-7 text-[18px] font-semibold text-white transition-colors hover:bg-atlas active:translate-y-px">Test it free</button>
            </Reveal>
          </div>
        </WipeSection>

        <div className="relative border-t border-night bg-paper px-5 md:px-10 lg:px-14"><div className="mx-auto max-w-6xl"><SiteFooter /></div></div>
      </main>
    </div>
  );
}
