import type { Metadata } from "next";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Settings } from "lucide-react";
import { BotonAyuda } from "@/components/planificacion/ayuda";
import { BotonGenerar } from "@/components/planificacion/boton-generar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEditarPlan, requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { fechaCorta, hoyISO, horasLegibles } from "@/lib/fechas";
import { nombreMes } from "@/lib/planificacion/tablero";
import { estadoEntrada, resumenMeses, type ResumenVersion } from "@/lib/planificacion/vistas";
import { generarBorradorAccion } from "./acciones";
import { PuntoAyuda } from "@/components/planificacion/punto-ayuda";

export const metadata: Metadata = { title: "Planificación" };
export const dynamic = "force-dynamic";

function Version({ v }: { v: ResumenVersion | null }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  return (
    <div>
      <div className="font-medium">v{v.numero}</div>
      <div className="text-xs text-muted-foreground">
        {v.estado === "publicada" && v.publicadaAt ? `publicada ${v.publicadaAt}` : `${v.creadaAt} · ${v.creadaPor ?? "—"}`}
      </div>
    </div>
  );
}

function Aviso({ ok, titulo, children }: { ok: boolean; titulo: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      )}
      <div className="min-w-0">
        <div className="font-medium">{titulo}</div>
        {children ? <div className="text-muted-foreground">{children}</div> : null}
      </div>
    </li>
  );
}

