/**
 * Address suggestions while someone types, from Photon (OpenStreetMap), called from the browser because cloud servers
 * cannot reach it. Photon allows search-as-you-type; Nominatim's usage policy does not.
 */
export type Place = { label: string; lat: number; lng: number };

type PhotonFeature = { geometry?: { coordinates?: number[] }; properties?: Record<string, string | undefined> };

/** US results only, one line each, no repeats. */
export function parseSuggestions(features: PhotonFeature[], limit = 6): Place[] {
  const out: Place[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const c = f.geometry?.coordinates;
    if ((p.countrycode ?? "").toUpperCase() !== "US" || !c || c.length < 2) continue;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const first = street || p.name || "";
    const city = p.city || p.county || "";
    const label = [first, city === first ? "" : city, p.state].filter(Boolean).join(", ");
    if (label && !out.some((x) => x.label === label)) out.push({ label, lat: c[1], lng: c[0] });
    if (out.length === limit) break;
  }
  return out;
}

const memory = new Map<string, Place[]>();

export async function suggestPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  const key = q.toLowerCase().replace(/\s+/g, " ").trim();
  const hit = memory.get(key);
  if (hit) return hit;
  // the box keeps results to the US and territories, so a short query is not used up by the rest of the world
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(key)}&limit=12&lang=en&bbox=-171,18,-65,72`, { signal });
  if (!r.ok) return [];
  const places = parseSuggestions((await r.json()).features ?? []);
  memory.set(key, places);
  return places;
}
