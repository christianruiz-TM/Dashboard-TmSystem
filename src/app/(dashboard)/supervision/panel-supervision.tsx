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
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { duracionLegible } from "@/lib/fechas";
import type { AgenteEstado, AgenteHoy, KpiCampaniaHoy } from "@/lib/rdb/types";
import { cn } from "@/lib/utils";

interface DatosSupervision {
  agentes: AgenteEstado[];
  kpis: KpiCampaniaHoy[];
  top: AgenteHoy[];
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

export function PanelSupervision({ inicial }: { inicial: DatosSupervision }) {
  const [datos, setDatos] = useState<DatosSupervision>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const respuesta = await fetch("/api/supervision/datos", { cache: "no-store" });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      setDatos(await respuesta.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const intervalo = setInterval(refrescar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [refrescar]);

  // Resumen de plantilla y del día
  const enEstado = (estado: string) => datos.agentes.filter((a) => a.estado === estado).length;
  const recibidas = datos.kpis.reduce((acc, k) => acc + k.recibidas, 0);
  const atendidas = datos.kpis.reduce((acc, k) => acc + k.atendidas, 0);
  const abandonadas = datos.kpis.reduce((acc, k) => acc + k.abandonadas, 0);
  const pctAbandono = recibidas > 0 ? (abandonadas / recibidas) * 100 : null;
  const slaGlobal =
    atendidas > 0
      ? datos.kpis.reduce((acc, k) => acc + (k.slaPct ?? 0) * k.atendidas, 0) / atendidas
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
        <Button variant="outline" size="sm" onClick={refrescar} disabled={cargando}>
          <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          No se pudo refrescar ({error}). Mostrando los últimos datos recibidos.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <TarjetaKpi titulo="Agentes Ready" valor={String(enEstado("Ready"))} />
        <TarjetaKpi
          titulo="No disponibles"
          valor={String(enEstado("NotReady"))}
          sub="Not Ready ahora mismo"
        />
        <TarjetaKpi titulo="Recibidas hoy" valor={recibidas.toLocaleString("es-ES")} />
        <TarjetaKpi
          titulo="Abandonadas"
          valor={abandonadas.toLocaleString("es-ES")}
          sub={pctAbandono != null ? `${pctAbandono.toFixed(1)} % de las recibidas` : undefined}
        />
        <TarjetaKpi
          titulo="SLA global"
          valor={slaGlobal != null ? `${slaGlobal.toFixed(1)} %` : "—"}
          sub={`Objetivo: cola ≤ ${datos.umbral}s`}
        />
        <TarjetaKpi titulo="Atendidas hoy" valor={atendidas.toLocaleString("es-ES")} />
      </div>

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
                  <TableHead className="text-right">Abandono</TableHead>
                  <TableHead className="text-right">Cola media</TableHead>
                  <TableHead className="text-right">AHT</TableHead>
                  <TableHead className="text-right">SLA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.kpis.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Sin actividad registrada hoy
                    </TableCell>
                  </TableRow>
                ) : (
                  datos.kpis.map((k) => {
                    const pctAb =
                      k.recibidas > 0 ? ((k.abandonadas / k.recibidas) * 100).toFixed(1) : "0.0";
                    return (
                      <TableRow key={k.campania}>
                        <TableCell className="font-medium">{k.campania}</TableCell>
                        <TableCell className="text-right tabular-nums">{k.recibidas}</TableCell>
                        <TableCell className="text-right tabular-nums">{k.atendidas}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            Number(pctAb) >= 10 && "font-semibold text-red-600",
                          )}
                        >
                          {pctAb} %
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {duracionLegible(k.colaMediaSeg)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {duracionLegible(k.ahtSeg)}
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
                      {duracionLegible(a.talkMedioSeg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {duracionLegible(a.acwMedioSeg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {duracionLegible(a.ahtMedioSeg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {duracionLegible(a.productivoSeg)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
