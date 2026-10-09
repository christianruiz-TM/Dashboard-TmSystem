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
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { Glosario } from "@/components/glosario";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { TarjetaIvr } from "@/components/kpi/tarjeta-ivr";
import { TarjetaAlertasPlan } from "@/components/planificacion/alertas-plan";
import type { Alerta } from "@/lib/planificacion/alertas";
import type { PendienteRevision } from "@/lib/planificacion/vistas";
import { horasDesdeSegundos, segundosLegibles } from "@/lib/fechas";
import type { AgenteEstado, AgenteHoy, KpiCampaniaHoy, MetricasIvr } from "@/lib/rdb/types";
import { cn } from "@/lib/utils";

interface DatosSupervision {
  agentes: AgenteEstado[];
  kpis: KpiCampaniaHoy[];
  top: AgenteHoy[];
  ivr: MetricasIvr;
  /** Alertas de planificación (equipo multicliente), independientes del servicio elegido. */
  plan: { alertas: Alerta[]; error: string | null; revisar?: PendienteRevision[] };
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

function colorSla(pct: number | null): string {
  if (pct == null) return "text-muted-foreground";
  if (pct >= 80) return "text-emerald-600 font-semibold";
  if (pct >= 60) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

export function PanelSupervision({
  inicial,
  servicios,
  servicio,
  incluirIvr,
}: {
  inicial: DatosSupervision;
  servicios: string[];
  servicio?: string;
  incluirIvr: boolean;
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
          <SelectorServicio servicios={servicios} valor={servicio} />
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
          sub={`Abandonadas: ${segundosLegibles(esperaAbandGlobal)} de espera antes de colgar`}
        />
        <TarjetaKpi titulo="Atendidas hoy" valor={atendidas.toLocaleString("es-ES")} />
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
                {datos.kpis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      Sin actividad registrada hoy
                    </TableCell>
                  </TableRow>
                ) : (
                  datos.kpis.map((k) => {
                    // Abandono de la campaña: entrantes abandonadas / entrantes recibidas
                    const pctAb =
                      k.recibidas > 0
                        ? ((k.abandonadasInbound / k.recibidas) * 100).toFixed(1)
                        : "0.0";
                    return (
                      <TableRow key={k.campania}>
                        <TableCell className="font-medium">{k.campania}</TableCell>
                        <TableCell className="text-right tabular-nums">{k.recibidas}</TableCell>
                        <TableCell className="text-right tabular-nums">{k.atendidas}</TableCell>
                        <TableCell className="text-right tabular-nums text-emerald-700">
                          {k.exitos}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            Number(pctAb) >= 10 && "font-semibold text-red-600",
                          )}
                        >
                          {pctAb} %
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {segundosLegibles(k.colaMediaSeg)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {segundosLegibles(k.esperaAbandonadasSeg)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {segundosLegibles(k.ahtSeg)}
                        </TableCell>
                        <TableCell className={cn("text-right tabular-nums", colorSla(k.slaPct))}>
                          {k.slaPct != null ? `${k.slaPct.toFixed(1)} %` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead className="text-right">Atendidas</TableHead>
                <TableHead className="text-right">Talk medio</TableHead>
                <TableHead className="text-right">ACW medio</TableHead>
                <TableHead className="text-right">AHT</TableHead>
                <TableHead className="text-right">Tiempo productivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datos.top.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Sin llamadas atendidas todavía
                  </TableCell>
                </TableRow>
              ) : (
                datos.top.map((a) => (
                  <TableRow key={a.agente}>
                    <TableCell>
                      <div className="font-medium">{a.nombre}</div>
                      <div className="text-xs text-muted-foreground">{a.agente}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.atendidas}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {segundosLegibles(a.talkMedioSeg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {segundosLegibles(a.acwMedioSeg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {segundosLegibles(a.ahtMedioSeg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {horasDesdeSegundos(a.productivoSeg)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Glosario
        titulo="Supervisión · tiempo real"
        claves={[
          "servicio",
          "estado",
          "pausas",
          "recibidas",
          "atendidas",
          "exitos",
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
