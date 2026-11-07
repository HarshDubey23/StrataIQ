"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";

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
        <span aria-hidden className="absolute left-0 top-full inline-block whitespace-nowrap transition-transform duration-300 ease-out group-hover:-translate-y-full motion-reduce:hidden">{children}</span>
      </span>
    </Link>
  );
}
