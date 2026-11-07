"use client";

import { animate, motion, useInView, useReducedMotion, useScroll, useSpring } from "motion/react";
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
