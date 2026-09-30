import type { Metadata } from "next";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Campo, Casilla } from "@/components/planificacion/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import { ayerISO, fechaCorta, hoyISO } from "@/lib/fechas";
import { leerEquipo, nombresAgentes } from "@/lib/planificacion/equipo";
import {
  aprenderPatrones,
  compararPatrones,
  generarFranjas,
  horasTexto,
  lunesDe,
  sumarDias,
  textoTramos,
  ultimoDomingo,
  type SesionDia,
  type Tramo,
  type TramoDia,
} from "@/lib/planificacion/motor";
import { leerParametrosPlan } from "@/lib/planificacion/parametros";
import * as repo from "@/lib/planificacion/repositorio";
import { festivosServicio } from "@/lib/rdb/queries/planificacion";
import { cn } from "@/lib/utils";
import { aceptarPatronAprendido, asignarTurnoPlan, guardarPatronPlan } from "../acciones";

export const metadata: Metadata = { title: "Patrones y turnos" };
export const dynamic = "force-dynamic";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const SEMANAS_APRENDER = 8;
const horasDe = (tramos: readonly Tramo[]) => tramos.reduce((a, t) => a + (t.finMin - t.inicioMin), 0) / 60;
const delDia = (tramos: readonly TramoDia[], d: number) => textoTramos(tramos.filter((t) => t.diaSemana === d));

