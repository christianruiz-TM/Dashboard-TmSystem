"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import type { ServicioOrdenado } from "@/lib/actividad-servicios";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { TarjetaIvr } from "@/components/kpi/tarjeta-ivr";
import { RatiosExito } from "@/components/kpi/ratios-exito";
import { ComparadorCampanias } from "@/components/kpi/comparador-campanias";
import { TablaKpisCampania } from "@/components/kpi/tabla-kpis-campania";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import type { TipoCampania } from "@/lib/resultados-actividad";
import {
  METRICAS_SUPERVISION,
  agruparKpisPorTipo,
  filasCampaniaSupervision,
} from "@/lib/supervision";
import { TarjetaAlertasPlan } from "@/components/planificacion/alertas-plan";
import type { Alerta } from "@/lib/planificacion/alertas";
import type { PendienteRevision } from "@/lib/planificacion/vistas";
import { TablaAgentesSupervision } from "@/components/kpi/tabla-agentes-supervision";
import { CalidadBaseDatos } from "@/components/kpi/calidad-bd";
import type { ResultadoCalidadBd } from "@/lib/calidad-bd";
import { relojDesdeSegundos, segundosLegibles } from "@/lib/fechas";
import type { AgenteEstado, AgenteHoy, KpiCampaniaHoy, MetricasIvr } from "@/lib/rdb/types";
import { cn } from "@/lib/utils";

interface DatosSupervision {
  agentes: AgenteEstado[];
  kpis: KpiCampaniaHoy[];
  top: AgenteHoy[];
  ivr: MetricasIvr;
  /** Alertas de planificación (equipo multicliente), independientes del servicio elegido. */
  plan: { alertas: Alerta[]; error: string | null; revisar?: PendienteRevision[] };
  ratios: ResultadoRatios;
  calidad: ResultadoCalidadBd;
  umbral: number;
  actualizado: string;
}

const REFRESCO_MS = 60_000;

