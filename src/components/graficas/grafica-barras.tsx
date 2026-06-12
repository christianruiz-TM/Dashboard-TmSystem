"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SerieBarra {
  clave: string;
  nombre: string;
  color: string;
  apilada?: boolean;
}

/** Gráfica de barras genérica (rankings, volúmenes). */
export function GraficaBarras({
  datos,
  ejeX,
  series,
  alto = 280,
  horizontal = false,
}: {
  datos: Record<string, unknown>[];
  ejeX: string;
  series: SerieBarra[];
  alto?: number;
  horizontal?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart
        data={datos}
        layout={horizontal ? "vertical" : "horizontal"}
        margin={{ top: 8, right: 12, bottom: 0, left: horizontal ? 24 : 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
            <YAxis
              type="category"
              dataKey={ejeX}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              width={110}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={ejeX}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              tickMargin={6}
            />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={48} />
          </>
        )}
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.map((s) => (
          <Bar
            key={s.clave}
            dataKey={s.clave}
            name={s.nombre}
            fill={s.color}
            stackId={s.apilada ? "apilada" : undefined}
            radius={[2, 2, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
