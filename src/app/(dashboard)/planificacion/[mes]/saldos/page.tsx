import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { Campo } from "@/components/planificacion/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEditarPlan, requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { horasLegibles } from "@/lib/fechas";
import { fechasDelMes } from "@/lib/planificacion/motor";
import type { DiaSaldo } from "@/lib/planificacion/saldo";
import { saldosMes } from "@/lib/planificacion/seguimiento";
import { fechaDiaMes, nombreMes, saldoTexto } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import { borrarAjusteSaldoAccion, guardarAjusteSaldoAccion } from "../acciones";
import { PuntoAyuda } from "@/components/planificacion/punto-ayuda";

export const metadata: Metadata = { title: "Saldos" };
export const dynamic = "force-dynamic";

function Saldo({ h, previsto = false }: { h: number; previsto?: boolean }) {
  const r = Math.round(h * 100) / 100;
  return (
    <span className={cn("tabular-nums", r < 0 && "text-red-600", r > 0 && "text-emerald-700", previsto && "italic")}>{saldoTexto(h)}</span>
  );
}

const suma = (dias: readonly DiaSaldo[]) => dias.reduce((s, d) => s + d.saldo, 0);

export default async function PaginaSaldos({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ msg?: string; detalle?: string }>;
}) {
  // Lectura: supervisión, operaciones y dirección. Ajustes, solo supervisión.
  const usuario = await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const { msg, detalle } = await searchParams;
  const editar = puedeEditarPlan(usuario.rol);
  const d = await saldosMes(mes);
  const fechas = fechasDelMes(mes);
  const empiezaDespues = d != null && d.inicioSaldo > fechas[fechas.length - 1];
  const ajustes = (d?.agentes ?? []).flatMap((a) => a.ajustes.map((x) => ({ ...x, agente: a.numero, nombre: a.nombre })));

  return (
    <div className="space-y-6">
      <CabeceraMes
        mes={mes}
        nombreMes={nombreMes(mes)}
        ayuda="saldos"
        seccion="/saldos"
        titulo="Saldos"
        descripcion={
          <>
            Horas que le sobran (+) o le faltan (−) a cada persona para cumplir su contrato. Hasta ayer cuentan las horas que
            estuvo conectada; de hoy en adelante, las planificadas (en cursiva). Las vacaciones, libranzas y RTO cuentan como
            horas trabajadas, y un festivo, las horas de su turno de ese día.
          </>
        }
      />
      <AvisoMsg msg={msg} detalle={detalle} />

      {!d ? (
        <p className="text-sm text-muted-foreground">{nombreMes(mes)} no tiene versión publicada ni borrador: no hay plan del que sacar el saldo.</p>
      ) : empiezaDespues ? (
        <p className="text-sm text-muted-foreground">
          El saldo se lleva desde el {fechaDiaMes(d.inicioSaldo)}/{d.inicioSaldo.slice(0, 4)} (parámetro «Inicio del saldo»): este mes no cuenta.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Plan: v{d.version!.numero} {d.version!.estado === "publicada" ? "publicada" : "en borrador"} · real hasta el{" "}
            {fechaDiaMes(d.fechaDatos)} · saldo acumulado desde el {fechaDiaMes(d.inicioSaldo)}/{d.inicioSaldo.slice(0, 4)}. Solo agentes
            con contrato.
          </p>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Saldo por agente y semana</CardTitle>
              <CardDescription>
                «Arrastre»: saldo real de los meses anteriores. «Previsto a fin de mes»: arrastre + lo real + lo que queda
                planificado.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agente</TableHead>
                    <TableHead className="text-right">Contrato</TableHead>
                    {d.semanas.map((s) => (
                      <TableHead key={s.lunes} className="text-right">
                        Sem. {fechaDiaMes(s.lunes)}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">
                      Arrastre
                      <PuntoAyuda id="saldo-arrastre" />
                    </TableHead>
                    <TableHead className="text-right">Real del mes</TableHead>
                    <TableHead className="text-right">
                      Previsto a fin de mes
                      <PuntoAyuda id="saldo-previsto" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {d.agentes.map((a) => (
                    <TableRow key={a.numero}>
                      <TableCell>
                        {a.numero}
                        {a.nombre ? ` ${a.nombre}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{horasLegibles(a.contratoSemanalH)}/sem</TableCell>
                      {d.semanas.map((s) => {
                        const dias = a.dias.filter((x) => s.fechas.includes(x.fecha));
                        return (
                          <TableCell key={s.lunes} className="text-right">
                            {dias.length > 0 ? <Saldo h={suma(dias)} previsto={dias.some((x) => !x.cerrado)} /> : "—"}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <Saldo h={a.arrastre} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Saldo h={a.totales.real.saldo} />
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        <Saldo h={a.arrastre + a.totales.previsto.saldo} previsto={a.dias.some((x) => !x.cerrado)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle por día</CardTitle>
              <CardDescription>Despliega un agente para ver de dónde sale su saldo.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {d.agentes.map((a) => (
                <details key={a.numero} className="rounded border px-3 py-1.5">
                  <summary className="cursor-pointer text-sm">
                    {a.numero}
                    {a.nombre ? ` ${a.nombre}` : ""} · real {saldoTexto(a.totales.real.saldo)} · previsto {saldoTexto(a.totales.previsto.saldo)}
                  </summary>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Día</TableHead>
                        <TableHead className="text-right">Trabajadas</TableHead>
                        <TableHead className="text-right">Justificadas</TableHead>
                        <TableHead className="text-right">Contrato</TableHead>
                        <TableHead className="text-right">Ajustes</TableHead>
                        <TableHead className="text-right">Saldo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {a.dias
                        .filter((x) => x.trabajadas || x.justificadas || x.contrato || x.ajustes)
                        .map((x) => (
                          <TableRow key={x.fecha} className={cn(!x.cerrado && "italic text-muted-foreground")}>
                            <TableCell>
                              {fechaDiaMes(x.fecha)}
                              {x.cerrado ? "" : " (previsto)"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{horasLegibles(x.trabajadas)}</TableCell>
                            <TableCell className="text-right tabular-nums">{horasLegibles(x.justificadas)}</TableCell>
                            <TableCell className="text-right tabular-nums">{horasLegibles(x.contrato)}</TableCell>
                            <TableCell className="text-right tabular-nums">{x.ajustes ? saldoTexto(x.ajustes) : ""}</TableCell>
                            <TableCell className="text-right">
                              <Saldo h={x.saldo} previsto={!x.cerrado} />
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </details>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Ajustes manuales
                <PuntoAyuda id="saldo-ajustes" />
              </CardTitle>
              <CardDescription>
                Horas que no salen del tiempo logado (una formación fuera del sistema, una corrección acordada…). Se imputan a un
                día y quedan en el historial del mes con su motivo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {editar ? (
                <form action={guardarAjusteSaldoAccion} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_3fr_auto] md:items-end">
                  <input type="hidden" name="mes" value={mes} />
                  <Campo etiqueta="Agente" htmlFor="aj-agente">
                    <SelectNativo id="aj-agente" name="agenteNumero" required defaultValue="">
                      <option value="" disabled>
                        Elige…
                      </option>
                      {d.agentes.map((a) => (
                        <option key={a.numero} value={a.numero}>
                          {a.numero}
                          {a.nombre ? ` ${a.nombre}` : ""}
                        </option>
                      ))}
                    </SelectNativo>
                  </Campo>
                  <Campo etiqueta="Día" htmlFor="aj-fecha">
                    <Input id="aj-fecha" name="fecha" type="date" required min={fechas[0]} max={fechas[fechas.length - 1]} defaultValue={fechas[0]} />
                  </Campo>
                  <Campo etiqueta="Horas (±)" htmlFor="aj-horas">
                    <Input id="aj-horas" name="horas" required inputMode="decimal" placeholder="1,5 o -2" />
                  </Campo>
                  <Campo etiqueta="Motivo" htmlFor="aj-motivo">
                    <Input id="aj-motivo" name="motivo" required minLength={10} maxLength={300} placeholder="p. ej. formación de producto fuera del sistema" />
                  </Campo>
                  <Button type="submit">Añadir</Button>
                </form>
              ) : null}
              {ajustes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ningún ajuste este mes.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Día</TableHead>
                      <TableHead>Agente</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Quién</TableHead>
                      {editar ? <TableHead className="text-right">Acciones</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ajustes.map((x) => (
                      <TableRow key={x.id}>
                        <TableCell>{fechaDiaMes(x.fecha)}</TableCell>
                        <TableCell>
                          {x.agente}
                          {x.nombre ? ` ${x.nombre}` : ""}
                        </TableCell>
                        <TableCell className="text-right">
                          <Saldo h={x.horas} />
                        </TableCell>
                        <TableCell>{x.motivo}</TableCell>
                        <TableCell>{x.autor}</TableCell>
                        {editar ? (
                          <TableCell className="text-right">
                            <form action={borrarAjusteSaldoAccion}>
                              <input type="hidden" name="mes" value={mes} />
                              <input type="hidden" name="id" value={x.id} />
                              <Button type="submit" variant="destructive" size="xs">
                                Borrar
                              </Button>
                            </form>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
