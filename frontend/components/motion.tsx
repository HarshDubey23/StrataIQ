"use client";

import { AnimatePresence, animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const EASE = [0.16, 1, 0.3, 1] as const;

/** A section part rising into place once. Content stays visible without script or with reduced motion. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}>
      {children}
    </motion.div>
  );
}

/** Word-by-word headline, the Aceternity "text generate" pattern. Screen readers get the sentence once. */
export function WordsIn({ text, className, as: Tag = "h2" }: { text: string; className?: string; as?: "h1" | "h2" }) {
  const still = useReducedMotion();
  if (still) return <Tag className={className}>{text}</Tag>;
  return (
    <Tag className={className} aria-label={text}>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden className="inline-block overflow-hidden pb-[0.08em] align-top">
          <motion.span className="inline-block" initial={{ y: "105%" }} whileInView={{ y: 0 }} viewport={{ once: true }}
            transition={{ duration: 0.75, delay: i * 0.06, ease: EASE }}>
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Link whose label rolls up on hover, the Skiper "text roll" pattern. */
export function RollLink({ href, children, className }: { href: string; children: string; className?: string }) {
  return (
    <Link href={href} className={`group inline-block ${className ?? ""}`}>
      <span className="relative inline-block overflow-hidden align-bottom">
        <span className="inline-block transition-transform duration-300 ease-out group-hover:-translate-y-full motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">{children}</span>
        <span aria-hidden className="absolute left-0 top-full select-none inline-block whitespace-nowrap transition-transform duration-300 ease-out group-hover:-translate-y-full motion-reduce:hidden">{children}</span>
      </span>
    </Link>
  );
}

/** A figure that counts up once it is on screen. */
export function CountUp({ to }: { to: number }) {
  const still = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (still) return setShown(to);
    return animate(0, to, { duration: 1.4, ease: EASE, onUpdate: (v) => setShown(Math.round(v)) }).stop;
  }, [seen, still, to]);
  return <span ref={ref} className="tabular-nums">{seen ? shown.toLocaleString("en-US") : to.toLocaleString("en-US")}</span>;
}

/** Choice button whose filled background glides to the selected option, the Skiper animated-tab pattern. */
export function Chip({ group, on, tone, onClick, children }: { group: string; on: boolean; tone: string; onClick: () => void; children: ReactNode }) {
  return (
    <button aria-pressed={on} onClick={onClick} className={`relative min-h-11 bg-white px-4 text-[16px] transition-colors hover:bg-night/10 ${on ? "text-white" : ""}`}>
      {on && <motion.span layoutId={`chip-${group}`} className={`absolute inset-0 ${tone}`} transition={{ type: "spring", stiffness: 420, damping: 36 }} />}
      <span className="relative">{children}</span>
    </button>
  );
}

/** Reading progress along the top of the fixed map. */
export function ScrollBar() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return <motion.div aria-hidden style={{ scaleX }} className="absolute inset-x-0 top-0 h-1.5 origin-left bg-accent" />;
}

/** A card that tilts toward the pointer in 3D, the Aceternity "3D card" pattern. */
export function Tilt3D({ children, className }: { children: ReactNode; className?: string }) {
  const still = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [7, -7]), { stiffness: 160, damping: 18 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-9, 9]), { stiffness: 160, damping: 18 });
  if (still) return <div className={className}>{children}</div>;
  return (
    <div style={{ perspective: 1400 }} className={className}>
      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width - 0.5); y.set((e.clientY - r.top) / r.height - 0.5); }}
        onPointerLeave={() => { x.set(0); y.set(0); }}>
        {children}
      </motion.div>
    </div>
  );
}

/** A picture that rises out of a tilted screen as the page scrolls, the Fey / Aceternity "scroll out" pattern. */
export function ScrollOut({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.86, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [70, 0]);
  if (still) return <div ref={ref}>{children}</div>;
  return (
    <div ref={ref} style={{ perspective: 1600 }}>
      <motion.div style={{ rotateX, scale, y, transformOrigin: "50% 100%" }}>{children}</motion.div>
    </div>
  );
}

/** A slow, endless row of names. Reduced motion shows a wrapped, still list. */
export function Marquee({ items }: { items: string[] }) {
  const still = useReducedMotion();
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden} className="flex shrink-0 items-center gap-14 pr-14">
      {items.map((t) => <li key={t} className="whitespace-nowrap font-display text-[clamp(1.75rem,1.2rem+2vw,3.25rem)] font-medium tracking-[-0.03em]">{t}</li>)}
    </ul>
  );
  if (still) return <ul className="flex flex-wrap gap-x-10 gap-y-2 px-5 text-[20px]">{items.map((t) => <li key={t}>{t}</li>)}</ul>;
  return (
    <div className="flex overflow-hidden">
      <motion.div className="flex" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 34, ease: "linear", repeat: Infinity }}>
        {row(false)}{row(true)}
      </motion.div>
    </div>
  );
}

/** A button that drifts toward the pointer, the Aceternity "magnetic button" pattern. */
export function Magnetic({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const x = useSpring(0, { stiffness: 220, damping: 16 });
  const y = useSpring(0, { stiffness: 220, damping: 16 });
  if (still) return <>{children}</>;
  return (
    <motion.span className="inline-flex" style={{ x, y }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * 0.22); y.set((e.clientY - r.top - r.height / 2) * 0.3); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.span>
  );
}

export type Fact = { label: string; detail: string; source?: string };

/** A point that opens a detail panel beside it while the pointer or keyboard focus is on it. On touch screens, a tap opens it inline. */
export function FactItem({ fact }: { fact: Fact }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const still = useReducedMotion();
  const show = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const hide = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 90); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <li className={`relative ${open ? "z-40" : "z-0"}`}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") show(); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") hide(); }}
      onFocus={show} onBlur={hide}
      onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className={`group flex min-h-12 w-full items-center justify-between gap-4 px-4 py-3 text-left text-[17px] transition-colors duration-200 ${open ? "bg-night text-white" : "bg-white text-night"}`}>
        {fact.label}
        <span aria-hidden className={`text-[20px] leading-none transition-transform duration-300 motion-reduce:transition-none ${open ? "translate-x-1 text-accent-dim" : "text-accent"}`}>→</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="note" initial={still ? false : { opacity: 0, x: -14, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={still ? { opacity: 0 } : { opacity: 0, x: -8 }} transition={{ duration: 0.22, ease: EASE }}
            className="mt-1 lg:absolute lg:left-full lg:top-1/2 lg:mt-0 lg:w-[26rem] lg:-translate-y-1/2 lg:pl-3">
            <div className="bg-night p-6 text-white">
              <h4 className="font-display text-[22px] font-medium leading-tight tracking-[-0.02em]">{fact.label}</h4>
              <p className="mt-3 text-[16px] leading-[1.5]">{fact.detail}</p>
              {fact.source && <p className="mt-4 border-t border-white/20 pt-3 text-[14px]">Source: {fact.source}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
