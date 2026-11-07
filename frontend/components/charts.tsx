"use client";

import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { money, num, CUR } from "@/lib/format";
import type { SimResult } from "@/lib/types";

const AX = { stroke: "#53617a", fontSize: 11 };
const GRID = "#d3dbe5";
const TT = { contentStyle: { background: "#FFFFFF", border: "1px solid #d3dbe5", borderRadius: 6, fontSize: 12 }, labelStyle: { color: "#38465f" } };

function compactMoney(v: number) {
  return money(v, { compact: true }).replace(CUR, "");
}

export function PriceCurve({ data, current, unit }: { data: NonNullable<SimResult["sensitivity"]>["price_curve"]; current: number; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="price" tickFormatter={(v) => `${CUR}${num(v)}`} {...AX} />
        <YAxis yAxisId="p" tickFormatter={compactMoney} {...AX} width={56} />
        <YAxis yAxisId="u" orientation="right" tickFormatter={(v) => num(v)} {...AX} width={44} />
        <Tooltip {...TT} formatter={(v, n) => (String(n) === "units" ? [num(Number(v)), unit] : [money(Number(v)), "Operating profit"])} labelFormatter={(l) => `Price ₹${num(Number(l))}`} />
        <ReferenceLine yAxisId="p" y={0} stroke="#53617a" strokeDasharray="3 3" />
        <ReferenceLine yAxisId="p" x={current} stroke="#0f1f3d" strokeDasharray="4 3" label={{ value: "current", fill: "#0f1f3d", fontSize: 10, position: "top" }} />
        <Line isAnimationActive={false} yAxisId="p" type="monotone" dataKey="profit" stroke="#1d4f91" strokeWidth={2} dot={false} />
        <Line isAnimationActive={false} yAxisId="u" type="monotone" dataKey="units" stroke="#b9c4d2" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function MarketingCurve({ data, current }: { data: NonNullable<SimResult["sensitivity"]>["marketing_curve"]; current: number }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="spend" tickFormatter={(v) => compactMoney(v)} {...AX} />
        <YAxis tickFormatter={compactMoney} {...AX} width={56} />
        <Tooltip {...TT} formatter={(v) => [money(Number(v)), "Operating profit"]} labelFormatter={(l) => `Marketing ${money(Number(l))}/mo`} />
        <ReferenceLine y={0} stroke="#53617a" strokeDasharray="3 3" />
        <ReferenceLine x={current} stroke="#0f1f3d" strokeDasharray="4 3" />
        <Line isAnimationActive={false} type="monotone" dataKey="profit" stroke="#1d4f91" strokeWidth={2} dot={{ r: 2 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function Tornado({ data, base }: { data: NonNullable<SimResult["sensitivity"]>["tornado"]; base: number }) {
  const rows = data.slice(0, 8).map((t) => {
    const lo = Math.min(t.profit_at_low, t.profit_at_high) - base;
    const hi = Math.max(t.profit_at_low, t.profit_at_high) - base;
    return { label: t.label, range: [lo, hi] as [number, number], raw: t };
  });
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 30 + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => (v > 0 ? "+" : "") + compactMoney(v)} {...AX} />
        <YAxis type="category" dataKey="label" width={190} {...AX} tick={{ fill: "#38465f", fontSize: 11 }} />
        <Tooltip
          {...TT}
          formatter={(_v, _n, p) => {
            const r = (p as { payload: (typeof rows)[number] }).payload.raw;
            return [`${money(r.profit_at_low)} at ${r.low_value} · ${money(r.profit_at_high)} at ${r.high_value}`, "Profit range"];
          }}
        />
        <ReferenceLine x={0} stroke="#b9c4d2" />
        <Bar isAnimationActive={false} dataKey="range" fill="#0f1f3d" radius={2}>
          {rows.map((r, i) => <Cell key={i} fill={r.raw.status === "user" ? "#f2c94c" : "#a9c4e4"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Customers and awareness week by week in the simulated market. */
export function RampChart({ data, unit }: { data: { week: number; units: number; aware_share: number }[]; unit: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="week" tickFormatter={(v) => `W${v}`} {...AX} />
        <YAxis yAxisId="u" tickFormatter={(v) => num(v)} {...AX} width={52} />
        <YAxis yAxisId="a" orientation="right" domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}%`} {...AX} width={44} />
        <Tooltip {...TT} formatter={(v, n) => (String(n) === "units" ? [num(Number(v)), unit] : [`${Math.round(Number(v) * 100)}%`, "Aware of you"])} labelFormatter={(v) => `Week ${v}`} />
        <Bar yAxisId="u" dataKey="units" fill="#a9c4e4" isAnimationActive={false} />
        <Line yAxisId="a" dataKey="aware_share" stroke="#0f1f3d" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ProfitHistogram({ mc }: { mc: NonNullable<SimResult["monte_carlo"]> }) {
  const { counts, edges } = mc.histogram;
  const data = counts.map((c, i) => ({ x: ((edges[i] ?? 0) + (edges[i + 1] ?? 0)) / 2, c }));
  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }} barCategoryGap={1}>
        <XAxis dataKey="x" tickFormatter={compactMoney} {...AX} interval="preserveStartEnd" minTickGap={30} />
        <Tooltip {...TT} formatter={(v) => [`${v} draws`, "Count"]} labelFormatter={(l) => `Profit ≈ ${money(Number(l))}`} />
        <Bar isAnimationActive={false} dataKey="c">
          {data.map((d, i) => <Cell key={i} fill={d.x < 0 ? "#e98f86" : "#1d4f91"} fillOpacity={0.8} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
