"use client";

import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Marquee, Reveal, RollLink, WordsIn } from "@/components/motion";
import { SiteFooter } from "@/components/SiteFooter";
import { useLenis, useStoryProgress } from "@/components/landing/Landing";
import { SPOTS } from "@/components/landing/spots";

const HeroMap = dynamic(() => import("@/components/landing/HeroMap"), { ssr: false, loading: () => null });

const HEAD = "font-display text-[clamp(2.25rem,1.4rem+2.6vw,3.75rem)] font-medium leading-[0.98] tracking-[-0.03em]";
const SCENES = ["Your street, in 3D", "Your rivals, live", "Your neighborhood", "Your customers deciding", "Your numbers"];

const STEPS: { title: string; body: string; facts: string[] }[] = [
  { title: "We rebuild your street.", body: "Enter an address and StrataIQ models the buildings, roads and walking routes around it from open map data.", facts: ["Real road and walking distances", "Population placed building by building", "Radius or travel-time catchments"] },
  { title: "We find your rivals.", body: "Competitors load live from OpenStreetMap and Foursquare. Add what the maps miss, and record their real prices to sharpen the result.", facts: ["Live competitor search", "Your own observed prices and rivals", "Field survey tools for the street"] },
  { title: "We profile the neighborhood.", body: "Every simulated customer is drawn from Census figures for the tract they live in, so a block of students and a block of retirees behave differently.", facts: ["Income, age and sex", "Household size, jobs and students", "How people get around", "Who works nearby"] },
  { title: "10,000 customers decide.", body: "Each simulated person has a budget, a routine and friends. For 84 days they choose you, a rival or nothing, remember bad visits and pass on what they think.", facts: ["Price, distance, quality and hours", "Word of mouth through friends", "Crowding when you reach capacity"] },
  { title: "You get a clear answer.", body: "Hundreds of market scenarios become a profit range, a break-even point and the short list of assumptions most worth checking.", facts: ["Bad, typical and good month", "Price and marketing tests", "Better spots nearby", "Your next steps"] },
];

// docs/VALIDATION.md, median error on counties held out of the fit.
const RESULTS: [string, number, number][] = [
  ["Grocery", 35, 26], ["Dentist", 42, 28], ["Pharmacy", 28, 29], ["Full-service restaurant", 69, 32], ["Beauty salon", 81, 40],
  ["Clothing store", 54, 40], ["Gym", 73, 43], ["Coffee shop", 88, 43], ["Barber", 60, 57],
];

const SOURCES = ["U.S. Census ACS", "Census LODES jobs", "County Business Patterns", "OpenStreetMap", "Foursquare Places", "WorldPop", "OSRM routing", "openrouteservice"];

function Bar({ value, tone, delay }: { value: number; tone: string; delay: number }) {
  const still = useReducedMotion();
  return (
    <div className="flex items-center gap-2">
      <div className="h-3 flex-1 bg-white/10">
        <motion.div className={`h-3 ${tone}`} style={{ width: `${value}%`, transformOrigin: "left" }} initial={still ? false : { scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }} />
      </div>
      <span className="num w-10 text-right text-[15px]">{value}%</span>
    </div>
  );
}

