export interface Spot {
  key: string;
  label: string;
  lat: number;
  lng: number;
}
export interface PreviewComp {
  name: string;
  lat: number;
  lng: number;
  ref: string;
}

export const SPOTS: Spot[] = (process.env.NEXT_PUBLIC_MARKET ?? "US") === "US" ? [
  { key: "austin", label: "Downtown Austin, Texas", lat: 30.2672, lng: -97.7431 },
  { key: "miami", label: "Wynwood, Miami, Florida", lat: 25.8005, lng: -80.199 },
  { key: "phoenix", label: "Downtown Phoenix, Arizona", lat: 33.4484, lng: -112.074 },
] : [
  { key: "cp-delhi", label: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167 },
  { key: "indiranagar", label: "Indiranagar, Bengaluru", lat: 12.9719, lng: 77.6412 },
  { key: "bandra", label: "Bandra West, Mumbai", lat: 19.0596, lng: 72.8295 },
];
