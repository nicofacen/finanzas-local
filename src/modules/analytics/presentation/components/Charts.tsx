"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compactCurrency, fullCurrency } from "@/shared/presentation/components/Money";

const axis = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />;
const tooltipStyle = {
  contentStyle: {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--foreground)",
  },
  labelStyle: { color: "var(--muted-foreground)", marginBottom: 4 },
  itemStyle: { color: "var(--foreground)" },
};
const fmt = (v: unknown) => (typeof v === "number" ? fullCurrency(v) : "—");

/** Ritmo de gasto: acumulado real vs línea ideal (misma escala, un solo eje). */
export function PaceChart({ data }: { data: { day: number; actual: number | null; ideal: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="day" {...axis} interval={4} tickFormatter={(d) => `${d}`} />
        <YAxis {...axis} width={56} tickFormatter={compactCurrency} />
        <Tooltip {...tooltipStyle} formatter={fmt} labelFormatter={(d) => `Día ${d}`} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Line type="linear" dataKey="ideal" name="Ritmo ideal" stroke="var(--series-ref)" strokeWidth={2} strokeDasharray="5 4" dot={false} />
        <Area
          type="monotone"
          dataKey="actual"
          name="Gastado acumulado"
          stroke="var(--series-1)"
          strokeWidth={2}
          fill="var(--series-1)"
          fillOpacity={0.12}
          connectNulls={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Ingresos vs gastos por mes (barras agrupadas, misma escala). */
export function FlowsChart({ data }: { data: { label: string; income: number; expenses: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
        {grid}
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={56} tickFormatter={compactCurrency} />
        <Tooltip {...tooltipStyle} formatter={fmt} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="income" name="Ingresos" fill="var(--series-1)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="expenses" name="Gastos" fill="var(--series-2)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Magnitud por categoría: barras horizontales de un solo tono. */
export function CategoryBars({ data }: { data: { name: string; value: number }[] }) {
  const rows = data.slice(0, 8);
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, rows.length * 34)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" {...axis} width={110} />
        <Tooltip {...tooltipStyle} formatter={fmt} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        <Bar dataKey="value" name="Gastado" fill="var(--series-1)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Proyección de cuotas futuras (un solo tono). */
export function ProjectionBars({ data }: { data: { label: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        {grid}
        <XAxis dataKey="label" {...axis} />
        <YAxis {...axis} width={56} tickFormatter={compactCurrency} />
        <Tooltip {...tooltipStyle} formatter={fmt} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
        <Bar dataKey="amount" name="Cuotas a pagar" fill="var(--series-2)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
