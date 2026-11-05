import { Fragment } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tiempo } from "@/components/kpi/tiempo";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { valoresOrden } from "@/lib/orden";
import type { GrupoKpis } from "@/lib/supervision";
import type { KpiCampaniaHoy } from "@/lib/rdb/types";
import { cn } from "@/lib/utils";

// ============================================================
// Tabla de campañas de Supervisión (Tiempo real e Histórico): una fila por
// campaña y, si el cliente tiene tipos de campaña (Bolsas: cartera; GH:
// BBDD), agrupada por tipo con el total de cada grupo (lib/supervision.ts).
// Sin hooks: sirve en el panel de cliente (Tiempo real) y en el de servidor.
// De la A a la Z por campaña; pulsando una cabecera, por esa columna (dentro
// de cada grupo; los totales no se mueven). «Emails» (05/11/2026) solo sale
// si alguna campaña los tiene (CEFF, Ávolo): no son llamadas.
// ============================================================

function colorSla(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 font-semibold";
  if (pct >= 60) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

const COLUMNAS = 11;

const TITULO_EMAILS =
  "Emails enviados desde el guion. No son llamadas: no cuentan en las llamadas gestionadas ni en las medias.";

/** Abandono: entrantes abandonadas / entrantes recibidas (regla 6.b). */
const pctAbandono = (k: KpiCampaniaHoy) => (k.recibidas > 0 ? (k.abandonadasInbound / k.recibidas) * 100 : 0);

const orden = (k: KpiCampaniaHoy) =>
  valoresOrden(
    k.campania,
    k.recibidas,
    k.atendidas,
    k.conversaciones,
    k.contactos,
    k.exitos,
    pctAbandono(k),
    k.colaMediaSeg,
    k.esperaAbandonadasSeg,
    k.ahtSeg,
    k.slaPct,
    // Al final: la columna solo sale si hay emails y no mueve las demás
    k.emails,
  );

function Celdas({ k, conEmails }: { k: KpiCampaniaHoy; conEmails: boolean }) {
  const pctAb = pctAbandono(k);
  return (
    <>
      <TableCell className="text-right tabular-nums">{k.recibidas.toLocaleString("es-ES")}</TableCell>
      <TableCell className="text-right tabular-nums">{k.atendidas.toLocaleString("es-ES")}</TableCell>
      <TableCell className="text-right tabular-nums">{k.conversaciones.toLocaleString("es-ES")}</TableCell>
      <TableCell className="text-right tabular-nums">{k.contactos.toLocaleString("es-ES")}</TableCell>
      {conEmails ? <TableCell className="text-right tabular-nums">{k.emails.toLocaleString("es-ES")}</TableCell> : null}
      <TableCell className="text-right tabular-nums text-emerald-700">{k.exitos.toLocaleString("es-ES")}</TableCell>
      <TableCell className={cn("text-right tabular-nums", pctAb >= 10 && "font-semibold text-red-600")}>
        {pctAb.toFixed(1)} %
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Tiempo segundos={k.colaMediaSeg} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Tiempo segundos={k.esperaAbandonadasSeg} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <Tiempo segundos={k.ahtSeg} />
      </TableCell>
      <TableCell className={cn("text-right tabular-nums", colorSla(k.slaPct))}>
        {k.slaPct != null ? `${k.slaPct.toFixed(1)} %` : "—"}
      </TableCell>
    </>
  );
}

export function TablaKpisCampania({ grupos, vacio }: { grupos: GrupoKpis[]; vacio: string }) {
  const agrupada = grupos.some((g) => g.nombre != null);
  const hayFilas = grupos.some((g) => g.kpis.length > 0);
  const conEmails = grupos.some((g) => g.kpis.some((k) => k.emails > 0));
  const columnas = COLUMNAS + (conEmails ? 1 : 0);
  return (
    <TablaOrdenable>
      <Table>
        <TableHeader>
          <TableRow>
            <CabeceraOrdenable col={0}>Campaña</CabeceraOrdenable>
            <CabeceraOrdenable col={1} numerica className="text-right">Recibidas</CabeceraOrdenable>
            <CabeceraOrdenable col={2} numerica className="text-right" title="Llamadas que pasaron por el puesto de un agente (lo que Altitude llama «gestionadas»). En una saliente no quiere decir que contestara alguien.">
              Llamadas gestionadas
            </CabeceraOrdenable>
            <CabeceraOrdenable col={3} numerica className="text-right" title="Llamadas gestionadas en las que hubo conversación (alguien al otro lado)">
              Conversaciones
            </CabeceraOrdenable>
            <CabeceraOrdenable col={4} numerica className="text-right" title="Contactos trabajados: sesiones de guion (una por cada contacto al que se abrió la ficha, conteste o no). Por eso puede haber más contactos que conversaciones.">
              Contactos
            </CabeceraOrdenable>
            {conEmails ? (
              <CabeceraOrdenable col={11} numerica className="text-right" title={TITULO_EMAILS}>
                Emails
              </CabeceraOrdenable>
            ) : null}
            <CabeceraOrdenable col={5} numerica className="text-right">Éxitos</CabeceraOrdenable>
            <CabeceraOrdenable col={6} numerica className="text-right">Abandono</CabeceraOrdenable>
            <CabeceraOrdenable col={7} numerica className="text-right">Cola media</CabeceraOrdenable>
            <CabeceraOrdenable col={8} numerica className="text-right">Espera aband.</CabeceraOrdenable>
            <CabeceraOrdenable col={9} numerica className="text-right">AHT</CabeceraOrdenable>
            <CabeceraOrdenable col={10} numerica className="text-right">SLA</CabeceraOrdenable>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!hayFilas ? (
            <TableRow>
              <TableCell colSpan={columnas} className="text-center text-muted-foreground">
                {vacio}
              </TableCell>
            </TableRow>
          ) : (
            grupos.map((g) => (
              <Fragment key={g.nombre ?? "todas"}>
                {agrupada ? (
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={columnas} className="text-xs font-semibold uppercase tracking-wide">
                      {g.nombre} · {g.kpis.length} {g.kpis.length === 1 ? "campaña" : "campañas"}
                    </TableCell>
                  </TableRow>
                ) : null}
                <FilasOrdenables>
                  {g.kpis.map((k) => (
                    <TableRow key={k.campania} data-orden={orden(k)}>
                      <TableCell className={cn("font-medium", agrupada && "pl-4")}>{k.campania}</TableCell>
                      <Celdas k={k} conEmails={conEmails} />
                    </TableRow>
                  ))}
                </FilasOrdenables>
                {agrupada ? (
                  <TableRow className="border-b-2 font-semibold">
                    <TableCell>{g.total.campania}</TableCell>
                    <Celdas k={g.total} conEmails={conEmails} />
                  </TableRow>
                ) : null}
              </Fragment>
            ))
          )}
        </TableBody>
      </Table>
    </TablaOrdenable>
  );
}
