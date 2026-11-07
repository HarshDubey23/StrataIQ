"use client";

/**
 * The landing city, one continuous shot over the real street.
 *
 * Real: buildings, roads, rival locations and the population column on each Census tract.
 * Drawn: the crowd in the decision scene. People are placed from real tract counts along real roads, but who chooses
 * whom here only shows how the simulation works. The page says so where it appears.
 *
 * `progress` (a ref, so scrolling never re-renders React) scrubs the camera and the decision wave.
 * Scenes: 0 your address  1 rivals rise  2 the Census  3 customers decide  4 what has to be true
 */
import maplibregl, { type Map as MLMap } from "maplibre-gl";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { attachDeck, enhanceMap, pickStyle, type DeckHandle } from "@/lib/mapkit";
import type { PreviewComp, Spot } from "./spots";

export type { Spot, PreviewComp };
export interface Tract {
  lat: number;
  lng: number;
  people: number;
}

type Cam = { zoom: number; pitch: number; bearing: number };
const CAMERAS: Cam[] = [
  { zoom: 15.3, pitch: 62, bearing: -30 },
  { zoom: 15.6, pitch: 50, bearing: 10 },
  { zoom: 14.1, pitch: 58, bearing: 40 },
  { zoom: 14.9, pitch: 66, bearing: 95 },
  { zoom: 14.3, pitch: 48, bearing: 170 },
];

type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const YOU: RGB = [242, 201, 76];
const BRICK: RGB = [233, 143, 134];
const STONE: RGB = [207, 224, 245];
const INK: [number, number, number, number] = [15, 31, 61, 255];
// full ambient, no shading: printed color, not lit plastic
const FLAT = { ambient: 1, diffuse: 0, shininess: 0, specularColor: [0, 0, 0] as RGB };
const rgba = (c: RGB, a: number) => [c[0], c[1], c[2], a] as [number, number, number, number];

function rand(seed: number) {
  let s = Math.abs(Math.round(seed)) % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

interface Person {
  home: [number, number];
  choice: "you" | "rival" | "none";
  /** km from the site: the decision wave reaches nearer people first */
  d: number;
  path: [number, number][];
  ts: number[];
}

/** Points along the roads that are currently loaded. */
function roadPoints(m: MLMap): [number, number][] {
  const out: [number, number][] = [];
  try {
    for (const f of m.querySourceFeatures("openmaptiles", { sourceLayer: "transportation" })) {
      const c = f.properties?.class;
      if (c === "motorway" || c === "rail" || c === "transit" || c === "trunk") continue;
      const lines = f.geometry.type === "LineString" ? [f.geometry.coordinates] : f.geometry.type === "MultiLineString" ? f.geometry.coordinates : [];
      for (const l of lines) {
        for (let i = 1; i < l.length; i++) {
          const [a, b] = [l[i - 1], l[i]];
          out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [a[0], a[1]]);
        }
      }
    }
  } catch {
    /* source not ready: people fall back to their tract */
  }
  return out;
}