export default async function PaginaPlanificacion() {
  const usuario = await requireRol(...ROLES_PLAN_LECTURA);
  const editar = puedeEditarPlan(usuario.rol);
  const meses = resumenMeses();
  const e = estadoEntrada();
  const quien = (numero: string, nombre: string | null) => (nombre ? `${numero} ${nombre}` : numero);
  const cuantos = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Planificación de turnos</h1>
          <p className="text-sm text-muted-foreground">
            Reparto mensual del equipo multicliente por agente, cliente y franja.
            {editar ? "" : " Solo lectura: generar, editar y publicar es cosa de supervisión."}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <BotonAyuda pantalla="inicio" />
          <Button variant="outline" render={<Link href="/planificacion/hoy" />}>
            <Activity /> Hoy
          </Button>
          {editar ? (
            <Button variant="outline" render={<Link href="/planificacion/configuracion" />}>
              <Settings /> Configuración
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Estado de los datos
            <PuntoAyuda id="estado-datos" />
          </CardTitle>
          <CardDescription>
            Con estos datos se calcula el plan (hasta ayer, {fechaCorta(e.fechaDatos)}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            <Aviso
              ok={!e.caducados}
              titulo={
                e.ultimoAgregado
                  ? `Datos cargados hasta el ${fechaCorta(e.ultimoAgregado)}`
                  : "No hay datos cargados"
              }
            >
              {e.caducados
                ? "Faltan los datos de los últimos días: avisa a TI antes de generar el plan (npm run planificacion:agregados)."
                : null}
            </Aviso>
            <Aviso
              ok={e.prefijosSinCliente.length === 0}
              titulo={
                e.prefijosSinCliente.length === 0
                  ? "Todos los usuarios recientes de la plantilla tienen cliente"
                  : `${cuantos(e.prefijosSinCliente.length, "usuario", "usuarios")} con un prefijo sin cliente (¿cliente nuevo?)`
              }
            >
              {e.prefijosSinCliente.length > 0 ? (
                <>
                  {e.prefijosSinCliente
                    .map((u) => `${u.usrName} (última sesión ${u.ultimaSesion ? fechaCorta(u.ultimaSesion) : "—"})`)
                    .join(" · ")}
                  {editar ? (
                    <>
                      {" "}
                      —{" "}
                      <Link href="/planificacion/configuracion/clientes#prefijos" className="underline">
                        asignar prefijos
                      </Link>
                    </>
                  ) : null}
                </>
              ) : null}
            </Aviso>
            <Aviso
              ok={e.inactivos.length === 0}
              titulo={
                e.inactivos.length === 0
                  ? "Toda la plantilla tiene sesiones recientes"
                  : `${cuantos(e.inactivos.length, "agente", "agentes")} de plantilla sin sesiones en ${e.diasInactividad} días (no se planifican)`
              }
            >
              {e.inactivos.length > 0
                ? e.inactivos
                    .map((a) => `${quien(a.numero, a.nombre)}: ${a.ultimaSesion ? `desde el ${fechaCorta(a.ultimaSesion)}` : "nunca"}`)
                    .join(" · ")
                : null}
            </Aviso>
            <Aviso
              ok={e.fueraDePlantilla.length === 0}
              titulo={
                e.fueraDePlantilla.length === 0
                  ? "Nadie fuera de plantilla trabaja en los clientes del equipo"
                  : `${cuantos(e.fueraDePlantilla.length, "agente", "agentes")} fuera de plantilla con horas recientes en el equipo`
              }
            >
              {e.fueraDePlantilla.length > 0 ? (
                <>
                  {e.fueraDePlantilla
                    .map((f) => `${quien(f.agenteNumero, f.nombre)}: ${horasLegibles(f.horas)} en ${f.clientes.join(", ")}`)
                    .join(" · ")}
                  {editar ? (
                    <>
                      {" "}
                      —{" "}
                      <Link href="/planificacion/configuracion/agentes" className="underline">
                        revisar la plantilla
                      </Link>
                    </>
                  ) : null}
                </>
              ) : null}
            </Aviso>
            <Aviso
              ok={e.sinTurno.length === 0}
              titulo={
                e.sinTurno.length === 0
                  ? "Toda la plantilla tiene turno asignado"
                  : `${cuantos(e.sinTurno.length, "agente", "agentes")} de plantilla sin turno vigente`
              }
            >
              {e.sinTurno.length > 0 ? e.sinTurno.map((a) => quien(a.numero, a.nombre)).join(" · ") : null}
            </Aviso>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meses</CardTitle>
          <CardDescription>
            Como mucho un borrador por mes. Se puede generar el mes actual y los tres siguientes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mes</TableHead>
                <TableHead>Borrador</TableHead>
                <TableHead>Publicada</TableHead>
                <TableHead className="text-right">Planificado</TableHead>
                <TableHead>Incidencias</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meses.map((m) => {
                const vigente = m.borrador ?? m.publicada;
                return (
                  <TableRow key={m.mes}>
                    <TableCell>
                      <div className="font-medium">{nombreMes(m.mes)}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.versiones === 0 ? "sin plan" : `${m.versiones} versión${m.versiones === 1 ? "" : "es"}`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Version v={m.borrador} />
                    </TableCell>
                    <TableCell>
                      <Version v={m.publicada} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {vigente?.planificadoH != null ? horasLegibles(vigente.planificadoH) : "—"}
                    </TableCell>
                    <TableCell>
                      {vigente ? (
                        <div className="flex flex-wrap gap-1">
                          <Badge variant={vigente.avisos.dura > 0 ? "destructive" : "outline"}>
                            {vigente.avisos.dura} duras
                          </Badge>
                          <Badge variant="outline">{vigente.avisos.blanda} blandas</Badge>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-start justify-end gap-2">
                        {m.versiones > 0 ? (
                          <>
                            <Button variant="outline" size="sm" render={<Link href={`/planificacion/${m.mes}`} />}>
                              Ver tablero
                            </Button>
                            <Button variant="ghost" size="sm" render={<Link href={`/planificacion/${m.mes}/versiones`} />}>
                              Versiones
                            </Button>
                            {m.mes <= hoyISO().slice(0, 7) ? (
                              <Button variant="ghost" size="sm" render={<Link href={`/planificacion/${m.mes}/adherencia`} />}>
                                Seguimiento
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                        {editar && m.generable ? (
                          <BotonGenerar
                            key={m.borrador?.id ?? "nuevo"}
                            mes={m.mes}
                            nombreMes={nombreMes(m.mes)}
                            tamano="sm"
                            borrador={m.borrador}
                            accion={generarBorradorAccion}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
