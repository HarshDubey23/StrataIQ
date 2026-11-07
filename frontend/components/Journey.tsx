"use client";

/**
 * Guidance for people who have never done a market study: a five-step journey with the next step always one
 * click away, a short welcome tour, and a plain-language glossary of every term the app uses.
 */
import { BookA, Check, ChevronDown, ChevronRight, Crosshair, Footprints, Map as MapIcon, Mic, Users, X } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/ui";
import type { Project } from "@/lib/types";

const KEY = (id: string) => `siq-visited-${id}`;
function readVisited(id: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY(id)) || "[]");
  } catch {
    return [];
  }
}
function markVisited(id: string, seg: string) {
  try {
    const v = new Set(readVisited(id));
    v.add(seg);
    localStorage.setItem(KEY(id), JSON.stringify([...v]));
  } catch {
    /* storage unavailable: the journey still works, it just forgets */
  }
}

export const GLOSSARY: [string, string][] = [
  ["Catchment", "The area your customers realistically come from — the dashed circle on the map. People outside it are not counted."],
  ["Competitor (observed)", "A real business found in OpenStreetMap or Foursquare near you. Its price is unknown unless you enter it."],
  ["Field-verified", "Collected on the street by a field researcher from your industry: interviews, real competitor prices, footfall, rent. It outranks map data and assumptions."],
  ["Agent", "One simulated person, placed where real people live. Each stands for many residents. Not a real individual."],
  ["615 parameters", "The numbers that describe one agent: budget, travel, free hours, tastes, media habits, loyalty and more."],
  ["In the market", "People who need what you sell right now (today, this month)."],
  ["Awareness", "Share of in-market people who know you exist. Ads, word of mouth and your signboard raise it."],
  ["Willingness to pay", "The highest price a person accepts. Each agent has its own."],
  ["Capacity", "The most you can serve — orders a day, seats, members, slots. Demand above it is turned away."],
  ["Turned away", "People who wanted to buy from you on a day you were already full."],
  ["Variable cost", "What each sale costs you: ingredients, packaging, delivery commission."],
  ["Fixed cost", "Monthly bills you pay even with zero sales: rent, salaries, utilities, marketing."],
  ["Operating profit", "Revenue minus variable and fixed costs, before tax, loan interest and depreciation."],
  ["Break-even", "Sales per month needed so revenue exactly covers costs. Below it you lose money."],
  ["Payback", "Months of profit needed to earn back your startup investment."],
  ["Bad and good month", "In one scenario in ten profit falls below the bad-month figure, and in one in ten it rises above the good-month figure."],
  ["Chance of a loss", "Share of the uncertainty runs where a month ends in a loss."],
  ["Scenario", "One version of your plan (price, costs, capacity, marketing). Make several and compare."],
  ["Baseline", "Your starting plan; everything else is compared against it."],
];

interface Step {
  key: string;
  seg: string;
  label: string;
  hint: string;
  done: boolean;
}

const MORE = [
  { seg: "", label: "Overview" },
  { seg: "/genome", label: "Market DNA" },
  { seg: "/factors", label: "615 factors" },
  { seg: "/monitor", label: "Monitoring" },
];

