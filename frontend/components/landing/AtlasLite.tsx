"use client";

/**
 * The map for phones that cannot carry WebGL: a plain canvas site plan of the same real data, with no map library,
 * no tiles and no GPU work. It draws only when something changes, so it stays smooth on the weakest device.
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
  const live = useRef({ spot, comps, tracts, scene, active, bornAt: 0 });
  live.current = { ...live.current, spot, comps, tracts, scene, active };
  useEffect(() => {
    live.current.bornAt = performance.now();
  }, [spot, comps]);

  useEffect(() => {
    const c = el.current;
    const g = c?.getContext("2d", { alpha: false });
    if (!c || !g) return;
    let raf = 0;
    let zoom = ZOOM[0];
    let lastKey = "";
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const size = () => {
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      lastKey = "";
    };
    size();
    window.addEventListener("resize", size);
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const S = live.current;
      if (!S.active) return;
      const p = progress?.current ?? S.scene;
      zoom += (ZOOM[S.scene] - zoom) * 0.12;
      const age = now - S.bornAt;
      const rising = age < 1600;
      const settling = Math.abs(ZOOM[S.scene] - zoom) > 0.004;
      const reach = Math.round(Math.max(0, Math.min(1, p - 2.6)) * 24);
      const pulse = Math.floor(now / 50) % 40; // 20 updates a second is enough for the ring
      const key = `${c.width}|${zoom.toFixed(3)}|${S.scene}|${reach}|${pulse}|${S.comps.length}|${S.tracts.length}|${rising ? Math.floor(age / 33) : ""}|${S.spot.lat}`;
      if (key === lastKey && !settling) return;
      lastKey = key;

      const w = c.clientWidth;
      const h = c.clientHeight;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = "#1d4f91";
      g.fillRect(0, 0, w, h);
      // the words sit at the bottom on a phone, so the plan sits in the open part above them
      const cx = w < 768 ? w / 2 : w * 0.66;
      const cy = w < 768 ? h * 0.3 : h * 0.52;
      const pxPerKm = ((Math.min(w, h) * 0.46) / (2 * MILE_KM)) * zoom;
      const kmLng = 111.32 * Math.cos((S.spot.lat * Math.PI) / 180);
      const X = (lng: number) => cx + (lng - S.spot.lng) * kmLng * pxPerKm;
      const Y = (lat: number) => cy - (lat - S.spot.lat) * 111.32 * pxPerKm;

      g.lineWidth = 1;
      g.strokeStyle = "rgba(255,255,255,0.35)";
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
        for (const t of S.tracts) {
          g.beginPath();
          g.arc(X(t.lng), Y(t.lat), 4 + Math.sqrt(t.people / most) * 22, 0, Math.PI * 2);
          g.fillStyle = "#e98f86";
          g.fill();
          g.strokeStyle = "#0f1f3d";
          g.stroke();
        }
      }

      if (S.scene >= 3 && S.tracts.length) {
        const r = rand(S.spot.lat * 1e4 + S.spot.lng * 1e3);
        const total = S.tracts.reduce((a, t) => a + t.people, 0);
        const km = (reach / 24) * 3.2;
        for (let i = 0; i < 500; i++) {
          let u = r() * total;
          const t = S.tracts.find((k) => (u -= k.people) <= 0) ?? S.tracts[0];
          const lng = t.lng + (r() - 0.5) * 0.012;
          const lat = t.lat + (r() - 0.5) * 0.01;
          const v = r();
          const d = Math.hypot((lng - S.spot.lng) * kmLng, (lat - S.spot.lat) * 111.32);
          g.fillStyle = d > km ? "rgba(207,224,245,0.6)" : v < 0.18 ? "#f2c94c" : v < 0.62 ? "#ffffff" : "rgba(207,224,245,0.35)";
          g.fillRect(X(lng) - 1.5, Y(lat) - 1.5, 3, 3);
        }
      }

      g.strokeStyle = "#0f1f3d";
      g.fillStyle = "#e98f86";
      for (const q of S.comps.slice(0, 200)) {
        const km = Math.hypot((q.lng - S.spot.lng) * kmLng, (q.lat - S.spot.lat) * 111.32);
        const k = Math.max(0, Math.min(1, (age - km * 500) / 300));
        if (k === 0) continue;
        const s = 7 * k;
        g.fillRect(X(q.lng) - s / 2, Y(q.lat) - s / 2, s, s);
        g.strokeRect(X(q.lng) - s / 2, Y(q.lat) - s / 2, s, s);
      }

      g.strokeStyle = `rgba(242,201,76,${1 - pulse / 40})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(cx, cy, 8 + pulse, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#f2c94c";
      g.fillRect(cx - 8, cy - 8, 16, 16);
      g.strokeStyle = "#0f1f3d";
      g.lineWidth = 1.5;
      g.strokeRect(cx - 8, cy - 8, 16, 16);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
    };
  }, [progress]);

  return <canvas ref={el} aria-hidden className="absolute inset-0 h-full w-full" />;
}
