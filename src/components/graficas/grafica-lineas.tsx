"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SerieLinea {
  clave: string;
  nombre: string;
  color: string; // admite var(--chart-1)
}

/** Gráfica de líneas genérica (tendencias por fecha). */
export function GraficaLineas({
  datos,
  ejeX,
  series,
  alto = 280,
}: {
  datos: Record<string, unknown>[];
  ejeX: string;
  series: SerieLinea[];
  alto?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <LineChart data={datos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey={ejeX}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          tickMargin={6}
        />
        <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={48} />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Line
            key={s.clave}
            type="monotone"
            dataKey={s.clave}
            name={s.nombre}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
