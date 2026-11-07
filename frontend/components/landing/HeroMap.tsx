"use client";

/**
 * The landing city, one continuous shot over the real street, drawn only with MapLibre: no deck.gl, so the cubes
 * arrive with the map and share its single render pass.
 *
 * Real: buildings, roads, rival locations and the population cube on each Census tract.
 * Drawn: the crowd in the decision scene. People are placed from real tract counts, but who chooses whom here only
 * shows how the simulation works. The page says so where it appears.
 *
 * `progress` (a ref, so scrolling never re-renders React) scrubs the camera and the decision wave.
 * Scenes: 0 your address  1 rivals rise  2 the Census  3 customers decide  4 what has to be true
 * Quality: "full" has 3D buildings and moving customers; "lite" has flat buildings, 3D data cubes and nothing moving
 * unless you scroll. A device that still struggles drops a level by itself.
 */
import maplibregl, { type GeoJSONSource, type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { atlasStyle } from "@/lib/mapkit";
import type { PreviewComp, Spot } from "./spots";

export type { Spot, PreviewComp };
export interface Tract {
  lat: number;
  lng: number;
  people: number;
}
export type Quality = "full" | "lite";

type Cam = { zoom: number; pitch: number; bearing: number };
// every zoom stays on the same z14 tiles, so the camera never stalls on a new tile set
const CAMERAS: Cam[] = [
  { zoom: 15.3, pitch: 62, bearing: -30 },
  { zoom: 15.6, pitch: 50, bearing: 10 },
  { zoom: 14.1, pitch: 58, bearing: 40 },
  { zoom: 14.9, pitch: 66, bearing: 95 },
  { zoom: 14.3, pitch: 48, bearing: 170 },
];

const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const FC = (features: unknown[]) => ({ type: "FeatureCollection", features }) as GeoJSON.FeatureCollection;

function camAt(p: number): Cam {
  const i = Math.max(0, Math.min(CAMERAS.length - 1, Math.floor(p)));
  const j = Math.min(CAMERAS.length - 1, i + 1);
  const k = smooth(clamp01(p - i));
  const a = CAMERAS[i];
  const b = CAMERAS[j];
  return { zoom: a.zoom + (b.zoom - a.zoom) * k, pitch: a.pitch + (b.pitch - a.pitch) * k, bearing: a.bearing + (b.bearing - a.bearing) * k };
}

/** A square footprint for a cube, as a GeoJSON feature carrying its height. */
function cube(lng: number, lat: number, meters: number, h: number) {
  const dy = meters / 111320;
  const dx = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  return { type: "Feature", properties: { h }, geometry: { type: "Polygon", coordinates: [[[lng - dx, lat - dy], [lng + dx, lat - dy], [lng + dx, lat + dy], [lng - dx, lat + dy], [lng - dx, lat - dy]]] } };
}

function ring(lng: number, lat: number, km: number) {
  const c = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return [lng + (Math.cos(a) * km) / (111.32 * Math.cos((lat * Math.PI) / 180)), lat + (Math.sin(a) * km) / 111.32];
  });
  return FC([{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: c } }]);
}

