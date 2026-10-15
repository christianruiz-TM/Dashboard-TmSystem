import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UnidadFacturacion } from "@/lib/db/schema";
import {
  NOMBRE_CORTO_UNIDAD,
  NOMBRE_UNIDAD,
  etiquetaCampania,
  totalesFactura,
  type FilaFactura,
} from "@/lib/facturacion-campania";
import { horasLegibles } from "@/lib/fechas";

export function euros(importe: number | null | undefined): string {
  if (importe == null) return "—";
  return importe.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

/** Cantidad con la unidad que toca: horas a «8,53 h», minutos a 2 decimales, el resto enteros. */
export function cantidadLegible(unidad: UnidadFacturacion, cantidad: number): string {
  if (unidad === "horas" || unidad === "horas_logadas") return horasLegibles(cantidad);
  if (unidad === "minutos_fijo" || unidad === "minutos_movil") {
    return cantidad.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return cantidad.toLocaleString("es-ES");
}

/**
 * La factura por campaña: cantidad e importe de cada unidad que se cobra,
 * código de GS y total. Es la hoja «FACTURACION» del Excel de operaciones.
 */
export function TablaFactura({ filas, conServicio }: { filas: FilaFactura[]; conServicio: boolean }) {
  const totales = totalesFactura(filas);
  const unidades = totales.porUnidad.map((t) => t.unidad);
  if (filas.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nada que facturar en el período: no hay unidades configuradas con actividad.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {conServicio && <TableHead>Cliente</TableHead>}
          <TableHead>Campaña</TableHead>
          <TableHead>Cód. GS</TableHead>
          {unidades.map((u) => (
            <TableHead key={u} colSpan={2} className="text-center" title={NOMBRE_UNIDAD[u]}>
              {NOMBRE_CORTO_UNIDAD[u]}
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((f) => (
          <TableRow key={`${f.servicio}|${etiquetaCampania(f)}`}>
            {conServicio && <TableCell className="text-muted-foreground">{f.servicio ?? "—"}</TableCell>}
            <TableCell className={f.campania == null ? "italic text-muted-foreground" : "font-medium"}>
              {etiquetaCampania(f)}
            </TableCell>
            <TableCell className="tabular-nums">
              {f.codigoGs ?? <span className="text-xs text-amber-700 dark:text-amber-400">sin código</span>}
            </TableCell>
            {unidades.map((u) => {
              const l = f.lineas.find((x) => x.unidad === u);
              return [
                <TableCell key={`${u}c`} className="text-right tabular-nums">
                  {l ? cantidadLegible(u, l.cantidad) : ""}
                </TableCell>,
                <TableCell key={`${u}i`} className="text-right tabular-nums text-muted-foreground">
                  {l ? euros(l.importe) : ""}
                </TableCell>,
              ];
            })}
            <TableCell className="text-right font-medium tabular-nums">{euros(f.importeTotal)}</TableCell>
          </TableRow>
        ))}
        <TableRow className="font-medium">
          <TableCell colSpan={conServicio ? 3 : 2}>Total</TableCell>
          {totales.porUnidad.map((t) => [
            <TableCell key={`${t.unidad}c`} className="text-right tabular-nums">
              {cantidadLegible(t.unidad, t.cantidad)}
            </TableCell>,
            <TableCell key={`${t.unidad}i`} className="text-right tabular-nums">
              {euros(t.importe)}
            </TableCell>,
          ])}
          <TableCell className="text-right tabular-nums">{euros(totales.importe)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
