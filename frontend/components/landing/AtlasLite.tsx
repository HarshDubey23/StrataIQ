"use client";

/**
 * The map for phones that cannot carry WebGL: a plain canvas site plan of the same real data, with no map library,
 * no tiles and no GPU work. It redraws only when the data or scene changes; zoom and the site's ring are CSS.
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import type { PreviewComp, Spot } from "./spots";
import type { Tract } from "./HeroMap";

const MILE_KM = 1.609;
const ZOOM = [1.7, 1.3, 1, 1.25, 1.05];

function rand(seed: number) {
  let s = Math.abs(Math.round(seed)) % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export default function AtlasLite({ spot, comps, tracts = [], scene = 0, progress, active = true }: { spot: Spot; comps: PreviewComp[]; tracts?: Tract[]; scene?: number; progress?: MutableRefObject<number>; active?: boolean }) {
  const el = useRef<HTMLCanvasElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const ping = useRef<HTMLDivElement>(null);
  const redraw = useRef<() => void>(() => undefined);
  const live = useRef({ spot, comps, tracts, scene, active });
  live.current = { spot, comps, tracts, scene, active };

  useEffect(() => {
    const c = el.current;
    const g = c?.getContext("2d", { alpha: false });
    if (!c || !g) return;
    let queued = 0;
    let lastKey = "";
    let dots: { lng: number; lat: number; v: number; d: number }[] = [];
    let dotsFor: Tract[] | null = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const draw = () => {
      queued = 0;
      const S = live.current;
      if (!S.active) return;
      const reach = S.scene >= 3 ? Math.round(Math.max(0, Math.min(1, (progress?.current ?? S.scene) - 2.6)) * 12) : 0;
      const w = c.clientWidth;
      const h = c.clientHeight;
      const key = `${w}|${h}|${S.scene === 2}|${S.scene >= 3}|${reach}|${S.comps.length}|${S.tracts.length}|${S.spot.lat}`;
      if (key === lastKey) return;
      lastKey = key;
      if (c.width !== Math.round(w * dpr)) c.width = Math.round(w * dpr);
      if (c.height !== Math.round(h * dpr)) c.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#1d4f91";
      g.fillRect(0, 0, w, h);
      // the words sit at the bottom on a phone, so the plan sits in the open part above them
      const cx = w < 768 ? w / 2 : w * 0.66;
      const cy = w < 768 ? h * 0.3 : h * 0.52;
      const pxPerKm = (Math.min(w, h) * 0.46) / (2 * MILE_KM);
      const kmLng = 111.32 * Math.cos((S.spot.lat * Math.PI) / 180);
      const X = (lng: number) => cx + (lng - S.spot.lng) * kmLng * pxPerKm;
      const Y = (lat: number) => cy - (lat - S.spot.lat) * 111.32 * pxPerKm;
      if (plate.current) plate.current.style.transformOrigin = `${cx}px ${cy}px`;
      if (ping.current) ping.current.style.transform = `translate(${cx - 7}px, ${cy - 7}px)`;

      g.lineWidth = 1;
      g.strokeStyle = "#5f86bb";
      g.fillStyle = "#ffffff";
      g.font = "600 12px sans-serif";
      for (const mi of [0.5, 1, 2]) {
        const r = mi * MILE_KM * pxPerKm;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.stroke();
        g.fillText(`${mi} mi`, cx + 4, cy - r - 4);
      }

      if (S.scene === 2) {
        const most = S.tracts.reduce((a, t) => Math.max(a, t.people), 1);
        g.fillStyle = "#e98f86";
        g.strokeStyle = "#0f1f3d";
        for (const t of S.tracts) {
          g.beginPath();
          g.arc(X(t.lng), Y(t.lat), 4 + Math.sqrt(t.people / most) * 22, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
      }

      if (S.scene >= 3 && S.tracts.length) {
        if (dotsFor !== S.tracts) {
          dotsFor = S.tracts;
          const r = rand(S.spot.lat * 1e4 + S.spot.lng * 1e3);
          const total = S.tracts.reduce((a, t) => a + t.people, 0);
          dots = Array.from({ length: 300 }, () => {
            let u = r() * total;
            const t = S.tracts.find((k) => (u -= k.people) <= 0) ?? S.tracts[0];
            const lng = t.lng + (r() - 0.5) * 0.012;
            const lat = t.lat + (r() - 0.5) * 0.01;
            return { lng, lat, v: r(), d: Math.hypot((lng - S.spot.lng) * kmLng, (lat - S.spot.lat) * 111.32) };
          });
        }
        const km = (reach / 12) * 3.2;
        for (const q of dots) {
          g.fillStyle = q.d > km ? "#a9c4e4" : q.v < 0.18 ? "#f2c94c" : q.v < 0.62 ? "#ffffff" : "#6f97cb";
          g.fillRect(X(q.lng) - 1.5, Y(q.lat) - 1.5, 3, 3);
        }
      }

      g.lineWidth = 1;
      g.strokeStyle = "#0f1f3d";
      g.fillStyle = "#e98f86";
      for (const q of S.comps.slice(0, 200)) {
        g.fillRect(X(q.lng) - 3.5, Y(q.lat) - 3.5, 7, 7);
        g.strokeRect(X(q.lng) - 3.5, Y(q.lat) - 3.5, 7, 7);
      }

      g.fillStyle = "#f2c94c";
      g.fillRect(cx - 8, cy - 8, 16, 16);
      g.lineWidth = 1.5;
      g.strokeRect(cx - 8, cy - 8, 16, 16);
    };
    const queue = () => {
      queued ||= requestAnimationFrame(draw);
    };
    redraw.current = queue;
    queue();
    window.addEventListener("resize", queue);
    window.addEventListener("scroll", queue, { passive: true });
    return () => {
      cancelAnimationFrame(queued);
      window.removeEventListener("resize", queue);
      window.removeEventListener("scroll", queue);
    };
  }, [progress]);

  useEffect(() => redraw.current(), [spot, comps, tracts, scene, active]);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-atlas">
      <div ref={plate} className="absolute inset-0 transition-transform duration-700 ease-out" style={{ transform: `scale(${ZOOM[scene] ?? 1})` }}>
        <canvas ref={el} className="absolute inset-0 h-full w-full" />
        <div ref={ping} className="site-ping absolute left-0 top-0" />
      </div>
    </div>
  );
}