/** The crowd: placed by real tract counts, on real roads once they have loaded. Their choices are illustrative. */
function makePeople(spot: Spot, comps: PreviewComp[], tracts: Tract[], roads: [number, number][], n = 2400): Person[] {
  const r = rand(spot.lat * 1e4 + spot.lng * 1e3 + comps.length);
  const dests = [{ lat: spot.lat, lng: spot.lng, you: true }, ...comps.slice(0, 60).map((c) => ({ lat: c.lat, lng: c.lng, you: false }))];
  const kmLat = 1 / 111.32;
  const kmLng = 1 / (111.32 * Math.cos((spot.lat * Math.PI) / 180));
  const total = tracts.reduce((s, t) => s + t.people, 0);
  const pick = (): [number, number] => {
    let x = spot.lng;
    let y = spot.lat;
    if (total > 0) {
      let u = r() * total;
      const t = tracts.find((k) => (u -= k.people) <= 0) ?? tracts[0];
      x = t.lng + (r() - 0.5) * 1.1 * kmLng;
      y = t.lat + (r() - 0.5) * 1.1 * kmLat;
    } else {
      const a = r() * Math.PI * 2;
      const d = 0.12 + Math.pow(r(), 0.7) * 1.7;
      x += Math.cos(a) * d * kmLng;
      y += Math.sin(a) * d * kmLat;
    }
    if (!roads.length) return [x, y];
    // the nearest of a few random road points keeps this fast and on a street
    let best = roads[Math.floor(r() * roads.length)];
    let bd = Infinity;
    for (let i = 0; i < 40; i++) {
      const c = roads[Math.floor(r() * roads.length)];
      const dd = Math.hypot(c[0] - x, c[1] - y);
      if (dd < bd) {
        bd = dd;
        best = c;
      }
    }
    return [best[0], best[1]];
  };
  const out: Person[] = [];
  for (let i = 0; i < n; i++) {
    const home = pick();
    let best = dests[0];
    let bs = Infinity;
    for (const dst of dests) {
      const dd = Math.hypot((dst.lng - home[0]) / kmLng, (dst.lat - home[1]) / kmLat) * (0.6 + r() * 0.9) * (dst.you ? 0.8 : 1);
      if (dd < bs) {
        bs = dd;
        best = dst;
      }
    }
    const none = r() < 0.35 || bs > 1.1 + r() * 0.6;
    const mid: [number, number] = r() < 0.5 ? [best.lng, home[1]] : [home[0], best.lat];
    const t0 = r() * 1000;
    const dur = 120 + bs * 90;
    out.push({
      home,
      d: Math.hypot((home[0] - spot.lng) / kmLng, (home[1] - spot.lat) / kmLat),
      choice: none ? "none" : best.you ? "you" : "rival",
      path: none ? [] : [home, mid, [best.lng, best.lat]],
      ts: none ? [] : [t0, t0 + dur * 0.5, t0 + dur],
    });
  }
  return out;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function camAt(p: number): Cam {
  const i = Math.max(0, Math.min(CAMERAS.length - 1, Math.floor(p)));
  const j = Math.min(CAMERAS.length - 1, i + 1);
  const k = smooth(clamp01(p - i));
  const a = CAMERAS[i];
  const b = CAMERAS[j];
  return { zoom: a.zoom + (b.zoom - a.zoom) * k, pitch: a.pitch + (b.pitch - a.pitch) * k, bearing: a.bearing + (b.bearing - a.bearing) * k };
}

export default function HeroMap({ spot, comps, tracts = [], scene = 0, progress, crosshair = false, active = true, pillar = 1 }: { spot: Spot; comps: PreviewComp[]; tracts?: Tract[]; scene?: number; progress?: MutableRefObject<number>; crosshair?: boolean; active?: boolean; pillar?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const deck = useRef<DeckHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [shown, setShown] = useState(false);
  const [roads, setRoads] = useState<[number, number][]>([]);
  const hLine = useRef<HTMLDivElement>(null);
  const vLine = useRef<HTMLDivElement>(null);
  const read = useRef<HTMLDivElement>(null);
  // stable arrays: a new array each frame would restart every transition forever
  const roadsFor = useRef<Spot | null>(null);
  const site = useRef<Spot[]>([spot]);
  if (site.current[0] !== spot) site.current = [spot];
  const state = useRef({ spot, comps, tracts, scene, active, pillar, people: [] as Person[], walkers: [] as Person[], trips: [] as Person[], tripBucket: -1, free: false, riseAt: 0, riseFor: null as PreviewComp[] | null, cur: CAMERAS[0] as Cam, t0: 0, lastT: 0, lastSig: "", frames: 0, slow: 0, low: false });
  state.current.spot = spot;
  state.current.comps = comps;
  state.current.tracts = tracts;
  state.current.scene = scene;
  state.current.active = active;
  state.current.pillar = pillar;

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    (async () => {
      const style = await pickStyle();
      if (cancelled || !el.current) return;
      let m: MLMap;
      try {
        // start high and flat; the first flight is the descent into the street
        m = new maplibregl.Map({
          container: el.current, style, center: [spot.lng, spot.lat], zoom: 14.05, pitch: 0, bearing: -80, interactive: false,
          attributionControl: { compact: true }, maxPitch: 80, fadeDuration: 0, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
        });
      } catch {
        return;
      }
      map.current = m;
      // the story's words sit on the left, so the site stays in the open part of the map
      if (window.innerWidth >= 1024) m.setPadding({ left: Math.min(620, window.innerWidth * 0.42), top: 0, right: 0, bottom: 0 });
      if (crosshair) m.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "top-right");
      let painted = false;
      const paint = () => {
        if (painted || !m.isStyleLoaded()) return;
        painted = true;
        enhanceMap(m, { buildingsMinZoom: 13, buildingOpacity: 1 });
        requestAnimationFrame(() => setShown(true));
      };
      m.on("styledata", paint);
      // reading road geometry is slow, so it happens once a street, after the map has settled, when the browser is free
      m.on("idle", () => {
        if (roadsFor.current === state.current.spot) return;
        const forSpot = state.current.spot;
        const later = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200));
        later(() => {
          const pts = roadPoints(m);
          if (pts.length > 200) {
            roadsFor.current = forSpot;
            setRoads(pts.length > 8000 ? pts.filter((_, i) => i % Math.ceil(pts.length / 8000) === 0) : pts);
          }
        });
      });
      m.on("load", async () => {
        paint();
        const d = await attachDeck(m);
        if (cancelled) return;
        deck.current = d;
        setReady(true);
        const loop = (now: number) => {
          const S = state.current;
          // nothing draws while solid sections cover the map
          if (!S.active) {
            S.lastT = now;
            raf = requestAnimationFrame(loop);
            return;
          }
          const dt = Math.min(100, now - (S.lastT || now));
          S.lastT = now;
          // a weak GPU drops the extras, never the story
          S.frames++;
          if (dt > 30) S.slow++;
          if (!S.low && S.frames === 240 && S.slow > 72) {
            S.low = true;
            m.setPixelRatio(1);
          }
          const p = progress?.current ?? S.scene;
          if (S.free && !m.isMoving()) {
            const target = camAt(p);
            const c = S.cur;
            // damped by time, not frames, so the camera moves at one speed on any machine
            const k = 1 - Math.exp(-dt / 130);
            S.cur = { zoom: c.zoom + (target.zoom - c.zoom) * k, pitch: c.pitch + (target.pitch - c.pitch) * k, bearing: c.bearing + (target.bearing - c.bearing) * k };
            // a slow drift keeps the city alive when the page is still
            m.jumpTo({ center: [S.spot.lng, S.spot.lat], zoom: S.cur.zoom, pitch: S.cur.pitch, bearing: S.cur.bearing + (S.low ? 0 : (now - S.t0) * 0.0014) });
          }
          const sc = S.scene;
          const showPeople = sc >= 3;
          if (S.riseFor !== S.comps) {
            S.riseFor = S.comps;
            S.riseAt = now;
          }
          const riseAge = now - S.riseAt;
          const riseStep = riseAge < 3200 ? Math.round(riseAge / 33) : -1;
          // scrolling through the scene is what makes people decide, nearest first
          const reachStep = Math.round(clamp01(p - 2.6) * 24);
          const reach = (reachStep / 24) * 3.2;
          const bucket = Math.ceil(reach * 3);
          // the trips only change when the wave reaches a new ring: rebuilding them every frame froze the page
          if (bucket !== S.tripBucket) {
            S.tripBucket = bucket;
            S.trips = S.walkers.filter((x) => x.d <= bucket / 3);
          }
          const kmLat = 111.32;
          const kmLng = 111.32 * Math.cos((S.spot.lat * Math.PI) / 180);
          // layers rebuild only when something changed; animated parts tick at 30 or 15 a second
          const sig = `${sc}|${riseStep}|${reachStep}|${S.comps.length}|${S.tracts.length}|${S.pillar}|${S.spot.lat}|${S.people.length}|${showPeople ? Math.floor(now / 33) : S.low ? 0 : Math.floor(now / 66)}`;
          if (sig === S.lastSig) {
            raf = requestAnimationFrame(loop);
            return;
          }
          S.lastSig = sig;
          const t = (now / 22) % 1400;
          const pulse = S.low ? 0 : (now / 12) % 260;
          const tMax = S.tracts.reduce((x, y) => Math.max(x, y.people), 1);
          const color = (x: Person) => (x.d > reach ? rgba(STONE, 150) : x.choice === "you" ? rgba(YOU, 255) : x.choice === "rival" ? rgba(WHITE, 255) : rgba(STONE, 90));
          d?.setLayers((DL) => [
            new DL.ScatterplotLayer({
              id: "catchment", data: site.current, getPosition: (s: Spot) => [s.lng, s.lat], radiusUnits: "meters",
              getRadius: sc === 1 || sc === 2 || sc === 4 ? 3219 : 0, getFillColor: rgba(WHITE, 14), getLineColor: rgba(WHITE, 230), stroked: true, lineWidthMinPixels: 2,
              transitions: { getRadius: { duration: 1400, easing: easeOut } }, updateTriggers: { getRadius: sc },
            }),
            new DL.ColumnLayer({
              id: "tracts", data: S.tracts, diskResolution: 4, angle: 45, radius: 150, extruded: true, wireframe: true, material: FLAT,
              getPosition: (x: Tract) => [x.lng, x.lat], getElevation: (x: Tract) => (sc === 2 ? 40 + (x.people / tMax) * 620 : 0),
              getFillColor: rgba(BRICK, sc === 2 ? 255 : 0), getLineColor: [15, 31, 61, sc === 2 ? 255 : 0],
              transitions: { getElevation: { duration: 1300, easing: easeOut } }, updateTriggers: { getElevation: [sc, tMax], getFillColor: sc === 2, getLineColor: sc === 2 },
            }),
            showPeople && new DL.TripsLayer({
              id: "trips", data: S.trips, getPath: (x: Person) => x.path, getTimestamps: (x: Person) => x.ts,
              getColor: (x: Person) => (x.choice === "you" ? YOU : WHITE), widthMinPixels: 2.5, trailLength: 90, currentTime: t, fadeTrail: true, capRounded: true, jointRounded: true, opacity: sc === 4 ? 0.45 : 0.95,
            }),
            new DL.ScatterplotLayer({
              id: "people", data: S.people, getPosition: (x: Person) => x.home, radiusUnits: "meters", radiusMinPixels: showPeople ? 2.5 : 0,
              getRadius: showPeople ? 16 : 0, getFillColor: color, stroked: false,
              transitions: { getRadius: { duration: 900, easing: easeOut } }, updateTriggers: { getRadius: showPeople, getFillColor: reachStep },
            }),
            new DL.ColumnLayer({
              id: "comps", data: S.comps, diskResolution: 4, angle: 45, radius: 16, extruded: true, wireframe: true, material: FLAT,
              getPosition: (c: PreviewComp) => [c.lng, c.lat],
              // each rival rises in turn, spreading out from your site
              getElevation: (c: PreviewComp) => {
                const km = Math.hypot((c.lat - S.spot.lat) * kmLat, (c.lng - S.spot.lng) * kmLng);
                return (sc === 1 ? 150 : 90) * easeOut(clamp01((riseAge - 300 - km * 900) / 700));
              },
              getFillColor: rgba(BRICK, 255), getLineColor: INK, updateTriggers: { getElevation: [riseStep, sc === 1] },
            }),
            new DL.ScatterplotLayer({
              id: "site-ring", data: site.current, getPosition: (s: Spot) => [s.lng, s.lat], radiusUnits: "meters",
              getRadius: 60 + pulse, getFillColor: [0, 0, 0, 0], getLineColor: rgba(YOU, Math.max(0, 255 - pulse * 0.98)),
              stroked: true, filled: false, lineWidthMinPixels: 3, updateTriggers: { getRadius: now, getLineColor: now },
            }),
            new DL.ColumnLayer({
              id: "site", data: site.current, diskResolution: 4, angle: 45, radius: 42, extruded: true, wireframe: true, material: FLAT,
              getPosition: (s: Spot) => [s.lng, s.lat], getElevation: sc === 4 ? 200 + 330 * S.pillar : 420, getFillColor: rgba(YOU, 255), getLineColor: INK,
              transitions: { getElevation: { duration: 500, easing: easeOut, enter: () => [0] } }, updateTriggers: { getElevation: [sc === 4, S.pillar] },
            }),
          ].filter(Boolean));
          raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      });
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      deck.current?.destroy();
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const people = makePeople(spot, comps, tracts, roads);
    state.current.people = people;
    state.current.walkers = people.filter((p) => p.choice !== "none");
    state.current.tripBucket = -1;
  }, [spot, comps, tracts, roads]);

  // a new street throws away the old street's roads
  useEffect(() => {
    roadsFor.current = null;
    setRoads([]);
  }, [spot]);

  // the descent (on load and when the street changes), then hand the camera to the scroll
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const S = state.current;
    S.free = false;
    const cam = camAt(progress?.current ?? S.scene);
    m.flyTo({ center: [spot.lng, spot.lat], ...cam, duration: 2600, curve: 1.3, essential: true });
    const done = () => {
      S.cur = { zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() };
      S.t0 = performance.now();
      S.free = true;
    };
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
      <div ref={el} style={{ position: "absolute", inset: 0, opacity: shown ? 1 : 0, transition: "opacity 1.2s cubic-bezier(.16,1,.3,1)" }} />
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