/** The project's whole navigation: six numbered steps with their progress, the next step, and help. */
export function Journey({ project }: { project: Project }) {
  const path = usePathname() || "";
  const base = `/app/projects/${project.id}`;
  const [visited, setVisited] = useState<string[]>([]);
  const [tour, setTour] = useState(false);
  const [words, setWords] = useState(false);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const seg = path.slice(base.length).replace(/^\//, "") || "overview";
    const tab = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("tab") : null;
    markVisited(project.id, tab === "sites" ? "sites" : seg);
    setVisited(readVisited(project.id));
    setMore(false);
  }, [path, base, project.id]);
  useEffect(() => {
    const h = () => {
      markVisited(project.id, "sites");
      setVisited(readVisited(project.id));
    };
    window.addEventListener("strataiq:sites", h);
    const open = () => setTour(true);
    window.addEventListener("strataiq:tour", open);
    return () => {
      window.removeEventListener("strataiq:sites", h);
      window.removeEventListener("strataiq:tour", open);
    };
  }, [project.id]);
  useEffect(() => {
    let seen = true;
    try {
      seen = !!localStorage.getItem("siq-tour-seen");
    } catch {
      seen = true;
    }
    const welcome = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("welcome") === "1";
    if ((!seen || welcome) && !project.is_demo) setTour(true);
  }, [project.is_demo]);

  const hasData = !!project.snapshots && Object.values(project.snapshots).some(Boolean);
  const base0 = project.scenarios?.find((s) => s.is_baseline);
  const ran = !!base0?.latest_run;
  const explored = (project.scenarios || []).some((s) => s.name.startsWith("Strategy:") || s.name.startsWith("Voice:")) || project.locations.length > 1 || visited.includes("sites") || visited.includes("simulation");
  const steps: Step[] = [
    { key: "market", seg: "/market", label: "Market map", hint: "Real competitors and people around your place", done: hasData },
    { key: "field", seg: "/field", label: "Field data", hint: "A researcher checks the street for what maps miss", done: (project.field?.records ?? 0) > 0 },
    { key: "live", seg: "/live", label: "Live market", hint: "10,000 agents choose you, a rival or nothing", done: ran && visited.includes("live") },
    { key: "lab", seg: "/simulation", label: "Simulation lab", hint: "Try prices, sites and budgets side by side", done: explored },
    { key: "decide", seg: "/decisions", label: "Decisions", hint: "Go / no-go and what could make it wrong", done: visited.includes("decisions") },
    { key: "report", seg: "/report", label: "Report", hint: "Share a feasibility report", done: visited.includes("report") },
  ];
  const next = steps.find((s) => !s.done);
  const doneN = steps.filter((s) => s.done).length;
  const moreActive = MORE.find((m) => (m.seg === "" ? path === base : path.startsWith(base + m.seg)));

  return (
    <>
      <div className="-mx-4 mt-4 flex items-end gap-3 pr-4 md:-mx-8 md:pr-8">
        <nav aria-label="Project steps" className="flex min-w-0 flex-1 items-end gap-px overflow-x-auto pl-4 [scrollbar-width:none] md:pl-8 [&::-webkit-scrollbar]:hidden">
          {steps.map((s, i) => {
            const active = path.startsWith(base + s.seg);
            return (
              <Link key={s.key} href={base + s.seg} title={s.hint} aria-current={active ? "page" : undefined}
                className={cn("relative flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[14px] transition-colors duration-200", active ? "font-medium text-night" : "text-white hover:bg-atlas-deep")}>
                {active && <motion.span layoutId="step-tab" className="absolute inset-0 bg-ink-950" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                {s.done && !active ? <Check className="relative h-3.5 w-3.5" aria-label="Done" /> : <span className="num relative text-[13px]">{i + 1}</span>}
                <span className="relative">{s.label}</span>
                {s.key === "field" && (project.field?.records ?? 0) > 0 && <span className="num relative bg-moss px-1 text-[11px] text-night">{project.field?.records}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1 pb-1.5">
          <div className="relative shrink-0">
            <button onClick={() => setMore((m) => !m)} aria-expanded={more} className="flex items-center gap-1 px-2.5 py-1.5 text-[13px] text-white hover:bg-atlas-deep">
              {moreActive?.label || "More"} <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {more && (
              <div className="panel absolute right-0 top-full z-50 mt-1 w-44">
                {MORE.map((m) => (
                  <Link key={m.label} href={base + m.seg} className="block px-3 py-2 text-[14px] text-night hover:bg-ink-800">{m.label}</Link>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => setTour(true)} className="hidden px-2.5 py-1.5 text-[13px] text-white hover:bg-atlas-deep lg:inline-block">How it works</button>
          <button onClick={() => setWords(true)} className="hidden items-center gap-1 px-2.5 py-1.5 text-[13px] text-white hover:bg-atlas-deep lg:inline-flex"><BookA className="h-3.5 w-3.5" /> Glossary</button>
          {next && (
            <Link href={base + next.seg} title={next.hint} className="group ml-1 inline-flex h-8 items-center gap-1.5 border border-night bg-you px-3 text-[13px] font-semibold text-night transition-colors hover:bg-you-deep">
              Next: {next.label} <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
      {/* portals: the header uses backdrop-filter, which would trap position:fixed dialogs inside it */}
      {tour && createPortal(<Tour onClose={() => { setTour(false); try { localStorage.setItem("siq-tour-seen", "1"); } catch { /* ignore */ } }} base={base} />, document.body)}
      {words && createPortal(<Glossary onClose={() => setWords(false)} />, document.body)}
    </>
  );
}

const SLIDES = [
  { icon: MapIcon, t: "Your real market", d: "We load every real competitor near your place (OpenStreetMap + Foursquare) and how many people live around it (WorldPop). Pink pillars are rivals, the yellow pillar is you, and the dashed circle is where customers come from." },
  { icon: Footprints, t: "Check the street", d: "Maps miss informal shops and real prices. Request a field researcher from your industry: they open a link on their phone, interview people, visit every rival and count footfall. The agents switch to that ground data." },
  { icon: Users, t: "10,000 simulated people decide", d: "Each simulated person has a budget, a way to travel, free hours and tastes. Every day, those who need what you sell pick you, a rival or nothing. That gives your orders, profit and risk." },
  { icon: Crosshair, t: "Try other plans", d: "In the Simulation lab change price, rent, marketing or the site and run again. \"Best sites\" on the map tests your plan at every spot nearby." },
  { icon: Mic, t: "Just ask", d: "Press V and talk: \"how can I grow?\", \"where is the best location?\", \"what is break-even?\". Strata answers from the simulation." },
]

function Tour({ onClose, base }: { onClose: () => void; base: string }) {
  const [i, setI] = useState(0);
  const s = SLIDES[i];
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-atlas/80 p-4" role="dialog" aria-label="How StrataIQ works">
      <div className="panel w-full max-w-lg p-6">
        <div className="flex items-start justify-between">
          <s.icon className="h-7 w-7 text-atlas" />
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-400 hover:text-ink-100"><X className="h-4 w-4" /></button>
        </div>
        <h2 className="font-display mt-4 text-[28px] leading-tight">{s.t}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-300">{s.d}</p>
        <div className="mt-6 flex items-center gap-2">
          {SLIDES.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className={cn("h-2 w-4 border border-night transition-colors", k === i ? "bg-atlas" : "bg-white")} />)}
          <div className="ml-auto flex gap-2">
            {i > 0 && <button onClick={() => setI(i - 1)} className="px-4 py-2 text-sm text-ink-300 hover:text-ink-100">Back</button>}
            {i < SLIDES.length - 1 ? (
              <button onClick={() => setI(i + 1)} className="bg-atlas px-5 py-2 text-sm font-medium text-white hover:bg-atlas-deep">Next</button>
            ) : (
              <Link href={`${base}/market`} onClick={onClose} className="border border-night bg-you px-5 py-2 text-sm font-semibold text-night hover:bg-you-deep">Start with the map</Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Glossary({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const items = GLOSSARY.filter(([k, v]) => !q || (k + v).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[95] flex justify-end bg-atlas/80" role="dialog" aria-label="Words explained" onClick={onClose}>
      <div className="panel h-full w-full max-w-md overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Words explained</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-ink-400 hover:text-ink-100"><X className="h-4 w-4" /></button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a word…" aria-label="Search a word" className="mt-4 h-10 w-full border border-ink-500 bg-white px-3 text-sm" />
        <dl className="mt-4 space-y-4">
          {items.map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-medium text-ink-100">{k}</dt>
              <dd className="mt-0.5 text-[14px] leading-relaxed text-ink-300">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs text-ink-500">Tip: you can also ask Strata — press V and say &quot;what is break-even?&quot;</p>
      </div>
    </div>
  );
}
