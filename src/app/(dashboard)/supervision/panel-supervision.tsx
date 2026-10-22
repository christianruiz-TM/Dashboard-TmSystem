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
import { CabeceraSupervision } from "@/components/kpi/cabecera-supervision";
import { TarjetaIvr } from "@/components/kpi/tarjeta-ivr";
import { RatiosExito } from "@/components/kpi/ratios-exito";
import { ComparadorCampanias } from "@/components/kpi/comparador-campanias";
import { TablaKpisCampania } from "@/components/kpi/tabla-kpis-campania";
import type { ResultadoRatios } from "@/lib/ratios-exito";
import type { ResultadoResultados } from "@/lib/resultados-actividad";
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
  /** Totales de Resultados de hoy (contactos cerrados), para las cajas principales. */
  resultados: ResultadoResultados["total"] | null;
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

  // Plantilla ahora mismo (una fila por agente; el resumen del día lo calcula la cabecera)
  const enEstado = (estado: string) => datos.agentes.filter((a) => a.estado === estado).length;
  const conectados = new Set(datos.agentes.filter((a) => a.estado !== "Deslogado").map((a) => a.agente)).size;

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

      <CabeceraSupervision
        kpis={datos.kpis}
        ratios={datos.ratios}
        resultados={datos.resultados}
        umbral={datos.umbral}
        equipo={{ ready: enEstado("Ready"), noDisponibles: enEstado("NotReady"), conectados }}
      />

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

      <RatiosExito ratios={datos.ratios} periodo="hoy" sinTarjetas />

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
          "preparacion",
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
