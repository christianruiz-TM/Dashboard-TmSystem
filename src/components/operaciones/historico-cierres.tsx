import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CierreRow } from "@/lib/db/facturacion";
import type { UnidadFacturacion } from "@/lib/db/schema";
import { mesesDelRango } from "@/lib/ddis";
import { NOMBRE_CORTO_UNIDAD, NOMBRE_UNIDAD, ORDEN_UNIDADES } from "@/lib/facturacion-campania";
import { cantidadLegible, euros } from "./tabla-factura";

/** Línea de un cierre para el histórico (ya con los ajustes manuales aplicados). */
type LineaHistorico = { cierreId: number; unidad: UnidadFacturacion; cantidad: number; importe: number | null };

/** Meses cerrados (y el histórico importado del Excel): totales por unidad. */
export function HistoricoCierres({ cierres, lineas }: { cierres: CierreRow[]; lineas: LineaHistorico[] }) {
  if (cierres.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Todavía no hay meses cerrados. Para cerrar uno, elige un cliente y el mes completo en «Facturación».
      </p>
    );
  }
  const porCierre = new Map<number, Map<string, { cantidad: number; importe: number }>>();
  for (const l of lineas) {
    const totales = porCierre.get(l.cierreId) ?? new Map<string, { cantidad: number; importe: number }>();
    const t = totales.get(l.unidad) ?? { cantidad: 0, importe: 0 };
    t.cantidad += l.cantidad;
    t.importe += l.importe ?? 0;
    totales.set(l.unidad, t);
    porCierre.set(l.cierreId, totales);
  }
  const unidades = ORDEN_UNIDADES.filter((u) => lineas.some((l) => l.unidad === u));
  const red = (v: number) => Math.round(v * 100) / 100;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Mes</TableHead>
          <TableHead>Cliente</TableHead>
          {unidades.map((u) => (
            <TableHead key={u} colSpan={2} className="text-center" title={NOMBRE_UNIDAD[u]}>
              {NOMBRE_CORTO_UNIDAD[u]}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Cerrado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cierres.map((c) => {
          const totales = porCierre.get(c.id);
          const { inicio, fin } = mesesDelRango(`${c.mes}-01`, `${c.mes}-01`)[0];
          const url = `/operaciones?servicio=${encodeURIComponent(c.servicio)}&desde=${inicio}&hasta=${fin}`;
          return (
            <TableRow key={c.id}>
              <TableCell className="font-medium tabular-nums">
                <a href={url} className="underline-offset-2 hover:underline">
                  {c.mes}
                </a>
              </TableCell>
              <TableCell>{c.servicio}</TableCell>
              {unidades.map((u) => {
                const t = totales?.get(u);
                return [
                  <TableCell key={`${u}c`} className="text-right tabular-nums">
                    {t ? cantidadLegible(u, red(t.cantidad)) : ""}
                  </TableCell>,
                  <TableCell key={`${u}i`} className="text-right tabular-nums text-muted-foreground">
                    {t ? euros(red(t.importe)) : ""}
                  </TableCell>,
                ];
              })}
              <TableCell className="text-right font-medium tabular-nums">{euros(c.importeTotal)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {c.origen === "importado" ? (
                  <Badge variant="secondary" className="text-[10px]">
                    Excel de operaciones
                  </Badge>
                ) : (
                  <>
                    {c.cerradoPor} · {c.cerradoAt.toLocaleDateString("es-ES")}
                  </>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
