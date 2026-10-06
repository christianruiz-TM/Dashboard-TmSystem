"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DatosHoy } from "@/lib/planificacion/seguimiento";
import { colorTexto, estadoFranja, posicionPct, type EstadoFranja } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import { BotonAyuda } from "./ayuda";
import { PuntoAyuda } from "./punto-ayuda";

const REFRESCO_MS = 60_000;
const SIN_CLIENTE = "#A1A1AA";

const CLASE_FRANJA: Record<EstadoFranja, string> = {
  bajo: "bg-red-500 text-white",
  justo: "bg-amber-300 text-amber-950",
  holgado: "bg-emerald-200 text-emerald-950",
  sin_minimo: "bg-muted text-muted-foreground",
};

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.floor(min % 60)).padStart(2, "0")}`;
const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Vista «Hoy» de planificación: alertas, cobertura del cliente base por
 * franja y, por agente, lo planificado (arriba) frente a lo logado con cada
 * usuario (abajo), con la línea de «ahora». Se refresca cada 60 s.
 */
export function PanelHoy({ inicial }: { inicial: DatosHoy }) {
  const [datos, setDatos] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await fetch("/api/planificacion/hoy", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setDatos(await r.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const id = setInterval(refrescar, REFRESCO_MS);
    return () => clearInterval(id);
  }, [refrescar]);

  const color = new Map(datos.clientes.map((c) => [c.codigo, c.color]));
  const nombreCliente = new Map(datos.clientes.map((c) => [c.codigo, c.nombre]));
  const { inicioDiaMin: ini, finDiaMin: fin } = datos;
  const horas = Array.from({ length: Math.floor((fin - ini) / 60) + 1 }, (_, i) => ini + i * 60);
  const ahora = posicionPct(ini, datos.ahoraMin, ini, fin);
  const dentro = datos.ahoraMin > ini && datos.ahoraMin < fin;
  const conectados = datos.agentes.filter((a) => a.conectado).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Hoy · {fechaLarga(datos.fecha)}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            {datos.version
              ? `Plan: v${datos.version.numero} ${datos.version.estado === "publicada" ? "publicada" : "en borrador (aún no publicada)"}. `
              : "Este mes no tiene plan: solo se ve quién está conectado. "}
            Horas conectadas de cada usuario · se actualiza cada minuto · actualizado a las {datos.actualizado}.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <BotonAyuda pantalla="hoy" />
          <Button variant="outline" size="sm" onClick={refrescar} disabled={cargando}>
            <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          No se pudo refrescar ({error}). Se muestran los últimos datos recibidos.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Alertas
            <PuntoAyuda id="hoy-alertas" />
          </CardTitle>
          <CardDescription>Umbrales en Configuración → Parámetros (grupo «Seguimiento»).</CardDescription>
        </CardHeader>
        <CardContent>
          {datos.alertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin alertas ahora.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {datos.alertas.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", a.gravedad === "alta" ? "text-red-600" : "text-amber-600")} />
                  <span>{a.mensaje}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {datos.coberturaBase.some((f) => f.minimo > 0 || f.planificados > 0) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Cobertura de {datos.clienteBase}
              <PuntoAyuda id="hoy-cobertura" />
            </CardTitle>
            <CardDescription>
              Agentes conectados con {datos.clienteBase} o con los que cuentan como él, frente al mínimo de cada franja (en la
              actual, los conectados ahora; en las pasadas, los que llegaron a estarlo). En las que faltan, lo planificado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {datos.coberturaBase.map((f) => {
                const hay = f.conectados ?? f.planificados;
                const estado = estadoFranja(hay, f.minimo);
                return (
                  <div
                    key={f.inicioMin}
                    title={`${hhmm(f.inicioMin)}: ${f.conectados == null ? "" : `${f.conectados} conectados, `}${f.planificados} planificados, mínimo ${f.minimo}`}
                    className={cn(
                      "w-14 rounded px-1 py-1 text-center text-xs",
                      CLASE_FRANJA[estado],
                      f.conectados == null && "opacity-60",
                      f.inicioMin <= datos.ahoraMin && datos.ahoraMin < f.inicioMin + datos.pasoMin && "ring-2 ring-foreground",
                    )}
                  >
                    <div className="font-medium">{hhmm(f.inicioMin)}</div>
                    <div>{f.minimo > 0 ? `${hay}/${f.minimo}` : hay}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Agentes · {conectados} de {datos.agentes.length} conectados
            <PuntoAyuda id="hoy-filas" />
          </CardTitle>
          <CardDescription>
            Arriba, lo planificado; abajo, lo logado con cada usuario, del color de su cliente (gris: un usuario de otro servicio).
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {datos.agentes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie planificado ni conectado hoy.</p>
          ) : (
            <div className="min-w-[720px] space-y-1">
              <div className="grid grid-cols-[11rem_1fr] items-end gap-2 text-xs text-muted-foreground">
                <div />
                <div className="relative h-4">
                  {horas.map((h) => (
                    <span key={h} className="absolute -translate-x-1/2" style={{ left: `${posicionPct(ini, h, ini, fin).width}%` }}>
                      {String(h / 60).padStart(2, "0")}
                    </span>
                  ))}
                </div>
              </div>
              {datos.agentes.map((a) => (
                <div key={a.numero} className="grid grid-cols-[11rem_1fr] items-center gap-2">
                  <div className="truncate text-sm">
                    <span className={cn("mr-1 inline-block h-2 w-2 rounded-full", a.conectado ? "bg-emerald-500" : "bg-zinc-300")} />
                    {a.numero}
                    {a.nombre ? ` ${a.nombre}` : ""}
                  </div>
                  <div className="relative h-9 rounded bg-muted/40">
                    {horas.map((h) => (
                      <div key={h} className="absolute inset-y-0 border-l border-border/60" style={{ left: `${posicionPct(ini, h, ini, fin).width}%` }} />
                    ))}
                    {a.bloques.map((b, i) => {
                      const p = posicionPct(b.inicioMin, b.finMin, ini, fin);
                      const fondo = color.get(b.clienteCodigo) ?? SIN_CLIENTE;
                      return (
                        <div
                          key={`p${i}`}
                          title={`Planificado ${nombreCliente.get(b.clienteCodigo) ?? b.clienteCodigo} ${hhmm(b.inicioMin)}-${hhmm(b.finMin)}`}
                          className="absolute top-0.5 flex h-4 items-center overflow-hidden rounded-sm px-1 text-[10px] font-medium"
                          style={{ left: `${p.left}%`, width: `${p.width}%`, background: fondo, color: colorTexto(fondo) }}
                        >
                          {b.clienteCodigo}
                        </div>
                      );
                    })}
                    {a.logado.map((t, i) => {
                      const p = posicionPct(t.inicioMin, t.finMin, ini, fin);
                      const fondo = (t.clienteCodigo && color.get(t.clienteCodigo)) || SIN_CLIENTE;
                      return (
                        <div
                          key={`l${i}`}
                          title={`${t.usrName} ${hhmm(t.inicioMin)}-${hhmm(t.finMin)}`}
                          className="absolute bottom-0.5 h-3 rounded-sm border border-black/20"
                          style={{ left: `${p.left}%`, width: `${Math.max(p.width, 0.2)}%`, background: fondo }}
                        />
                      );
                    })}
                    {dentro ? <div className="absolute inset-y-0 w-0.5 bg-red-600" style={{ left: `${ahora.width}%` }} title={`Ahora (${hhmm(datos.ahoraMin)})`} /> : null}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 pt-2 text-xs text-muted-foreground">
                {datos.clientes.map((c) => (
                  <span key={c.codigo} className="inline-flex items-center gap-1">
                    <span className="inline-block h-3 w-3 rounded-sm border" style={{ background: c.color }} />
                    {c.codigo}
                  </span>
                ))}
                <Badge variant="outline" className="gap-1">
                  <span className="inline-block h-3 w-0.5 bg-red-600" /> ahora
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