export function MethodStory() {
  const { progress, scene } = useStoryProgress();
  useLenis();
  return (
    <div className="bg-paper text-night">
      <div className="lg:grid lg:grid-cols-[minmax(0,46fr)_minmax(0,54fr)]">
        <div className="sticky top-0 z-0 order-2 h-[30svh] overflow-hidden bg-night lg:h-svh">
          <HeroMap spot={SPOTS[0]} comps={[]} scene={scene} progress={progress} />
          <p className="pointer-events-none absolute bottom-8 left-5 bg-night px-4 py-2 font-display text-[clamp(1.125rem,0.9rem+1vw,1.75rem)] font-medium tracking-[-0.02em] text-white md:left-8">{SCENES[scene] ?? SCENES[0]}</p>
        </div>
        <main className="relative z-10 order-1 bg-paper px-5 md:px-10 lg:px-14">
          <header className="flex items-center justify-between py-6">
            <Link href="/" className="font-display text-2xl font-medium tracking-tight">StrataIQ</Link>
            <nav className="flex items-center gap-5 text-[16px]">
              <RollLink href="/sample-report">Sample report</RollLink>
              <RollLink href="/sign-in">Sign in</RollLink>
            </nav>
          </header>
          {STEPS.map((s, i) => (
            <section key={s.title} data-scene className={`max-w-[46ch] ${i === 0 ? "pb-[12svh] pt-[3svh] lg:min-h-[calc(100svh-5rem)] lg:pt-[7svh]" : "py-[10svh] lg:py-[16svh]"}`}>
              {i === 0 && <h1 className="sr-only">How StrataIQ tests a location</h1>}
              <WordsIn text={s.title} className={HEAD} />
              <Reveal delay={0.15}><p className="mt-6 text-[19px] leading-[1.45]">{s.body}</p></Reveal>
              <ul className="mt-6 space-y-2">
                {s.facts.map((f, k) => <Reveal key={f} delay={0.2 + k * 0.07}><li className="bg-white px-4 py-3 text-[17px]">{f}</li></Reveal>)}
              </ul>
            </section>
          ))}
        </main>
      </div>

      <section className="relative z-10 bg-night px-5 py-24 text-white md:px-10 lg:px-14">
        <div className="mx-auto max-w-6xl">
          <WordsIn text="Tested against real markets." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-[62ch] text-[19px] leading-[1.45]">We scored StrataIQ&apos;s market-size estimates against Census business payroll in up to 1,810 US counties held out of its fit, and compared them with using population alone. Lower is better.</p>
          </Reveal>
          <div className="mt-12 grid gap-x-14 gap-y-7 md:grid-cols-2">
            {RESULTS.map(([name, base, ours], i) => (
              <Reveal key={name} delay={i * 0.04}>
                <h3 className="mb-2 text-[18px] font-medium">{name}</h3>
                <div className="space-y-1.5 text-[14px]">
                  <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2"><span>StrataIQ</span><Bar value={ours} tone="bg-accent" delay={0.1} /></div>
                  <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2"><span>Population</span><Bar value={base} tone="bg-white/60" delay={0.2} /></div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal><p className="mt-10 max-w-[70ch] text-[16px] leading-[1.5]">Figures are median error on county market size, using payroll as a stand-in for spending. Revenue for a single store is the next thing we are testing against real results.</p></Reveal>
        </div>
      </section>

      <section className="relative z-10 overflow-hidden bg-paper py-16">
        <p className="mb-8 px-5 text-[18px] font-medium md:px-10 lg:px-14">Built on public data</p>
        <Marquee items={SOURCES} />
      </section>

      <section className="relative z-10 bg-white px-5 py-20 md:px-10 lg:px-14">
        <div className="mx-auto max-w-6xl md:grid md:grid-cols-2 md:gap-14">
          <WordsIn text="Measured, and estimated." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="text-[18px] leading-[1.5]"><b className="font-medium">From data:</b> places, rivals, population, income, age, households, jobs, students and travel modes.</p>
            <p className="mt-4 text-[18px] leading-[1.5]"><b className="font-medium">Estimated, and shown as estimates:</b> starting costs, how often people buy, how they react to price, routines and friendships. Replace any of them with your own numbers and the forecast updates.</p>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 bg-accent px-5 py-20 text-white md:px-10 lg:px-14">
        <div className="mx-auto max-w-6xl">
          <WordsIn text="Now test your street." className={HEAD} />
          <Reveal delay={0.15}><Link href="/" className="mt-7 inline-flex min-h-14 items-center bg-white px-7 text-[18px] font-medium text-night transition-transform hover:-translate-y-0.5 motion-reduce:transform-none">Test it free</Link></Reveal>
        </div>
      </section>
      <div className="relative z-10 bg-paper px-5 md:px-10 lg:px-14"><SiteFooter /></div>
    </div>
  );
}