function rand(seed: number) {
  let s = Math.abs(Math.round(seed)) % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** The crowd: placed by real tract counts. Their choices are illustrative. */
function crowd(spot: Spot, comps: PreviewComp[], tracts: Tract[], n: number) {
  const r = rand(spot.lat * 1e4 + spot.lng * 1e3 + comps.length);
  const kmLng = 111.32 * Math.cos((spot.lat * Math.PI) / 180);
  const total = tracts.reduce((s, t) => s + t.people, 0);
  const dests = comps.slice(0, 40);
  const people: unknown[] = [];
  const walkers: { from: [number, number]; to: [number, number]; you: boolean; t: number; d: number }[] = [];
  if (!total) return { people: FC([]), walkers };
  for (let i = 0; i < n; i++) {
    let u = r() * total;
    const t = tracts.find((k) => (u -= k.people) <= 0) ?? tracts[0];
    const lng = t.lng + (r() - 0.5) * 0.012;
    const lat = t.lat + (r() - 0.5) * 0.01;
    const d = Math.hypot((lng - spot.lng) * kmLng, (lat - spot.lat) * 111.32);
    const v = r();
    const c = v < 0.2 ? "y" : v < 0.62 && dests.length ? "r" : "n";
    people.push({ type: "Feature", properties: { d, c }, geometry: { type: "Point", coordinates: [lng, lat] } });
    if (c !== "n" && walkers.length < 160) {
      const dst = c === "y" ? spot : dests[Math.floor(r() * dests.length)];
      walkers.push({ from: [lng, lat], to: [dst.lng, dst.lat], you: c === "y", t: r(), d });
    }
  }
  return { people: FC(people), walkers };
}

export default function HeroMap({ spot, comps, tracts = [], scene = 0, progress, crosshair = false, active = true, pillar = 1, quality = "full", onStruggling }: {
  spot: Spot; comps: PreviewComp[]; tracts?: Tract[]; scene?: number; progress?: MutableRefObject<number>; crosshair?: boolean; active?: boolean; pillar?: number; quality?: Quality; onStruggling?: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  const hLine = useRef<HTMLDivElement>(null);
  const vLine = useRef<HTMLDivElement>(null);
  const read = useRef<HTMLDivElement>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const live = useRef({
    spot, comps, tracts, scene, active, pillar, walkers: [] as ReturnType<typeof crowd>["walkers"],
    free: false, cur: CAMERAS[0] as Cam, t0: 0, lastT: 0, riseAt: 0, riseDone: false, tractK: 0, pillarH: 0, lastData: 0, lastWalk: 0, reachStep: -1, shownScene: -1, frames: 0, slow: 0, low: quality === "lite", gaveUp: false,
  });
  Object.assign(live.current, { spot, comps, tracts, scene, active, pillar });

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    (async () => {
      const style = await atlasStyle();
      if (cancelled || !el.current) return;
      let m: MLMap;
      try {
        m = new maplibregl.Map({
          container: el.current, style, center: [spot.lng, spot.lat], zoom: 14.05, pitch: 0, bearing: -40, interactive: false,
          attributionControl: { compact: true }, maxPitch: 75, fadeDuration: 0, canvasContextAttributes: { antialias: false }, maxTileCacheSize: quality === "lite" ? 40 : 120,
          pixelRatio: quality === "lite" ? 1 : Math.min(window.devicePixelRatio || 1, 1.5),
        });
      } catch {
        onStruggling?.(); // no WebGL at all: the canvas plan takes over
        return;
      }
      map.current = m;
      // the page must never sit on an empty map: if this one has not loaded soon, the canvas plan takes over
      const giveUp = setTimeout(() => {
        if (!cancelled) onStruggling?.();
      }, 8000);
      m.on("error", (e) => console.warn("map error", e.error?.message));
      // the story's words sit on the left, so the site stays in the open part of the map
      if (window.innerWidth >= 1024) m.setPadding({ left: Math.min(620, window.innerWidth * 0.42), top: 0, right: 0, bottom: 0 });
      else m.setPadding({ top: 0, left: 0, right: 0, bottom: window.innerHeight * 0.45 });
      if (crosshair) m.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "top-right");
      const ping = document.createElement("div");
      ping.className = "site-ping";
      marker.current = new maplibregl.Marker({ element: ping }).setLngLat([spot.lng, spot.lat]).addTo(m);

      const setBuildings = (low: boolean) => {
        m.setLayoutProperty("siq-buildings-3d", "visibility", low ? "none" : "visible");
        m.setLayoutProperty("siq-buildings-flat", "visibility", low ? "visible" : "none");
      };
      // the style is enough to start: roads and cubes appear as tiles arrive, with no wait for every tile
      m.once("style.load", () => {
        clearTimeout(giveUp);
        if (cancelled) return;
        for (const id of ["catchment", "tracts", "rivals", "site", "people", "walkers"]) m.addSource(id, { type: "geojson", data: FC([]), buffer: 8, tolerance: 1 });
        m.addLayer({ id: "people", source: "people", type: "circle", layout: { visibility: "none" }, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 14, 2.2, 16, 4], "circle-color": "#cfe0f5" } });
        m.addLayer({ id: "walkers", source: "walkers", type: "circle", layout: { visibility: "none" }, paint: { "circle-radius": 3.5, "circle-color": ["case", ["get", "you"], "#f2c94c", "#ffffff"], "circle-stroke-color": "#0f1f3d", "circle-stroke-width": 1 } });
        m.addLayer({ id: "catchment", source: "catchment", type: "line", paint: { "line-color": "#ffffff", "line-width": 2, "line-dasharray": [2, 2], "line-opacity": 0 } });
        const cubeLayer = (id: string, color: string) => m.addLayer({ id, source: id, type: "fill-extrusion", paint: { "fill-extrusion-color": color, "fill-extrusion-height": ["get", "h"], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": false } });
        cubeLayer("tracts", "#e98f86");
        cubeLayer("rivals", "#e98f86");
        cubeLayer("site", "#f2c94c");
        setBuildings(quality === "lite");
        setReady(true);
        requestAnimationFrame(() => setShown(true));

        const loop = (now: number) => {
          raf = requestAnimationFrame(loop);
          const S = live.current;
          // nothing draws while solid sections cover the map
          if (!S.active) {
            S.lastT = now;
            return;
          }
          const dt = Math.min(100, now - (S.lastT || now));
          S.lastT = now;
          const p = progress?.current ?? S.scene;

          // a device that struggles steps down by itself, and never back up mid-visit
          if (S.free && !S.gaveUp) {
            S.frames++;
            if (dt > 34) S.slow++;
            if (S.frames === 150) {
              if (S.slow > 55) {
                if (!S.low) {
                  S.low = true;
                  m.setPixelRatio(1);
                  setBuildings(true);
                } else {
                  S.gaveUp = true;
                  onStruggling?.();
                }
              }
              S.frames = 0;
              S.slow = 0;
            }
          }

          if (S.free && !m.isMoving()) {
            const target = camAt(p);
            const c = S.cur;
            // damped by time, not frames, so the camera moves at one speed on any machine
            const k = 1 - Math.exp(-dt / 130);
            const next = { zoom: c.zoom + (target.zoom - c.zoom) * k, pitch: c.pitch + (target.pitch - c.pitch) * k, bearing: c.bearing + (target.bearing - c.bearing) * k };
            const moved = Math.abs(next.zoom - c.zoom) + Math.abs(next.pitch - c.pitch) + Math.abs(next.bearing - c.bearing) > 0.002;
            S.cur = next;
            // a slow drift keeps the city alive on machines that can afford it
            if (!S.low || moved) m.jumpTo({ center: [S.spot.lng, S.spot.lat], zoom: next.zoom, pitch: next.pitch, bearing: next.bearing + (S.low ? 0 : (now - S.t0) * 0.0014) });
          }

          const sc = S.scene;
          const kmLng = 111.32 * Math.cos((S.spot.lat * Math.PI) / 180);
          const dataDue = now - S.lastData > 40;

          // rivals rise in turn, spreading out from your site, then stop costing anything
          const riseAge = now - S.riseAt;
          if (!S.riseDone && dataDue) {
            const H = 90;
            (m.getSource("rivals") as GeoJSONSource).setData(FC(S.comps.slice(0, S.low ? 120 : 300).map((q) => {
              const km = Math.hypot((q.lat - S.spot.lat) * 111.32, (q.lng - S.spot.lng) * kmLng);
              return cube(q.lng, q.lat, 16, H * easeOut(clamp01((riseAge - 200 - km * 600) / 500)));
            })));
            S.lastData = now;
            if (riseAge > 2400) S.riseDone = true;
          }

          // census cubes grow in scene 2 and leave after it
          const tractTarget = sc === 2 ? 1 : 0;
          if (Math.abs(S.tractK - tractTarget) > 0.004 && dataDue) {
            S.tractK += (tractTarget - S.tractK) * (1 - Math.exp(-dt / 160)) * 2;
            S.tractK = clamp01(S.tractK);
            if (Math.abs(S.tractK - tractTarget) <= 0.01) S.tractK = tractTarget;
            const most = S.tracts.reduce((a, t) => Math.max(a, t.people), 1);
            (m.getSource("tracts") as GeoJSONSource).setData(FC(S.tractK === 0 ? [] : S.tracts.map((t) => cube(t.lng, t.lat, 150, S.tractK * (40 + (t.people / most) * 620)))));
            S.lastData = now;
          }

          // your site: its height follows the rent you drag
          const pTarget = sc === 4 ? 200 + 240 * S.pillar : 300;
          if (Math.abs(S.pillarH - pTarget) > 1 && dataDue) {
            S.pillarH += (pTarget - S.pillarH) * (1 - Math.exp(-dt / 120));
            (m.getSource("site") as GeoJSONSource).setData(FC([cube(S.spot.lng, S.spot.lat, 26, S.pillarH)]));
            S.lastData = now;
          }

          if (sc !== S.shownScene) {
            S.shownScene = sc;
            m.setPaintProperty("catchment", "line-opacity", sc === 1 || sc === 2 || sc === 4 ? 0.9 : 0);
            m.setLayoutProperty("people", "visibility", sc >= 3 ? "visible" : "none");
            m.setLayoutProperty("walkers", "visibility", sc === 3 && !S.low ? "visible" : "none");
          }

          // scrolling through the scene is what makes people decide, nearest first
          if (sc >= 3) {
            const step = Math.round(clamp01(p - 2.6) * 24);
            if (step !== S.reachStep) {
              S.reachStep = step;
              const reach = (step / 24) * 3.2;
              m.setPaintProperty("people", "circle-color", ["case", [">", ["get", "d"], reach], "#7fa3d1", ["==", ["get", "c"], "y"], "#f2c94c", ["==", ["get", "c"], "r"], "#ffffff", "#7fa3d1"]);
            }
            if (sc === 3 && !S.low && now - S.lastWalk > 50) {
              S.lastWalk = now;
              const reach = (S.reachStep / 24) * 3.2;
              const u = now / 6000;
              (m.getSource("walkers") as GeoJSONSource).setData(FC(S.walkers.filter((w) => w.d <= reach).map((w) => {
                const f = (u + w.t) % 1;
                return { type: "Feature", properties: { you: w.you }, geometry: { type: "Point", coordinates: [w.from[0] + (w.to[0] - w.from[0]) * f, w.from[1] + (w.to[1] - w.from[1]) * f] } };
              })));
            }
          }
        };
        raf = requestAnimationFrame(loop);
      });
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // new rivals rise again
  useEffect(() => {
    live.current.riseAt = performance.now();
    live.current.riseDone = false;
  }, [comps]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const c = crowd(spot, comps, tracts, live.current.low ? 700 : 2000);
    live.current.walkers = c.walkers;
    (m.getSource("people") as GeoJSONSource).setData(c.people);
    (m.getSource("catchment") as GeoJSONSource).setData(ring(spot.lng, spot.lat, 3.219));
    (m.getSource("site") as GeoJSONSource).setData(FC([cube(spot.lng, spot.lat, 26, live.current.pillarH)]));
    marker.current?.setLngLat([spot.lng, spot.lat]);
  }, [ready, spot, comps, tracts]);

  // the descent (on load and when the street changes), then hand the camera to the scroll
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const S = live.current;
    S.free = false;
    const cam = camAt(progress?.current ?? S.scene);
    // weak devices skip the flight: tiles for the final view are all they should have to load
    if (S.low) m.jumpTo({ center: [spot.lng, spot.lat], ...cam });
    else m.flyTo({ center: [spot.lng, spot.lat], ...cam, duration: 2200, curve: 1.3, essential: true });
    const done = () => {
      S.cur = { zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() };
      S.t0 = performance.now();
      S.free = true;
    };
    if (S.low) {
      done();
      return;
    }
    m.once("moveend", done);
    return () => {
      m.off("moveend", done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spot]);

  // the surveyor's crosshair: real coordinates under the cursor
  useEffect(() => {
    if (!crosshair || !window.matchMedia("(pointer: fine)").matches) return;
    const on = (e: PointerEvent) => {
      if (hLine.current) hLine.current.style.transform = `translateY(${e.clientY}px)`;
      if (vLine.current) vLine.current.style.transform = `translateX(${e.clientX}px)`;
      const m = map.current;
      if (read.current && m) {
        const c = m.unproject([e.clientX, e.clientY]);
        read.current.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`;
        read.current.textContent = `${Math.abs(c.lat).toFixed(4)}° ${c.lat >= 0 ? "N" : "S"}  ${Math.abs(c.lng).toFixed(4)}° ${c.lng >= 0 ? "E" : "W"}`;
      }
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, [crosshair]);

  return (
    <div className="absolute inset-0" aria-hidden>
      <div ref={el} style={{ position: "absolute", inset: 0, opacity: shown ? 1 : 0, transition: "opacity .5s ease-out" }} />
      {crosshair && (
        <div className="pointer-events-none absolute inset-0 hidden overflow-hidden [@media(pointer:fine)]:block">
          <div ref={hLine} className="absolute inset-x-0 top-0 h-px bg-white/45" />
          <div ref={vLine} className="absolute inset-y-0 left-0 w-px bg-white/45" />
          <div ref={read} className="num absolute left-0 top-0 whitespace-pre bg-night px-1.5 py-0.5 text-[12px] text-white" />
        </div>
      )}
    </div>
  );
}
