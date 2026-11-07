/** What this device can carry. Decides before anything heavy loads; the map can still step down later. */
export type Tier = "full" | "lite" | "atlas";

export function deviceTier(): Tier {
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const mem = n.deviceMemory ?? 8;
  const cores = n.hardwareConcurrency ?? 8;
  const save = n.connection?.saveData || /2g/.test(n.connection?.effectiveType ?? "");
  let gl = false;
  try {
    gl = !!document.createElement("canvas").getContext("webgl2");
  } catch {
    gl = false;
  }
  if (!gl || save || mem <= 2 || cores <= 2) return "atlas";
  const phone = window.matchMedia("(pointer: coarse)").matches;
  // a phone's cores say little about its GPU, and 3D buildings cost the most: phones start without them
  if (phone || mem <= 4 || cores <= 4 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "lite";
  return "full";
}