const COLOR_ESTADO: Record<string, string> = {
  Ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NotReady: "bg-amber-100 text-amber-800 border-amber-200",
  Logado: "bg-sky-100 text-sky-800 border-sky-200",
  Deslogado: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function PanelSupervision({
  inicial,
  servicios,
  ordenServicios,
  servicio,
  incluirIvr,
  tipos,
  servicioDe,
}: {
  inicial: DatosSupervision;
  servicios: string[];
  /** Clientes por actividad para el selector (null: en el orden de `servicios`). */
  ordenServicios?: { activos: ServicioOrdenado[]; parados: ServicioOrdenado[] };
  servicio?: string;
  incluirIvr: boolean;
  /** Tipos de campaña del cliente (Bolsas: cartera; GH: BBDD): agrupan la tabla. */
  tipos: TipoCampania[];
  /** Cliente de cada campaña (para el comparador sin cliente elegido). */
  servicioDe: Record<string, string>;
}) {
  const [datos, setDatos] = useState<DatosSupervision>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (servicio) qs.set("servicio", servicio);
      if (incluirIvr) qs.set("ivr", "1");
      const url = qs.toString()
        ? `/api/supervision/datos?${qs.toString()}`
        : "/api/supervision/datos";
      const respuesta = await fetch(url, { cache: "no-store" });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      setDatos(await respuesta.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [servicio, incluirIvr]);

  useEffect(() => {
    const intervalo = setInterval(refrescar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [refrescar]);

  // Resumen de plantilla y del día
  const enEstado = (estado: string) => datos.agentes.filter((a) => a.estado === estado).length;
  const recibidas = datos.kpis.reduce((acc, k) => acc + k.recibidas, 0);
  const atendidas = datos.kpis.reduce((acc, k) => acc + k.atendidas, 0);
  const conversaciones = datos.kpis.reduce((acc, k) => acc + k.conversaciones, 0);
  const abandonadas = datos.kpis.reduce((acc, k) => acc + k.abandonadas, 0);
  const exitos = datos.kpis.reduce((acc, k) => acc + k.exitos, 0);
  // Abandono y SLA se calculan SOLO sobre entrantes: las salientes no hacen
  // cola, y mezclarlas hinchaba el SLA y ensuciaba el % de abandono.
  const atendidasIn = datos.kpis.reduce((acc, k) => acc + k.atendidasInbound, 0);
  const abandonadasIn = datos.kpis.reduce((acc, k) => acc + k.abandonadasInbound, 0);
  const pctAbandono = recibidas > 0 ? (abandonadasIn / recibidas) * 100 : null;
  // SLA global desde los recuentos, no ponderando los % ya redondeados
  const fueraSla = datos.kpis.reduce((acc, k) => acc + k.atendidasFueraSla, 0);
  const slaGlobal = atendidasIn > 0 ? ((atendidasIn - fueraSla) / atendidasIn) * 100 : null;
  // Cola de las atendidas y espera de las abandonadas (entrantes), por separado.
  // Medias globales desde las sumas exactas, no promediando medias redondeadas.
  const colaGlobal =
    atendidasIn > 0
      ? datos.kpis.reduce((acc, k) => acc + k.colaAtendidasTotalSeg, 0) / atendidasIn
      : null;
  const esperaAbandGlobal =
    abandonadasIn > 0
      ? datos.kpis.reduce((acc, k) => acc + k.esperaAbandonadasTotalSeg, 0) / abandonadasIn
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Supervisión · hoy</h1>
          <p className="text-sm text-muted-foreground">
            Datos de replicación casi en tiempo real · refresco automático cada 60 s ·
            actualizado a las{" "}
            {new Date(datos.actualizado).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SelectorServicio servicios={servicios} orden={ordenServicios} valor={servicio} />
          <SelectorIvr incluir={incluirIvr} />
          <Button variant="outline" size="sm" onClick={refrescar} disabled={cargando}>
            <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          No se pudo refrescar ({error}). Mostrando los últimos datos recibidos.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <TarjetaKpi titulo="Agentes Ready" valor={String(enEstado("Ready"))} />
        <TarjetaKpi
          titulo="No disponibles"
          valor={String(enEstado("NotReady"))}
          sub="Not Ready ahora mismo"
        />
        <TarjetaKpi titulo="Recibidas hoy" valor={recibidas.toLocaleString("es-ES")} />
        <TarjetaKpi
          titulo="Abandonadas (entrantes)"
          valor={abandonadasIn.toLocaleString("es-ES")}
          sub={
            pctAbandono != null
              ? `${pctAbandono.toFixed(1)} % de las recibidas · ${abandonadas.toLocaleString("es-ES")} en total`
              : undefined
          }
        />
        <TarjetaKpi
          titulo="SLA global (entrantes)"
          valor={slaGlobal != null ? `${slaGlobal.toFixed(1)} %` : "—"}
          sub={`Objetivo: cola ≤ ${datos.umbral}s · sobre ${atendidasIn.toLocaleString("es-ES")} atendidas de entrada`}
        />
        <TarjetaKpi
          titulo="Cola media (atendidas)"
          valor={segundosLegibles(colaGlobal)}
          reloj={relojDesdeSegundos(colaGlobal)}
          sub={`Abandonadas: ${segundosLegibles(esperaAbandGlobal)} de espera antes de colgar`}
        />
        <TarjetaKpi
          titulo="Llamadas gestionadas hoy"
          valor={atendidas.toLocaleString("es-ES")}
          sub={`${conversaciones.toLocaleString("es-ES")} con conversación`}
        />
        <TarjetaKpi
          titulo="Éxitos hoy"
          valor={exitos.toLocaleString("es-ES")}
          sub="Ventas / objetivos"
        />
      </div>

      <TarjetaAlertasPlan alertas={datos.plan.alertas} error={datos.plan.error} revisar={datos.plan.revisar ?? []} />

      <TarjetaIvr ivr={datos.ivr} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campañas hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <TablaKpisCampania
              grupos={agruparKpisPorTipo(datos.kpis, tipos)}
              vacio="Sin actividad registrada hoy"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Estado de agentes ({datos.agentes.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead>Campaña</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Desde hace</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.agentes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Ningún agente con actividad hoy
                    </TableCell>
                  </TableRow>
                ) : (
                  datos.agentes.map((a) => (
                    <TableRow key={`${a.agente}-${a.campania}`}>
                      <TableCell>
                        <div className="font-medium">{a.nombre}</div>
                        <div className="text-xs text-muted-foreground">{a.agente}</div>
                      </TableCell>
                      <TableCell>{a.campania}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={COLOR_ESTADO[a.estado] ?? "bg-zinc-100 text-zinc-700"}
                        >
                          {a.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.motivo ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{a.desdeMin} min</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Productividad de agentes hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <TablaAgentesSupervision agentes={datos.top} vacio="Sin llamadas gestionadas todavía" />
        </CardContent>
      </Card>

      <RatiosExito ratios={datos.ratios} periodo="hoy" />

      <CalidadBaseDatos datos={datos.calidad} periodo="hoy" />

      {/* Se recalcula con cada refresco; las campañas elegidas se mantienen */}
      <ComparadorCampanias
        filas={filasCampaniaSupervision(datos.kpis, datos.ratios.campanias, servicioDe)}
        metricas={METRICAS_SUPERVISION}
      />

      <Glosario
        titulo="Supervisión · tiempo real"
        claves={[
          "servicio",
          "gruposCampania",
          "comparadorCampanias",
          "estado",
          "pausas",
          "recibidas",
          "atendidas",
          "calidadBd",
          "conversaciones",
          "tiempoReloj",
          "exitos",
          "contactosGestionados",
          "conversion",
          "efectividadCierre",
          "exitosHora",
          "tiempoPorExito",
          "indiceExito",
          "abandonadas",
          "abandono",
          "cola",
          "esperaAbandonadas",
          "sla",
          "aht",
          "acw",
          "talk",
          "productivo",
          "ivr",
          "ivrAtendidas",
          "ivrNoAtendidas",
          "ivrNoAtendidasHorario",
        ]}
      />
    </div>
  );
}
