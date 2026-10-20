import { Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { segundosLegibles } from "@/lib/fechas";
import type { GrupoKpis } from "@/lib/supervision";
import type { KpiCampaniaHoy } from "@/lib/rdb/types";
import { cn } from "@/lib/utils";

// ============================================================
// Tabla de campañas de Supervisión (Tiempo real e Histórico): una fila por
// campaña y, si el cliente tiene tipos de campaña (Bolsas: cartera; GH:
// BBDD), agrupada por tipo con el total de cada grupo (lib/supervision.ts).
// Sin hooks: sirve en el panel de cliente (Tiempo real) y en el de servidor.
// ============================================================

function colorSla(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 font-semibold";
  if (pct >= 60) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

const COLUMNAS = 9;

function Celdas({ k }: { k: KpiCampaniaHoy }) {
  // Abandono: entrantes abandonadas / entrantes recibidas (regla 6.b)
  const pctAb = k.recibidas > 0 ? (k.abandonadasInbound / k.recibidas) * 100 : 0;
  return (
    <>
      <TableCell className="text-right tabular-nums">{k.recibidas.toLocaleString("es-ES")}</TableCell>
      <TableCell className="text-right tabular-nums">{k.atendidas.toLocaleString("es-ES")}</TableCell>
      <TableCell className="text-right tabular-nums text-emerald-700">{k.exitos.toLocaleString("es-ES")}</TableCell>
      <TableCell className={cn("text-right tabular-nums", pctAb >= 10 && "font-semibold text-red-600")}>
        {pctAb.toFixed(1)} %
      </TableCell>
      <TableCell className="text-right tabular-nums">{segundosLegibles(k.colaMediaSeg)}</TableCell>
      <TableCell className="text-right tabular-nums">{segundosLegibles(k.esperaAbandonadasSeg)}</TableCell>
      <TableCell className="text-right tabular-nums">{segundosLegibles(k.ahtSeg)}</TableCell>
      <TableCell className={cn("text-right tabular-nums", colorSla(k.slaPct))}>
        {k.slaPct != null ? `${k.slaPct.toFixed(1)} %` : "—"}
      </TableCell>
    </>
  );
}

export function TablaKpisCampania({ grupos, vacio }: { grupos: GrupoKpis[]; vacio: string }) {
  const agrupada = grupos.some((g) => g.nombre != null);
  const hayFilas = grupos.some((g) => g.kpis.length > 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Campaña</TableHead>
          <TableHead className="text-right">Recibidas</TableHead>
          <TableHead className="text-right">Atendidas</TableHead>
          <TableHead className="text-right">Éxitos</TableHead>
          <TableHead className="text-right">Abandono</TableHead>
          <TableHead className="text-right">Cola media</TableHead>
          <TableHead className="text-right">Espera aband.</TableHead>
          <TableHead className="text-right">AHT</TableHead>
          <TableHead className="text-right">SLA</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {!hayFilas ? (
          <TableRow>
            <TableCell colSpan={COLUMNAS} className="text-center text-muted-foreground">
              {vacio}
            </TableCell>
          </TableRow>
        ) : (
          grupos.map((g) => (
            <Fragment key={g.nombre ?? "todas"}>
              {agrupada ? (
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell colSpan={COLUMNAS} className="text-xs font-semibold uppercase tracking-wide">
                    {g.nombre} · {g.kpis.length} {g.kpis.length === 1 ? "campaña" : "campañas"}
                  </TableCell>
                </TableRow>
              ) : null}
              {g.kpis.map((k) => (
                <TableRow key={k.campania}>
                  <TableCell className={cn("font-medium", agrupada && "pl-4")}>{k.campania}</TableCell>
                  <Celdas k={k} />
                </TableRow>
              ))}
              {agrupada ? (
                <TableRow className="border-b-2 font-semibold">
                  <TableCell>{g.total.campania}</TableCell>
                  <Celdas k={g.total} />
                </TableRow>
              ) : null}
            </Fragment>
          ))
        )}
      </TableBody>
    </Table>
  );
}
