"use client";

import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { FactItem, Marquee, Reveal, RollLink, WordsIn, type Fact } from "@/components/motion";
import { SiteFooter } from "@/components/SiteFooter";
import { useLenis, useStoryProgress } from "@/components/landing/Landing";
import { SPOTS } from "@/components/landing/spots";
import { Logo } from "@/components/brand";

const HeroMap = dynamic(() => import("@/components/landing/HeroMap"), { ssr: false, loading: () => null });

const HEAD = "font-display text-[clamp(2.5rem,1.6rem+2.4vw,4rem)] leading-[1.02]";
const SCENES = ["Your street, in 3D", "Your rivals, live", "Your neighborhood", "Your customers deciding", "Your numbers"];

const STEPS: { title: string; body: string; facts: Fact[] }[] = [
  { title: "We rebuild your street.", body: "Enter an address and StrataIQ models the buildings, roads and walking routes around it from open map data.", facts: [
    { label: "Real road and walking distances", detail: "Each part of your catchment is routed to your site and to every rival by car and on foot. A river or freeway counts as the barrier it really is, instead of a straight line on a map.", source: "OSRM routing on OpenStreetMap" },
    { label: "Population placed building by building", detail: "We take the population estimate for the area, then place people across mapped buildings, so a parking lot and an apartment block no longer count the same.", source: "WorldPop and OpenStreetMap" },
    { label: "Radius or travel-time catchments", detail: "Test the area people will realistically travel from, either as a set distance or as minutes by car or on foot.", source: "openrouteservice" },
  ] },
  { title: "We find your rivals.", body: "Competitors load live from OpenStreetMap and Foursquare. Add what the maps miss, and record their real prices to sharpen the result.", facts: [
    { label: "Live competitor search", detail: "Each test searches for businesses of your type around your address at the moment you run it, and every record keeps its source and date.", source: "OpenStreetMap and Foursquare Places" },
    { label: "Your own observed prices and rivals", detail: "Add a rival the maps missed, remove one that closed, or enter the price on its menu. Your figures replace our estimates in the next run.", source: "You" },
    { label: "Field survey tools for the street", detail: "Send a phone-friendly survey link to whoever walks the street. It records prices, hours and rent, then feeds them straight into your forecast.", source: "Your field data" },
  ] },
  { title: "We profile the neighborhood.", body: "Every simulated customer is drawn from Census figures for the tract they live in, so a block of students and a block of retirees behave differently.", facts: [
    { label: "Income, age and sex", detail: "Each simulated person gets an income from their own tract's household income brackets, with age and sex drawn from the same tract. Across 84,091 US neighborhoods, no two areas look alike.", source: "U.S. Census ACS 2023, 5-year" },
    { label: "Household size, jobs and students", detail: "Whether someone works, studies or is retired follows local rates. That decides when they are free, which shapes when your busy hours fall.", source: "U.S. Census ACS 2023, 5-year" },
    { label: "How people get around", detail: "Walking, driving, transit and cycling follow each tract's real commute shares. A downtown transit block and a suburban street reach you very differently.", source: "U.S. Census ACS 2023, table B08301" },
    { label: "Who works nearby", detail: "Offices and downtowns have few residents but many customers. We add the jobs located in each tract, so lunch and after-work demand counts too.", source: "U.S. Census LODES" },
  ] },
  { title: "10,000 customers decide.", body: "Each simulated person has a budget, a routine and friends. For 84 days they choose you, a rival or nothing, remember bad visits and pass on what they think.", facts: [
    { label: "Price, distance, quality and hours", detail: "Every person weighs your price against what they can spend, how far you are, how good you seem and whether you are open when they are free.", source: "StrataIQ choice model" },
    { label: "Word of mouth through friends", detail: "Customers tell friends and family. People who liked you bring others in, and people who had a bad visit warn them off.", source: "StrataIQ agent simulation" },
    { label: "Crowding when you reach capacity", detail: "When you fill up, people get turned away or have a worse visit and remember it. A plan that sells out can still lose customers.", source: "StrataIQ agent simulation" },
  ] },
  { title: "You get a clear answer.", body: "Hundreds of market scenarios become a profit range, a break-even point and the short list of assumptions most worth checking.", facts: [
    { label: "Bad, typical and good month", detail: "We rerun your market across 800 scenarios and show the range of monthly profit, including how often you would lose money.", source: "StrataIQ scenario engine" },
    { label: "Price and marketing tests", detail: "See sales and profit at every price and marketing budget, so you can compare plans before you commit to one.", source: "StrataIQ scenario engine" },
    { label: "Better spots nearby", detail: "We test other points around your address and show where the same plan performs better, and why.", source: "StrataIQ site search" },
    { label: "Your next steps", detail: "Your report ends with the risks that matter most and what to check first, in the order they could change your decision.", source: "Your StrataIQ report" },
  ] },
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
        <div className="sticky top-0 z-0 order-2 h-[30svh] overflow-hidden bg-atlas lg:h-svh">
          <HeroMap spot={SPOTS[0]} comps={[]} scene={scene} progress={progress} />
          <p className="pointer-events-none absolute sheet bottom-6 left-5 px-4 py-2 font-display text-[clamp(1.125rem,0.9rem+1vw,1.75rem)] md:left-8">{SCENES[scene] ?? SCENES[0]}</p>
        </div>
        <main className="relative z-10 order-1 bg-paper px-5 md:px-10 lg:px-14">
          <header className="flex items-center justify-between py-6">
            <Logo />
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
                {s.facts.map((f) => <FactItem key={f.label} fact={f} />)}
              </ul>
            </section>
          ))}
        </main>
      </div>

      <section className="relative z-10 border-t border-night bg-atlas px-5 py-24 text-white md:px-10 lg:px-14">
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
                  <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2"><span>StrataIQ</span><Bar value={ours} tone="bg-you" delay={0.1} /></div>
                  <div className="grid grid-cols-[6.5rem_1fr] items-center gap-2"><span>Population</span><Bar value={base} tone="bg-white/60" delay={0.2} /></div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal><p className="mt-10 max-w-[70ch] text-[16px] leading-[1.5]">Figures are median error on county market size, using payroll as a stand-in for spending.</p></Reveal>
          <Reveal><p className="mt-4 max-w-[70ch] text-[16px] leading-[1.5]">We also checked single-store forecasts against a year of reported alcohol sales at 5,546 Texas bars and restaurants. Location data explained under 3% of why one venue outsells another in cities held out of the test. Concept, size and the operator matter far more, so use a forecast to test your plan and see what has to be true, not as a promise of one store&apos;s sales.</p></Reveal>
        </div>
      </section>

      <section className="relative z-10 overflow-hidden border-t border-night bg-paper py-16">
        <p className="mb-8 px-5 text-[18px] font-medium md:px-10 lg:px-14">Built on public data</p>
        <Marquee items={SOURCES} />
      </section>

      <section className="relative z-10 border-t border-night bg-white px-5 py-20 md:px-10 lg:px-14">
        <div className="mx-auto max-w-6xl md:grid md:grid-cols-2 md:gap-14">
          <WordsIn text="Measured, and estimated." className={HEAD} />
          <Reveal delay={0.15}>
            <p className="text-[18px] leading-[1.5]"><b className="font-medium">From data:</b> places, rivals, population, income, age, households, jobs, students and travel modes.</p>
            <p className="mt-4 text-[18px] leading-[1.5]"><b className="font-medium">Estimated, and shown as estimates:</b> starting costs, how often people buy, how they react to price, routines and friendships. Replace any of them with your own numbers and the forecast updates.</p>
          </Reveal>
        </div>
      </section>

      <section className="relative z-10 border-t border-night bg-you px-5 py-20 text-night md:px-10 lg:px-14">
        <div className="mx-auto max-w-6xl">
          <WordsIn text="Now test your street." className={HEAD} />
          <Reveal delay={0.15}><Link href="/" className="mt-7 inline-flex min-h-14 items-center bg-night px-7 text-[18px] font-semibold text-white transition-colors hover:bg-atlas">Test it free</Link></Reveal>
        </div>
      </section>
      <div className="relative z-10 border-t border-night bg-paper px-5 md:px-10 lg:px-14"><SiteFooter /></div>
    </div>
  );
}
