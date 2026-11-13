"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BarraPanel } from "@/components/layout/barra-panel";
import { SelectorServicio } from "@/components/filtros/selector-servicio";
import type { ServicioOrdenado } from "@/lib/actividad-servicios";
import { SelectorIvr } from "@/components/filtros/selector-ivr";
import { FranjaAhora } from "@/components/kpi/cabecera-supervision";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { valoresOrden } from "@/lib/orden";
import type { TipoCampania } from "@/lib/resultados-actividad";
import { TarjetaAlertasPlan } from "@/components/planificacion/alertas-plan";
import type { DatosSupervisionHoy } from "@/lib/supervision-servidor";
import { NOMBRE_SECCION, type SeccionSupervision } from "@/lib/supervision-secciones";
import type { AgenteEstado } from "@/lib/rdb/types";
import { cn } from "@/lib/utils";
import { SeccionPeriodo } from "./secciones-supervision";

const REFRESCO_MS = 60_000;

const COLOR_ESTADO: Record<string, string> = {
  Ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  NotReady: "bg-amber-100 text-amber-800 border-amber-200",
  Logado: "bg-sky-100 text-sky-800 border-sky-200",
  Deslogado: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

/** Estado de cada agente ahora mismo, de la A a la Z por su usuario de Altitude. */
function TablaEstadoAgentes({ agentes }: { agentes: AgenteEstado[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Estado de agentes ahora ({agentes.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {/* De la A a la Z por usuario de Altitude; pulsando una cabecera, por esa columna */}
        <TablaOrdenable>
          <Table>
            <TableHeader>
              <TableRow>
                <CabeceraOrdenable col={0}>Agente</CabeceraOrdenable>
                <CabeceraOrdenable col={1}>Campaña</CabeceraOrdenable>
                <CabeceraOrdenable col={2}>Estado</CabeceraOrdenable>
                <CabeceraOrdenable col={3}>Motivo</CabeceraOrdenable>
                <CabeceraOrdenable col={4} numerica className="text-right">
                  Desde hace
                </CabeceraOrdenable>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agentes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Ningún agente con actividad hoy
                  </TableCell>
                </TableRow>
              ) : (
                <FilasOrdenables>
                  {agentes.map((a) => (
                    <TableRow
                      key={`${a.agente}-${a.campania}`}
                      data-orden={valoresOrden(a.agente, a.campania, a.estado, a.motivo, a.desdeMin)}
                    >
                      <TableCell>
                        <div className="font-medium">{a.agente}</div>
                        <div className="text-xs text-muted-foreground">{a.nombre}</div>
                      </TableCell>
                      <TableCell>{a.campania}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={COLOR_ESTADO[a.estado] ?? "bg-zinc-100 text-zinc-700"}>
                          {a.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.motivo ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.desdeMin} min</TableCell>
                    </TableRow>
                  ))}
                </FilasOrdenables>
              )}
            </TableBody>
          </Table>
        </TablaOrdenable>
      </CardContent>
    </Card>
  );
}

/**
 * Supervisión → Tiempo real. Desde el 12/11/2026, en pestañas por sección
 * (lib/supervision-secciones.ts): arriba la barra fija con los filtros y las
 * secciones y la franja «Ahora» (plantilla y entrantes de hoy, y las alertas
 * si hay alguna), que se ven en todas; debajo, solo la sección abierta. El
 * refresco de cada 60 s pide únicamente esa sección.
 */
export function PanelSupervision({
  inicial,
  seccion,
  secciones,
  pestanas,
  avisos,
  servicios,
  ordenServicios,
  servicio,
  incluirIvr,
  tipos,
  servicioDe,
}: {
  inicial: DatosSupervisionHoy;
  seccion: SeccionSupervision;
  /** Las pestañas de sección ya con su enlace (las monta la página). */
  secciones: { valor: string; etiqueta: string; href: string }[];
  /** Pestañas principales de Supervisión (Tiempo real, Histórico, Resultados). */
  pestanas: ReactNode;
  /** Avisos de la página (cliente que no existe…), debajo de la barra. */
  avisos?: ReactNode;
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
  const [datos, setDatos] = useState<DatosSupervisionHoy>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const router = useRouter();
  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const qs = new URLSearchParams();
      if (servicio) qs.set("servicio", servicio);
      if (incluirIvr) qs.set("ivr", "1");
      if (seccion !== "resumen") qs.set("seccion", seccion);
      const url = qs.toString()
        ? `/api/supervision/datos?${qs.toString()}`
        : "/api/supervision/datos";
      const respuesta = await fetch(url, { cache: "no-store" });
      // Sesión caducada (tope de 12 h): al login, en vez de quedarse con datos viejos
      if (respuesta.status === 401) {
        router.push("/login");
        return;
      }
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      setDatos(await respuesta.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
    } finally {
      setCargando(false);
    }
  }, [servicio, incluirIvr, seccion, router]);

  useEffect(() => {
    const intervalo = setInterval(refrescar, REFRESCO_MS);
    return () => clearInterval(intervalo);
  }, [refrescar]);

  // Plantilla ahora mismo (una fila por agente y campaña)
  const enEstado = (estado: string) =>
    new Set(datos.agentes.filter((a) => a.estado === estado).map((a) => a.agente)).size;
  const conectados = new Set(datos.agentes.filter((a) => a.estado !== "Deslogado").map((a) => a.agente)).size;
  const plan = datos.plan;
  const hayAlertas = plan.alertas.length > 0 || (plan.revisar?.length ?? 0) > 0 || plan.error != null;

  return (
    <div className="space-y-6">
      <BarraPanel
        pestanas={pestanas}
        filtros={
          <>
            <SelectorServicio servicios={servicios} orden={ordenServicios} valor={servicio} />
            <SelectorIvr incluir={incluirIvr} />
          </>
        }
        secciones={secciones}
        actual={seccion}
        estado={
          <>
            <span>
              Actualizado a las{" "}
              {new Date(datos.actualizado).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}{" "}
              · cada 60 s
            </span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={refrescar} disabled={cargando}>
              <RefreshCw className={cn("h-3.5 w-3.5", cargando && "animate-spin")} />
              Actualizar
            </Button>
          </>
        }
      />

      {avisos}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          No se pudo refrescar ({error}). Mostrando los últimos datos recibidos.
        </div>
      ) : null}

      <FranjaAhora
        kpis={datos.kpis}
        umbral={datos.umbral}
        equipo={{ ready: enEstado("Ready"), noDisponibles: enEstado("NotReady"), conectados }}
      />

      {/* Las alertas, solo si hay algo que mirar (la campana de arriba las tiene siempre) */}
      {hayAlertas ? (
        <TarjetaAlertasPlan alertas={plan.alertas} error={plan.error} revisar={plan.revisar ?? []} />
      ) : null}

      {seccion === "agentes" ? <TablaEstadoAgentes agentes={datos.agentes} /> : null}

      <SeccionPeriodo
        seccion={seccion}
        datos={datos}
        periodo="hoy"
        enVivo
        tipos={tipos}
        servicioDe={servicioDe}
        titulo={`Supervisión · tiempo real · ${NOMBRE_SECCION[seccion]}`}
        claveComparador={`${servicio ?? "todos"}|${incluirIvr ? "ivr" : ""}`}
      />
    </div>
  );
}

