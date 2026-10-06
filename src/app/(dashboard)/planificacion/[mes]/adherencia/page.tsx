import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { Muestra } from "@/components/planificacion/campos";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { hoyISO, horasLegibles } from "@/lib/fechas";
import { resumirAdherencia, resumirPor, type ResumenAdherencia } from "@/lib/planificacion/adherencia";
import { fechasDelMes, lunesDe } from "@/lib/planificacion/motor";
import { adherenciaRango } from "@/lib/planificacion/seguimiento";
import { fechaDiaMes, nombreMes } from "@/lib/planificacion/tablero";
import { PuntoAyuda } from "@/components/planificacion/punto-ayuda";

export const metadata: Metadata = { title: "Adherencia" };
export const dynamic = "force-dynamic";

const pct = (x: number | null) =>
  x == null ? "—" : `${(x * 100).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
const ORIGEN: Record<string, string> = { motor: "generada automáticamente", copia: "copia", recalculo: "regenerada", importada: "importada del Excel" };
/** Desviaciones de un agente y día que se listan en el detalle. */
const UMBRAL_DETALLE_MIN = 30;

function Celdas({ r }: { r: ResumenAdherencia }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">{horasLegibles(r.planificadoH)}</TableCell>
      <TableCell className="text-right tabular-nums">{horasLegibles(r.correctoH)}</TableCell>
      <TableCell className="text-right tabular-nums">{horasLegibles(r.aDemandaH)}</TableCell>
      <TableCell className="text-right tabular-nums">{horasLegibles(r.otroH)}</TableCell>
      <TableCell className="text-right tabular-nums">{horasLegibles(r.sinConectarH)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{pct(r.porTurno)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{pct(r.porCliente)}</TableCell>
    </>
  );
}

function Cabeceras({ primera, extra, ayuda = false }: { primera: string; extra?: string; ayuda?: boolean }) {
  return (
    <TableRow>
      <TableHead>{primera}</TableHead>
      <TableHead className="text-right">Planificado</TableHead>
      <TableHead className="text-right">
        Correcto
        {ayuda ? <PuntoAyuda id="adh-columnas" /> : null}
      </TableHead>
      <TableHead className="text-right">A demanda</TableHead>
      <TableHead className="text-right">Otro cliente</TableHead>
      <TableHead className="text-right">Sin conectar</TableHead>
      <TableHead className="text-right">
        Por turno
        {ayuda ? <PuntoAyuda id="adh-turno" /> : null}
      </TableHead>
      <TableHead className="text-right">
        Por cliente
        {ayuda ? <PuntoAyuda id="adh-cliente" /> : null}
      </TableHead>
      {extra ? (
        <TableHead className="text-right">
          {extra}
          {ayuda ? <PuntoAyuda id="adh-fuera" /> : null}
        </TableHead>
      ) : null}
    </TableRow>
  );
}

export default async function PaginaAdherencia({ params }: { params: Promise<{ mes: string }> }) {
  await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const fechas = fechasDelMes(mes);
  const empezado = fechas[0] <= hoyISO();

  const d = empezado ? await adherenciaRango(fechas[0], fechas[fechas.length - 1]) : null;
  const v = d?.versiones[0];
  const total = d ? resumirAdherencia(d.filas) : null;
  const fuera = new Map<string, number>();
  for (const x of d?.dias ?? []) fuera.set(x.agenteNumero, (fuera.get(x.agenteNumero) ?? 0) + x.fueraPlanMin / 60);
  const fueraTotal = [...fuera.values()].reduce((s, h) => s + h, 0);
  const color = new Map((d?.clientes ?? []).map((c) => [c.codigo, c.color]));
  const nombreCliente = new Map((d?.clientes ?? []).map((c) => [c.codigo, c.nombre]));
  const quien = (n: string) => `${n}${d?.nombres[n] ? ` ${d.nombres[n]}` : ""}`;
  const detalle = (d?.filas ?? [])
    .filter((f) => f.otroMin >= UMBRAL_DETALLE_MIN || f.sinConectarMin >= UMBRAL_DETALLE_MIN)
    .sort((a, b) => b.otroMin + b.sinConectarMin - (a.otroMin + a.sinConectarMin));

  return (
    <div className="space-y-6">
      <CabeceraMes
        mes={mes}
        nombreMes={nombreMes(mes)}
        ayuda="adherencia"
        seccion="/adherencia"
        titulo="Adherencia"
        descripcion={
          <>
            Compara el plan con lo que pasó. <strong>Por turno</strong>: si estaba conectada cuando le tocaba.{" "}
            <strong>Por cliente</strong>: además, si estaba en el cliente que le tocaba.{" "}
            {d ? `Datos hasta ${d.hasta === hoyISO() ? "ahora" : fechaDiaMes(d.hasta)}.` : ""}
          </>
        }
      />

      {!d ? (
        <p className="text-sm text-muted-foreground">{nombreMes(mes)} aún no ha empezado.</p>
      ) : !v?.numero ? (
        <p className="text-sm text-muted-foreground">
          {nombreMes(mes)} no tiene versión publicada ni borrador: no hay plan con el que comparar.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Plan: v{v.numero} {v.estado === "publicada" ? "publicada" : "en borrador (aún no publicada)"}
            {v.origen ? `, ${ORIGEN[v.origen] ?? v.origen}` : ""}.
            {d.vivoDesde ? ` Desde el ${fechaDiaMes(d.vivoDesde)}, las horas conectadas se leen al momento (aún no estaban cargadas).` : ""}
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <TarjetaKpi titulo="Planificado" valor={horasLegibles(total!.planificadoH)} sub="Hasta ahora" />
            <TarjetaKpi titulo="Adherencia por turno" valor={pct(total!.porTurno)} sub="Conectado cuando tocaba" />
            <TarjetaKpi titulo="Adherencia por cliente" valor={pct(total!.porCliente)} sub="Y con el usuario que tocaba" />
            <TarjetaKpi titulo="Sin conectar" valor={horasLegibles(total!.sinConectarH)} sub="Dentro de lo planificado" />
            <TarjetaKpi titulo="Fuera del plan" valor={horasLegibles(fueraTotal)} sub="Logado sin estar planificado" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por agente</CardTitle>
              <CardDescription>
                «Otro cliente»: conectado, pero con el usuario de otro cliente. «Fuera del plan»: horas extra o cambios que no se
                pasaron al plan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <Cabeceras primera="Agente" extra="Fuera del plan" ayuda />
                </TableHeader>
                <TableBody>
                  {[...resumirPor(d.filas, (f) => f.agenteNumero)].map(([n, r]) => (
                    <TableRow key={n}>
                      <TableCell>{quien(n)}</TableCell>
                      <Celdas r={r} />
                      <TableCell className="text-right tabular-nums">{horasLegibles(fuera.get(n) ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-semibold">
                    <TableCell>Total</TableCell>
                    <Celdas r={total!} />
                    <TableCell className="text-right tabular-nums">{horasLegibles(fueraTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por cliente planificado</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <Cabeceras primera="Cliente" />
                  </TableHeader>
                  <TableBody>
                    {[...resumirPor(d.filas, (f) => f.clienteCodigo)].map(([c, r]) => (
                      <TableRow key={c}>
                        <TableCell>
                          <span className="inline-flex items-center gap-2">
                            <Muestra color={color.get(c) ?? "#cccccc"} />
                            {nombreCliente.get(c) ?? c}
                          </span>
                        </TableCell>
                        <Celdas r={r} />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por semana</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <Cabeceras primera="Semana del" />
                  </TableHeader>
                  <TableBody>
                    {[...resumirPor(d.filas, (f) => lunesDe(f.fecha))].map(([l, r]) => (
                      <TableRow key={l}>
                        <TableCell>{fechaDiaMes(l)}</TableCell>
                        <Celdas r={r} />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desviaciones de {UMBRAL_DETALLE_MIN} min o más</CardTitle>
              <CardDescription>Agente, día y cliente planificado con tiempo en otro cliente o sin conectar; las mayores primero.</CardDescription>
            </CardHeader>
            <CardContent>
              {detalle.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguna.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Día</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead>Planificado en</TableHead>
                      <TableHead className="text-right">Planificado</TableHead>
                      <TableHead className="text-right">Otro cliente</TableHead>
                      <TableHead className="text-right">Sin conectar</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalle.slice(0, 100).map((f) => (
                      <TableRow key={`${f.fecha}|${f.agenteNumero}|${f.clienteCodigo}`}>
                        <TableCell>{fechaDiaMes(f.fecha)}</TableCell>
                        <TableCell>{quien(f.agenteNumero)}</TableCell>
                        <TableCell>{f.clienteCodigo}</TableCell>
                        <TableCell className="text-right tabular-nums">{horasLegibles(f.planificadoMin / 60)}</TableCell>
                        <TableCell className="text-right tabular-nums">{horasLegibles(f.otroMin / 60)}</TableCell>
                        <TableCell className="text-right tabular-nums">{horasLegibles(f.sinConectarMin / 60)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {detalle.length > 100 ? <p className="pt-2 text-xs text-muted-foreground">Se muestran las 100 mayores de {detalle.length}.</p> : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
