import Link from "next/link";
import cn from "clsx";

/** Mark: one city block, the way a fire atlas draws it, with your lot in yellow. */
export function LogoMark({ size = 24, tone = "light" }: { size?: number; tone?: "light" | "dark" }) {
  const ink = tone === "dark" ? "#ffffff" : "#0f1f3d";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="1" y="1" width="9" height="13" fill="#e98f86" stroke={ink} strokeWidth="1.5" />
      <rect x="10" y="1" width="13" height="7" fill="#a9c4e4" stroke={ink} strokeWidth="1.5" />
      <rect x="10" y="8" width="7" height="15" fill="#f2c94c" stroke={ink} strokeWidth="1.5" />
      <rect x="1" y="14" width="9" height="9" fill="#a9c4e4" stroke={ink} strokeWidth="1.5" />
      <rect x="17" y="8" width="6" height="15" fill="#e98f86" stroke={ink} strokeWidth="1.5" />
    </svg>
  );
}

/** `tone="dark"` sits on the blue ground. */
export function Logo({ href = "/", compact = false, tone = "light" }: { href?: string; compact?: boolean; tone?: "light" | "dark" }) {
  return (
    <Link href={href} className={cn("group flex items-center gap-2.5", tone === "dark" ? "text-white" : "text-ink-100")} aria-label="StrataIQ home">
      <LogoMark tone={tone} />
      {!compact && <span className="font-display text-[22px] leading-none">StrataIQ</span>}
    </Link>
  );
}

const KEY: [string, string, string][] = [
  ["bg-brick", "Measured", "From a real source: rivals, Census, travel routes"],
  ["bg-you", "Yours", "Your site, your numbers, your next step"],
  ["bg-stone", "Estimated", "From the model. Replace it with a real quote"],
];

/** The printed color key. Every map and number in the product follows it. */
export function AtlasKey({ tone = "light", className }: { tone?: "light" | "dark"; className?: string }) {
  return (
    <ul className={cn("space-y-1.5 text-[13px] leading-none", className)} aria-label="Color key">
      {KEY.map(([c, l, d]) => (
        <li key={l} title={d} className="flex items-center gap-2">
          <span aria-hidden className={cn("h-3 w-4 shrink-0 border", c, tone === "dark" ? "border-white" : "border-night")} />
          {l}
        </li>
      ))}
    </ul>
  );
}

function seeded(seed: number) {
  let s = seed % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A drawn atlas plate: blocks and lots in the key's colors. Illustrative, it shows no real place. */
export function BlockPlan({ seed = 14, cols = 7, rows = 6, className }: { seed?: number; cols?: number; rows?: number; className?: string }) {
  const r = seeded(seed);
  const B = 120;
  const GAP = 26;
  const lots: { x: number; y: number; w: number; h: number; f: string }[] = [];
  for (let cx = 0; cx < cols; cx++) {
    for (let cy = 0; cy < rows; cy++) {
      const x0 = cx * (B + GAP);
      const y0 = cy * (B + GAP);
      const n = 2 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const y = y0 + (i * B) / n;
        const split = 0.35 + r() * 0.3;
        for (const [x, w] of [[x0, B * split], [x0 + B * split, B * (1 - split)]]) {
          const v = r();
          if (v < 0.12) continue; // an empty lot
          lots.push({ x, y, w, h: B / n, f: v < 0.38 ? "#e98f86" : v < 0.72 ? "#a9c4e4" : "#f7f8fa" });
        }
      }
    }
  }
  const pick = lots[Math.floor(lots.length * 0.42)];
  if (pick) pick.f = "#f2c94c";
  return (
    <svg viewBox={`-${GAP} -${GAP} ${cols * (B + GAP) + GAP} ${rows * (B + GAP) + GAP}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      {lots.map((l, i) => <rect key={i} x={l.x} y={l.y} width={l.w} height={l.h} fill={l.f} stroke="#0f1f3d" strokeWidth="1.25" />)}
    </svg>
  );
}