/** Configurado frente a aprendido, día a día (en ámbar lo que no coincide). */
function Comparacion({
  rotacion,
  configurado,
  aprendido,
  semanas,
}: {
  rotacion: "A" | "B";
  configurado: TramoDia[];
  aprendido: TramoDia[] | null;
  semanas: number;
}) {
  if (!aprendido) {
    return <div className="text-xs text-muted-foreground">Semana {rotacion}: sin sesiones en la ventana; no se propone nada.</div>;
  }
  const comp = compararPatrones(configurado, aprendido);
  const dias = [0, 1, 2, 3, 4, 5, 6].filter((d) => d < 5 || comp.dias.some((x) => x.diaSemana === d));
  const distinto = new Set(comp.dias.filter((x) => x.distintos > 0).map((x) => x.diaSemana));
  return (
    <table className="text-xs">
      <thead>
        <tr className="text-muted-foreground">
          <th className="pr-2 text-left font-medium">
            {rotacion} <span className="font-normal">({semanas} sem.)</span>
          </th>
          {dias.map((d) => (
            <th key={d} className="px-1.5 text-left font-medium">
              {DIAS[d]}
            </th>
          ))}
          <th className="px-1.5 text-right font-medium">Total</th>
        </tr>
      </thead>
      <tbody>
        {[
          { etiqueta: "Configurado", tramos: configurado },
          { etiqueta: "Aprendido", tramos: aprendido },
        ].map(({ etiqueta, tramos }) => (
          <tr key={etiqueta}>
            <td className="pr-2 text-muted-foreground">{etiqueta}</td>
            {dias.map((d) => (
              <td key={d} className={cn("px-1.5 whitespace-nowrap", distinto.has(d) && "bg-amber-100")}>
                {delDia(tramos, d) || "—"}
              </td>
            ))}
            <td className="px-1.5 text-right whitespace-nowrap tabular-nums">{horasTexto(horasDe(tramos))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function PaginaPatronesPlan({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string; aprender?: string }>;
}) {
  await requireRol(...ROLES_PLAN_EDICION);
  const { msg, detalle, editar, aprender } = await searchParams;
  const p = leerParametrosPlan();
  const eq = leerEquipo(p.equipo, ayerISO());
  const nombres = nombresAgentes(eq);
  const patrones = repo.leerPatrones().sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
  const porId = new Map(patrones.map((x) => [x.id, x]));
  const asignaciones = repo.leerAsignacionesTurno();
  const hoy = hoyISO();
  const proximoLunes = lunesDe(sumarDias(hoy, 7));
  const vigenteDe = (numero: string, fecha = hoy) =>
    asignaciones
      .filter((t) => t.agenteNumero === numero && t.desde <= fecha && (t.hasta == null || t.hasta >= fecha))
      .sort((a, b) => b.desde.localeCompare(a.desde))[0];
  const usos = new Map<number, number>();
  for (const a of eq.plantilla) {
    const v = vigenteDe(a.numero);
    for (const id of new Set([v?.patronAId, v?.patronBId])) if (id != null) usos.set(id, (usos.get(id) ?? 0) + 1);
  }
  const enEdicion = editar ? patrones.find((x) => x.id === Number(editar)) : undefined;
  const nombreAgente = (n: string) => `${n} ${nombres.get(n) ?? ""}`.trim();

  // ---------- Aprender patrones (solo si se pide: lee 8 semanas de sesiones) ----------
  let aprendidos: {
    numero: string;
    configuradoA: TramoDia[];
    configuradoB: TramoDia[];
    A: ReturnType<typeof aprenderPatrones>["A"];
    B: ReturnType<typeof aprenderPatrones>["B"];
    distintos: number;
  }[] = [];
  let ventana: { desde: string; hasta: string; avisoFestivos: string | null } | null = null;
  if (aprender === "1") {
    const hasta = ultimoDomingo(ayerISO());
    const desde = sumarDias(hasta, -7 * SEMANAS_APRENDER + 1);
    const semanas = Array.from({ length: SEMANAS_APRENDER }, (_, i) => sumarDias(desde, 7 * i));
    let festivos = new Set<string>();
    let avisoFestivos: string | null = null;
    try {
      const f = await festivosServicio(desde, hasta);
      festivos = new Set(f.festivos.filter((x) => x.servicio === p.servicioCalendario).map((x) => x.fecha));
    } catch (error) {
      console.error("[planificacion] festivos para aprender patrones:", error);
      avisoFestivos = "No se pudieron leer los festivos de RDBv2: los días festivos cuentan como días sin trabajo.";
    }
    ventana = { desde, hasta, avisoFestivos };
    const agenteDe = new Map(eq.usuarios.map((u) => [u.usrName, u.agenteNumero]));
    const sesiones = new Map<string, SesionDia[]>();
    for (const s of repo.sesionesRango(desde, hasta)) {
      const n = agenteDe.get(s.usrName);
      if (n) sesiones.set(n, [...(sesiones.get(n) ?? []), s]);
    }
    const franjas = generarFranjas(p.inicioDiaMin, p.finDiaMin, p.pasoMin);
    aprendidos = eq.plantilla.map((a) => {
      const r = aprenderPatrones(sesiones.get(a.numero) ?? [], { semanas, semanaA: p.semanaA, festivos, franjas, pasoMin: p.pasoMin });
      const v = vigenteDe(a.numero);
      const configuradoA = (v?.patronAId != null ? porId.get(v.patronAId)?.tramos : undefined) ?? [];
      const configuradoB = (v?.patronBId != null ? porId.get(v.patronBId)?.tramos : undefined) ?? [];
      const distintos =
        (r.A ? compararPatrones(configuradoA, r.A.tramos).distintos : 0) +
        (r.B ? compararPatrones(configuradoB, r.B.tramos).distintos : 0);
      return { numero: a.numero, configuradoA, configuradoB, A: r.A, B: r.B, distintos };
    });
  }

  const selectorPatron = (nombre: string, porDefecto?: number | null) => (
    <SelectNativo name={nombre} defaultValue={porDefecto ?? ""}>
      <option value="">— (sin turno)</option>
      {patrones
        .filter((x) => x.activo || x.id === porDefecto)
        .map((x) => (
          <option key={x.id} value={x.id}>
            {x.nombre}
          </option>
        ))}
    </SelectNativo>
  );

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} detalle={detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Patrones de turno</CardTitle>
          <CardDescription>
            Tramos por día de la semana. Cada agente tiene un patrón para la semana A y otro para la B; la rotación alterna
            desde el lunes {fechaCorta(p.semanaA)} (semana A).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Patrón</TableHead>
                {DIAS.map((d) => (
                  <TableHead key={d}>{d}</TableHead>
                ))}
                <TableHead className="text-right">h/sem.</TableHead>
                <TableHead className="text-right">Agentes</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {patrones.map((x) => (
                <TableRow key={x.id} className={!x.activo ? "opacity-50" : undefined}>
                  <TableCell className="max-w-72 text-sm font-medium whitespace-normal">
                    {x.nombre} {!x.activo ? <Badge variant="outline">inactivo</Badge> : null}
                  </TableCell>
                  {DIAS.map((_, d) => (
                    <TableCell key={d} className="text-xs whitespace-nowrap">
                      {delDia(x.tramos, d) || "—"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums">{horasDe(x.tramos).toLocaleString("es-ES")}</TableCell>
                  <TableCell className="text-right tabular-nums">{usos.get(x.id) ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="xs" render={<a href={`?editar=${x.id}`} />}>
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{enEdicion ? `Editar «${enEdicion.nombre}»` : "Nuevo patrón"}</CardTitle>
          <CardDescription>
            Tramos como en la plantilla: «9-14, 16-20» o «9:30-14». Vacío = no trabaja ese día.
            {enEdicion && (usos.get(enEdicion.id) ?? 0) > 0
              ? ` Lo usan ${usos.get(enEdicion.id)} agentes: el cambio vale para todos en el próximo borrador.`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={guardarPatronPlan} key={enEdicion?.id ?? "nuevo"} className="space-y-4">
            {enEdicion ? <input type="hidden" name="id" value={enEdicion.id} /> : null}
            <div className="grid gap-3 md:grid-cols-[2fr_auto]">
              <Campo etiqueta="Nombre" htmlFor="nombre">
                <Input id="nombre" name="nombre" defaultValue={enEdicion?.nombre} required minLength={3} maxLength={80} />
              </Campo>
              <div className="flex items-end pb-1.5">
                <Casilla etiqueta="Activo" name="activo" defaultChecked={enEdicion?.activo ?? true} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {DIAS.map((d, i) => (
                <Campo key={d} etiqueta={d} htmlFor={`d${i}`}>
                  <Input id={`d${i}`} name={`d${i}`} defaultValue={enEdicion ? delDia(enEdicion.tramos, i) : ""} placeholder="9-14, 16-20" />
                </Campo>
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="submit">{enEdicion ? "Guardar" : "Crear patrón"}</Button>
              {enEdicion ? (
                <Button variant="outline" render={<a href="?" />}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Turnos de la plantilla</CardTitle>
          <CardDescription>
            Patrón A y B de cada agente desde una fecha. Si ya hay una asignación que empieza ese día se sustituye; si no,
            se añade y manda la de fecha más reciente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead>Semana A</TableHead>
                <TableHead>Semana B</TableHead>
                <TableHead>Desde</TableHead>
                <TableHead>Hasta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eq.plantilla.flatMap((a) => {
                const lista = asignaciones
                  .filter((t) => t.agenteNumero === a.numero && (t.hasta == null || t.hasta >= hoy))
                  .sort((x, y) => x.desde.localeCompare(y.desde));
                if (lista.length === 0) {
                  return [
                    <TableRow key={a.numero}>
                      <TableCell className="font-medium">{nombreAgente(a.numero)}</TableCell>
                      <TableCell colSpan={4} className="text-muted-foreground">
                        sin turno vigente
                      </TableCell>
                    </TableRow>,
                  ];
                }
                return lista.map((t, i) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{i === 0 ? nombreAgente(a.numero) : ""}</TableCell>
                    <TableCell className="text-xs whitespace-normal">{t.patronAId != null ? porId.get(t.patronAId)?.nombre : "—"}</TableCell>
                    <TableCell className="text-xs whitespace-normal">{t.patronBId != null ? porId.get(t.patronBId)?.nombre : "—"}</TableCell>
                    <TableCell className="text-sm">{fechaCorta(t.desde)}</TableCell>
                    <TableCell className="text-sm">{t.hasta ? fechaCorta(t.hasta) : "—"}</TableCell>
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>

          <form action={asignarTurnoPlan} className="grid items-end gap-3 md:grid-cols-[1fr_2fr_2fr_1fr_1fr_auto]">
            <Campo etiqueta="Agente">
              <SelectNativo name="agenteNumero" required>
                {eq.plantilla.map((a) => (
                  <option key={a.numero} value={a.numero}>
                    {nombreAgente(a.numero)}
                  </option>
                ))}
              </SelectNativo>
            </Campo>
            <Campo etiqueta="Semana A">{selectorPatron("patronAId")}</Campo>
            <Campo etiqueta="Semana B">{selectorPatron("patronBId")}</Campo>
            <Campo etiqueta="Desde" htmlFor="desde">
              <Input id="desde" name="desde" type="date" defaultValue={proximoLunes} required />
            </Campo>
            <Campo etiqueta="Hasta (opcional)" htmlFor="hasta">
              <Input id="hasta" name="hasta" type="date" />
            </Campo>
            <Button type="submit">Asignar</Button>
          </form>
        </CardContent>
      </Card>

      <Card id="aprender">
        <CardHeader>
          <CardTitle className="text-base">Aprender patrones</CardTitle>
          <CardDescription>
            Propone el patrón A/B de cada agente a partir de sus sesiones reales (todos sus usuarios de Altitude unidos) en
            las últimas {SEMANAS_APRENDER} semanas completas: una franja entra si la trabajó más de la mitad de los días,
            al menos media franja. Las semanas sin ninguna sesión (vacaciones, bajas) y los festivos no cuentan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {aprender !== "1" || !ventana ? (
            <Button variant="outline" render={<a href="?aprender=1#aprender" />}>
              Calcular con las últimas {SEMANAS_APRENDER} semanas
            </Button>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Ventana: del {fechaCorta(ventana.desde)} al {fechaCorta(ventana.hasta)}. Aceptar crea (o reutiliza) el
                patrón con esos tramos y se lo asigna al agente desde la fecha elegida.
              </p>
              {ventana.avisoFestivos ? <p className="text-sm text-amber-700">{ventana.avisoFestivos}</p> : null}
              <div className="divide-y rounded-md border">
                {aprendidos.map((a) => (
                  <div key={a.numero} className="grid gap-3 p-3 lg:grid-cols-[12rem_1fr_auto]">
                    <div>
                      <div className="font-medium">{nombreAgente(a.numero)}</div>
                      {a.A == null && a.B == null ? (
                        <Badge variant="outline">sin sesiones</Badge>
                      ) : a.distintos === 0 ? (
                        <Badge className="bg-emerald-100 text-emerald-900">coincide</Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-900">{horasTexto(a.distintos / 60)} distintas</Badge>
                      )}
                    </div>
                    <div className="space-y-2 overflow-x-auto">
                      <Comparacion rotacion="A" configurado={a.configuradoA} aprendido={a.A?.tramos ?? null} semanas={a.A?.semanas ?? 0} />
                      <Comparacion rotacion="B" configurado={a.configuradoB} aprendido={a.B?.tramos ?? null} semanas={a.B?.semanas ?? 0} />
                    </div>
                    {(a.A || a.B) && a.distintos > 0 ? (
                      <form action={aceptarPatronAprendido} className="flex flex-col items-end gap-2">
                        <input type="hidden" name="agenteNumero" value={a.numero} />
                        <input type="hidden" name="tramosA" value={a.A ? JSON.stringify(a.A.tramos) : ""} />
                        <input type="hidden" name="tramosB" value={a.B ? JSON.stringify(a.B.tramos) : ""} />
                        <Campo etiqueta="Desde" htmlFor={`desde-${a.numero}`}>
                          <Input id={`desde-${a.numero}`} name="desde" type="date" defaultValue={proximoLunes} required />
                        </Campo>
                        <Button type="submit" size="sm">
                          Aceptar propuesta
                        </Button>
                      </form>
                    ) : (
                      <div />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
