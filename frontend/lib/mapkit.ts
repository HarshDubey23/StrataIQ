"use client";

/**
 * Map kit: the fire-atlas look shared by every map, plus a lazily
 * loaded deck.gl overlay for real 3D data layers (competitor pillars,
 * population columns, demand arcs). deck.gl is imported on demand so it never
 * runs during server rendering and only ships to pages that draw a map.
 */
import type { IControl, LayerSpecification, Map as MLMap, StyleSpecification } from "maplibre-gl";

export const STYLE_DARK = "https://tiles.openfreemap.org/styles/positron"; // light base, recoloured in enhanceMap
export const STYLE_FALLBACK = "https://tiles.openfreemap.org/styles/liberty";

export const C = {
  you: [242, 201, 76] as [number, number, number],
  youSoft: [242, 201, 76] as [number, number, number],
  comp: [233, 143, 134] as [number, number, number],
  agent: [169, 196, 228] as [number, number, number],
  user: [242, 201, 76] as [number, number, number],
  field: [159, 203, 168] as [number, number, number],
};

export async function pickStyle(): Promise<string> {
  return STYLE_DARK;
}

/**
 * The landing style: the base style's JSON reduced to water, parks and roads in atlas colors, before the map is made.
 * It paints right the first time, and the layers it drops are never decoded.
 */
export async function atlasStyle(): Promise<StyleSpecification | string> {
  try {
    const r = await fetch(STYLE_DARK);
    if (!r.ok) throw new Error("style");
    const s = (await r.json()) as StyleSpecification;
    const keep: LayerSpecification[] = [{ id: "bg", type: "background", paint: { "background-color": BP.field } }];
    for (const l of s.layers) {
      const src = "source-layer" in l ? l["source-layer"] : "";
      if (l.type === "fill" && src === "water") keep.push({ ...l, paint: { "fill-color": BP.water } });
      else if (l.type === "fill" && src === "park") keep.push({ ...l, paint: { "fill-color": BP.park } });
      else if (l.type === "line" && src === "transportation" && !/rail|ferry|aeroway/.test(l.id)) {
        const major = /motorway|trunk|primary|major/.test(l.id);
        keep.push({ ...l, paint: { "line-color": "#ffffff", "line-opacity": major ? 0.75 : 0.34, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 12, major ? 1.2 : 0.4, 16, major ? 7 : 3] } });
      }
    }
    const source = "openmaptiles";
    keep.push(
      { id: "siq-buildings-flat", source, "source-layer": "building", type: "fill", minzoom: 14, layout: { visibility: "none" }, paint: { "fill-color": "#cfe0f5", "fill-outline-color": "#0f1f3d" } },
      { id: "siq-buildings-3d", source, "source-layer": "building", type: "fill-extrusion", minzoom: 14, paint: { "fill-extrusion-color": "#f7f8fa", "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 1, "fill-extrusion-vertical-gradient": false } },
    );
    return { ...s, layers: keep, light: { anchor: "map", color: "#dbe8f7", intensity: 0.16, position: [1.15, 210, 30] }, glyphs: undefined, sprite: undefined };
  } catch {
    return STYLE_FALLBACK;
  }
}

function safe(fn: () => void) {
  try {
    fn();
  } catch {
    /* layer/property absent in this style */
  }
}

/** The atlas ground: blue field, white streets, pale blocks. Pink, yellow and stone are left for data. */
export const BP = { field: "#1d4f91", water: "#163e75", park: "#2a5c9e", line: "#FFFFFF" };

/** Recolor the base style, extrude real OSM building footprints and light them. `labels` keeps street names (app maps). */
export function enhanceMap(m: MLMap, opts: { buildingsMinZoom?: number; buildingOpacity?: number; labels?: boolean } = {}) {
  const layers = m.getStyle().layers || [];
  const minzoom = opts.buildingsMinZoom ?? 12.5;
  for (const l of layers) {
    const id = l.id.toLowerCase();
    if (l.type === "background") safe(() => m.setPaintProperty(l.id, "background-color", BP.field));
    else if (l.type === "fill") {
      if (id.includes("water")) safe(() => m.setPaintProperty(l.id, "fill-color", BP.water));
      else if (id.includes("park") || id.includes("wood") || id.includes("grass")) safe(() => m.setPaintProperty(l.id, "fill-color", BP.park));
      else safe(() => m.setLayoutProperty(l.id, "visibility", "none"));
    } else if (l.type === "line") {
      if (/road|highway|street|tunnel|bridge|path|rail/.test(id)) {
        const major = /motorway|trunk|primary|major/.test(id);
        safe(() => m.setPaintProperty(l.id, "line-color", BP.line));
        safe(() => m.setPaintProperty(l.id, "line-opacity", major ? 0.75 : 0.32));
      } else if (!id.includes("water")) safe(() => m.setLayoutProperty(l.id, "visibility", "none"));
    } else if (l.type === "symbol") {
      if (!opts.labels) safe(() => m.setLayoutProperty(l.id, "visibility", "none"));
      else {
        safe(() => m.setPaintProperty(l.id, "text-color", "#ffffff"));
        safe(() => m.setPaintProperty(l.id, "text-halo-color", BP.field));
        safe(() => m.setPaintProperty(l.id, "text-halo-width", 1.4));
      }
    }
  }
  if (m.getSource("openmaptiles") && !m.getLayer("siq-3d-buildings")) {
    safe(() => m.addLayer({ id: "siq-footprints", source: "openmaptiles", "source-layer": "building", type: "line", minzoom, paint: { "line-color": "#0f1f3d", "line-width": 1, "line-opacity": 0.8 } }));
    safe(() =>
      m.addLayer(
        {
          id: "siq-3d-buildings", source: "openmaptiles", "source-layer": "building", type: "fill-extrusion", minzoom,
          paint: {
            "fill-extrusion-color": "#f7f8fa",
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], minzoom, 0, minzoom + 1.5, ["coalesce", ["get", "render_height"], 6]],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": opts.buildingOpacity ?? 0.9,
            "fill-extrusion-vertical-gradient": false,
          },
        },
        opts.labels ? layers.find((l) => l.type === "symbol")?.id : undefined,
      ),
    );
  }
  safe(() => m.setLight({ anchor: "map", color: "#dbe8f7", intensity: 0.16, position: [1.15, 210, 30] }));
  const anyMap = m as unknown as { setSky?: (s: Record<string, unknown>) => void };
  safe(() =>
    anyMap.setSky?.({
      "sky-color": BP.water, "horizon-color": BP.field, "fog-color": BP.field,
      "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.25, "atmosphere-blend": 0.4,
    }),
  );
}

