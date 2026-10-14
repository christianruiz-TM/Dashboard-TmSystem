"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface SerieLinea {
  clave: string;
  nombre: string;
  color: string; // admite var(--chart-1)
  /** Línea discontinua: segunda codificación además del color. */
  discontinua?: boolean;
}

/** Línea horizontal fija (un objetivo), en el mismo eje. */
export interface ReferenciaLinea {
  valor: number;
  etiqueta: string;
  color: string;
}

/**
 * Gráfica de líneas genérica (tendencias por fecha). `sufijo` (p. ej. " %")
 * muestra los valores con 2 decimales y esa unidad en el eje y en el tooltip.
 */
export function GraficaLineas({
  datos,
  ejeX,
  series,
  alto = 280,
  sufijo,
  referencias = [],
}: {
  datos: Record<string, unknown>[];
  ejeX: string;
  series: SerieLinea[];
  alto?: number;
  sufijo?: string;
  referencias?: ReferenciaLinea[];
}) {
  const formato = sufijo
    ? (v: unknown) =>
        typeof v === "number"
          ? `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${sufijo}`
          : String(v ?? "—")
    : undefined;
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
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          width={sufijo ? 56 : 48}
          tickFormatter={sufijo ? (v: number) => `${v.toLocaleString("es-ES")}${sufijo}` : undefined}
        />
        <Tooltip
          formatter={formato}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {referencias.map((r) => (
          <ReferenceLine
            key={r.etiqueta}
            y={r.valor}
            stroke={r.color}
            strokeDasharray="2 4"
            label={{ value: r.etiqueta, position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        ))}
        {series.map((s) => (
          <Line
            key={s.clave}
            type="monotone"
            dataKey={s.clave}
            name={s.nombre}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.discontinua ? "6 4" : undefined}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
