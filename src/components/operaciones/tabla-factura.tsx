import { Fragment } from "react";
import { BotonOrden, CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
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
  ARTICULO_GS,
  NOMBRE_CORTO_UNIDAD,
  NOMBRE_UNIDAD,
  agruparPorServicio,
  etiquetaCampania,
  totalesFactura,
  type FilaFactura,
} from "@/lib/facturacion-campania";
import { horasLegibles } from "@/lib/fechas";
import { compararTexto, valoresOrden } from "@/lib/orden";

export function euros(importe: number | null | undefined): string {
  if (importe == null) return "—";
  return importe.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
}

/**
 * Cantidad con la unidad que toca: horas a «8,53 h», minutos a 2 decimales,
 * los cargos puntuales con decimales solo si los tienen y el resto, enteros.
 */
export function cantidadLegible(unidad: UnidadFacturacion, cantidad: number): string {
  if (unidad === "horas" || unidad === "horas_logadas") return horasLegibles(cantidad);
  if (unidad === "minutos_fijo" || unidad === "minutos_movil" || unidad === "minutos_especial") {
    return cantidad.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return cantidad.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/**
 * La factura por campaña: cantidad e importe de cada unidad que se cobra,
 * código de GS y total. Es la hoja «FACTURACION» del Excel de operaciones.
 * Cada cliente con más de una campaña lleva su fila de total; con varios
 * clientes («Todos»), además el total general. Clientes y campañas de la A a
 * la Z (04/11/2026); pulsando una cabecera, por esa columna dentro de cada
 * cliente (los artículos, por su importe).
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
  const grupos = ordenarGrupos(agruparPorServicio(filas));
  const columnasEtiqueta = conServicio ? 3 : 2;

  /** Fila de total con la suma de cada columna (de un cliente o de todos). */
  const filaTotal = (clave: string, etiqueta: string, de: readonly FilaFactura[], general = false) => {
    const t = totalesFactura(de);
    return (
      <TableRow key={clave} className={general ? "font-semibold" : "bg-muted/40 font-medium"}>
        <TableCell colSpan={columnasEtiqueta}>{etiqueta}</TableCell>
        {unidades.map((u) => {
          const tu = t.porUnidad.find((x) => x.unidad === u);
          return [
            <TableCell key={`${u}c`} className="text-right tabular-nums">
              {tu ? cantidadLegible(u, tu.cantidad) : ""}
            </TableCell>,
            <TableCell key={`${u}i`} className="text-right tabular-nums">
              {tu ? euros(tu.importe) : ""}
            </TableCell>,
          ];
        })}
        <TableCell className="text-right tabular-nums">{euros(t.importe)}</TableCell>
      </TableRow>
    );
  };

  // Valores para ordenar: cliente, campaña, código, el importe de cada artículo y el total
  const orden = (f: FilaFactura) =>
    valoresOrden(
      f.servicio,
      f.campania,
      f.codigoGs,
      ...unidades.map((u) => f.lineas.find((x) => x.unidad === u)?.importe ?? null),
      f.importeTotal,
    );

  return (
    <TablaOrdenable inicial={{ col: 1, desc: false }}>
      <Table>
        <TableHeader>
          <TableRow>
            {conServicio && <CabeceraOrdenable col={0}>Cliente</CabeceraOrdenable>}
            <CabeceraOrdenable col={1}>Campaña</CabeceraOrdenable>
            <CabeceraOrdenable col={2}>Cód. GS</CabeceraOrdenable>
            {unidades.map((u, i) => (
              <TableHead key={u} colSpan={2} className="text-center" title={ARTICULO_GS[u] ?? NOMBRE_UNIDAD[u]}>
                <BotonOrden col={3 + i} numerica title={ARTICULO_GS[u] ?? NOMBRE_UNIDAD[u]}>
                  {NOMBRE_CORTO_UNIDAD[u]}
                </BotonOrden>
              </TableHead>
            ))}
            <CabeceraOrdenable col={3 + unidades.length} numerica className="text-right">
              Total
            </CabeceraOrdenable>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grupos.map((g) => (
            <Fragment key={g.servicio ?? "(sin cliente)"}>
              <FilasOrdenables>
                {g.filas.map((f) => (
                  <TableRow key={`${f.servicio}|${etiquetaCampania(f)}`} data-orden={orden(f)}>
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
              </FilasOrdenables>
              {g.filas.length > 1
                ? filaTotal(`total|${g.servicio}`, `Total ${g.servicio ?? "sin cliente"}`, g.filas, grupos.length === 1)
                : null}
            </Fragment>
          ))}
          {grupos.length > 1 && filaTotal("total|general", "Total general", filas, true)}
        </TableBody>
      </Table>
    </TablaOrdenable>
  );
}

/** Grupos por cliente de la A a la Z; el de las campañas sin cliente, al final. */
export function ordenarGrupos<G extends { servicio: string | null }>(grupos: G[]): G[] {
  return [...grupos].sort((a, b) =>
    (a.servicio == null) !== (b.servicio == null) ? (a.servicio == null ? 1 : -1) : compararTexto(a.servicio ?? "", b.servicio ?? ""),
  );
}