// ---------------------------------------------------------------- deck.gl overlay
type DeckMods = {
  MapboxOverlay: typeof import("@deck.gl/mapbox").MapboxOverlay;
  layers: typeof import("@deck.gl/layers");
};
let deckMods: Promise<DeckMods> | null = null;
export function loadDeck(): Promise<DeckMods> {
  if (!deckMods) {
    deckMods = Promise.all([import("@deck.gl/mapbox"), import("@deck.gl/layers")]).then(([mb, layers]) => ({
      MapboxOverlay: mb.MapboxOverlay,
      layers,
    }));
  }
  return deckMods;
}

export interface DeckHandle {
  setLayers: (fn: (L: DeckMods["layers"]) => unknown[]) => void;
  setTooltip: (fn: ((info: { object?: unknown }) => string | null) | null) => void;
  destroy: () => void;
}

/** Attach a deck.gl overlay (interleaved, so pillars and buildings occlude each other correctly). */
export async function attachDeck(m: MLMap): Promise<DeckHandle | null> {
  try {
    const mods = await loadDeck();
    let tip: ((info: { object?: unknown }) => string | null) | null = null;
    const overlay = new mods.MapboxOverlay({
      interleaved: true,
      layers: [],
      getTooltip: (info: { object?: unknown }) => {
        const t = tip?.(info);
        return t ? { text: t, style: { background: "#f7f8fa", color: "#0f1f3d", border: "1px solid #0f1f3d", borderRadius: "0", fontSize: "13px", padding: "6px 9px", fontFamily: "var(--font-inter-tight), sans-serif" } } : null;
      },
    } as ConstructorParameters<DeckMods["MapboxOverlay"]>[0]);
    m.addControl(overlay as unknown as IControl);
    return {
      setLayers: (fn) => overlay.setProps({ layers: fn(mods.layers) as never }),
      setTooltip: (fn) => {
        tip = fn;
      },
      destroy: () => {
        try {
          m.removeControl(overlay as unknown as IControl);
        } catch {
          /* already gone */
        }
      },
    };
  } catch (e) {
    console.warn("deck.gl overlay unavailable", e);
    return null;
  }
}

/** Ramp for population columns on the blue ground: stone to white. */
export function popColor(t: number, alpha = 150): [number, number, number, number] {
  const s = Math.max(0, Math.min(1, t));
  return [169 + 78 * s, 196 + 52 * s, 228 + 22 * s, alpha];
}

export function metersPerZoneRadius(spacingKm: number | undefined | null): number {
  return Math.max(60, (spacingKm || 0.3) * 1000 * 0.48);
}
