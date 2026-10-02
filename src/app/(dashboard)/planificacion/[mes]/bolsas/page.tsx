import type { Metadata } from "next";
import { format } from "date-fns";
import { notFound } from "next/navigation";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { EstimacionFinCampania } from "@/components/planificacion/estimacion-fin";
import { Muestra } from "@/components/planificacion/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEditarPlan, requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { horasLegibles } from "@/lib/fechas";
import { bolsasDelMes } from "@/lib/planificacion/bolsas";
import { estimacionesFin } from "@/lib/planificacion/estimaciones";
import { fechasDelMes, lunesDe, semanasDelMes, type ObjetivoSemana } from "@/lib/planificacion/motor";
import { leerParametrosPlan } from "@/lib/planificacion/parametros";
import * as repo from "@/lib/planificacion/repositorio";
import { barrasBolsa, fechaDiaMes, horasPorCliente, nombreMes } from "@/lib/planificacion/tablero";
import { cargarTablero } from "@/lib/planificacion/vistas";
import { confirmarBolsaAccion, guardarObjetivosAccion } from "../acciones";

export const metadata: Metadata = { title: "Bolsas y objetivos" };
export const dynamic = "force-dynamic";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (mes: string) => `${MESES_CORTOS[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
/** Valor para un <input> con coma decimal y sin separador de miles: 1263,82. */
const valorInput = (h: number | null | undefined) => (h == null ? "" : String(Math.round(h * 100) / 100).replace(".", ","));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** «4.310 vivos de 6.177 → 2.560 cierres a 14,57/h (medido) = 176 h, reparto uniforme». */
function explicarObjetivo(o: ObjetivoSemana | undefined): string | null {
  const d = o?.detalle;
  if (!d) return null;
  const n = (v: unknown, dec = 0) =>
    num(v)?.toLocaleString("es-ES", { minimumFractionDigits: dec, maximumFractionDigits: dec }) ?? "?";
  const partes: string[] = [];
  if (num(d.total) != null && num(d.vivos) != null) {
    const pct = num(d.pctVivosObjetivo)?.toLocaleString("es-ES", { maximumFractionDigits: 2 }) ?? "?";
    partes.push(`${n(d.vivos)} vivos de ${n(d.total)} (objetivo: dejar el ${pct} % vivo)`);
  }
  if (num(d.cierresNecesarios) != null) partes.push(`${n(d.cierresNecesarios)} cierres`);
  if (num(d.ritmo) != null) partes.push(`a ${n(d.ritmo, 2)} cierres/h (${d.ritmoOrigen === "manual" ? "fijado a mano" : "medido"})`);
  if (num(d.horasLista) != null) partes.push(`= ${horasLegibles(num(d.horasLista))}`);
  if (typeof d.criterio === "string") partes.push(`reparto: ${d.criterio}`);
  return partes.length > 0 ? partes.join(" · ") : null;
}

export default async function PaginaBolsas({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ msg?: string; detalle?: string }>;
}) {
  // Lectura: supervisión, operaciones y dirección. Confirmar, solo supervisión.
  const usuario = await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const { msg, detalle } = await searchParams;
  const editar = puedeEditarPlan(usuario.rol);

  const p = leerParametrosPlan();
  const clientes = repo.leerClientes(p.equipo);
  const { laborablesMes, filas } = await bolsasDelMes(mes);
  const datos = cargarTablero(mes);
  const manuales = repo.leerObjetivosManuales(mes);
  const estimaciones = estimacionesFin(datos?.entrada ?? null);

  // Lo planificado en la versión vigente (si la hay), por cliente y semana
  const semanaDe = datos ? Object.fromEntries(datos.entrada.dias.map((d) => [d.fecha, d.lunes])) : {};
  const horas = datos ? horasPorCliente(datos.bloques, semanaDe) : new Map<string, { total: number; porSemana: Record<string, number> }>();
  const barras = datos ? barrasBolsa(datos.entrada.clientes, horas, datos.entrada.objetivos, datos.entrada.bolsas) : [];
  const semanas = datos
    ? semanasDelMes(datos.entrada.dias).map((s) => ({ lunes: s.lunes, rotacion: s.rotacion as string | null, laborables: s.laborables as number | null }))
    : [...new Set(fechasDelMes(mes).map(lunesDe))].map((lunes) => ({ lunes, rotacion: null, laborables: null }));
  const v = datos ? `v${datos.version.numero}` : null;

  const conBolsa = clientes.filter(
    (c) => c.modo === "resto" || c.modo === "a_demanda" || filas.some((f) => f.cliente === c.codigo && (f.confirmada || f.prorrateo)),
  );
  const conObjetivo = clientes.filter((c) => c.modo === "objetivo");

  return (
    <div className="space-y-6">
      <CabeceraMes
        mes={mes}
        nombreMes={nombreMes(mes)}
        ayuda="bolsas"
        seccion="/bolsas"
        titulo="Bolsas y objetivos"
        descripcion={
          <>
            Supervisión confirma la bolsa de cada mes; mientras no lo haga, vale la última confirmada prorrateada por días
            laborables ({nombreMes(mes)} tiene {laborablesMes}). Los objetivos semanales de los clientes salientes salen de la
            lista y el ritmo de cierre; fijar uno a mano prevalece. Todo se aplica al generar o regenerar el borrador
            {v ? `; lo «usado» y lo «planificado» son de la ${v}` : ""}.
          </>
        }
      />
      <AvisoMsg msg={msg} detalle={detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bolsas de horas</CardTitle>
          <CardDescription>
            Los clientes que «cuentan como» otro (BD y LX con GH) comparten su bolsa: lo planificado de la cabeza es el del grupo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Por defecto (prorrateo)</TableHead>
                <TableHead>Confirmada</TableHead>
                {v ? <TableHead className="text-right">Usada en la {v}</TableHead> : null}
                {v ? <TableHead className="text-right">Planificado en la {v}</TableHead> : null}
                {editar ? <TableHead>Confirmar</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {conBolsa.map((c) => {
                const f = filas.find((x) => x.cliente === c.codigo);
                const usada = datos?.entrada.bolsas.find((b) => b.cliente === c.codigo);
                const barra = barras.find((b) => b.cliente === c.codigo && b.miembroDe == null);
                return (
                  <TableRow key={c.codigo}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <Muestra color={c.color} /> {c.codigo}
                        <span className="font-normal text-muted-foreground">{c.nombre}</span>
                        {c.modo === "a_demanda" ? <Badge variant="outline">a demanda: informativa</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {f?.prorrateo ? (
                        <span title={`Bolsa de ${mesCorto(f.prorrateo.baseMes)} × laborables de ${nombreMes(mes)} ÷ laborables de ${mesCorto(f.prorrateo.baseMes)}`}>
                          {horasLegibles(f.prorrateo.baseHoras)} ({mesCorto(f.prorrateo.baseMes)}) × {f.prorrateo.laborablesMes}/
                          {f.prorrateo.laborablesBase} = <strong>{horasLegibles(f.prorrateo.horas)}</strong>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">sin bolsa anterior</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {f?.confirmada ? (
                        <>
                          <strong>{horasLegibles(f.confirmada.horas)}</strong>{" "}
                          <span className="text-xs text-muted-foreground">
                            ({f.confirmada.origen === "prorrateo" ? "el prorrateo" : "a mano"}
                            {f.confirmada.por ? `, ${f.confirmada.por}` : ""}
                            {f.confirmada.at ? ` ${format(f.confirmada.at, "dd/MM/yyyy")}` : ""})
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">sin confirmar</span>
                      )}
                    </TableCell>
                    {v ? (
                      <TableCell className="text-right tabular-nums">
                        {usada ? horasLegibles(usada.horas) : "—"}
                        {usada && f?.bolsa && Math.abs(usada.horas - f.bolsa.horas) > 0.004 ? (
                          <div className="text-xs text-amber-700">ahora {horasLegibles(f.bolsa.horas)}: regenerar</div>
                        ) : null}
                      </TableCell>
                    ) : null}
                    {v ? (
                      <TableCell className="text-right tabular-nums">
                        {barra ? horasLegibles(barra.horas) : "—"}
                        {barra && barra.segmentos.length > 1 ? (
                          <div className="text-xs text-muted-foreground">{barra.segmentos.map((s) => s.cliente).join(" + ")}</div>
                        ) : null}
                      </TableCell>
                    ) : null}
                    {editar ? (
                      <TableCell>
                        <form action={confirmarBolsaAccion} className="flex items-center gap-2">
                          <input type="hidden" name="mes" value={mes} />
                          <input type="hidden" name="clienteCodigo" value={c.codigo} />
                          <label className="sr-only" htmlFor={`bolsa-${c.codigo}`}>
                            Horas de la bolsa de {c.codigo}
                          </label>
                          <Input
                            id={`bolsa-${c.codigo}`}
                            name="horas"
                            inputMode="decimal"
                            className="w-28 text-right tabular-nums"
                            defaultValue={valorInput(f?.confirmada?.horas ?? f?.prorrateo?.horas)}
                          />
                          <Button type="submit" size="sm" name="accion" value="confirmar">
                            Confirmar
                          </Button>
                          {f?.confirmada ? (
                            <Button type="submit" size="sm" variant="ghost" name="accion" value="quitar">
                              Quitar
                            </Button>
                          ) : null}
                        </form>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {conObjetivo.map((c) => {
        const calculados = (datos?.entrada.objetivos ?? []).filter((o) => o.cliente === c.codigo);
        const suyos = new Map(manuales.filter((m) => m.clienteCodigo === c.codigo).map((m) => [m.semanaLunes, m.horas]));
        const explicacion = explicarObjetivo(calculados[0]);
        const calculado = (lunes: string) => {
          const o = calculados.find((x) => x.semanaLunes === lunes);
          if (!o) return null;
          return o.origen === "manual" ? (num(o.detalle?.calculado) ?? null) : o.horas;
        };
        const totalCalculado = semanas.reduce((a, s) => a + (calculado(s.lunes) ?? 0), 0);
        return (
          <Card key={c.codigo}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Muestra color={c.color} /> Objetivos semanales de {c.codigo}
                <span className="text-sm font-normal text-muted-foreground">{c.nombre}</span>
              </CardTitle>
              <CardDescription>
                {explicacion ?? (datos ? "Sin datos de la lista o del ritmo al generar." : "Genera un borrador para ver lo calculado.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {estimaciones.find((x) => x.cliente === c.codigo) ? (
                <EstimacionFinCampania e={estimaciones.find((x) => x.cliente === c.codigo)!} />
              ) : null}
              <form action={guardarObjetivosAccion} className="space-y-3">
                <input type="hidden" name="mes" value={mes} />
                <input type="hidden" name="clienteCodigo" value={c.codigo} />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Semana</TableHead>
                      {v ? <TableHead className="text-right">Calculado ({v})</TableHead> : null}
                      <TableHead>Fijado a mano</TableHead>
                      {v ? <TableHead className="text-right">Planificado en la {v}</TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {semanas.map((s) => (
                      <TableRow key={s.lunes}>
                        <TableCell>
                          {fechaDiaMes(s.lunes)}
                          {s.rotacion ? <span className="text-muted-foreground"> · {s.rotacion}</span> : null}
                          {s.laborables != null ? (
                            <span className="text-xs text-muted-foreground"> · {s.laborables} laborables</span>
                          ) : null}
                        </TableCell>
                        {v ? <TableCell className="text-right tabular-nums">{horasLegibles(calculado(s.lunes))}</TableCell> : null}
                        <TableCell>
                          {editar ? (
                            <>
                              <label className="sr-only" htmlFor={`obj-${c.codigo}-${s.lunes}`}>
                                Horas de {c.codigo} la semana del {fechaDiaMes(s.lunes)}
                              </label>
                              <Input
                                id={`obj-${c.codigo}-${s.lunes}`}
                                name={`s_${s.lunes}`}
                                inputMode="decimal"
                                className="w-24 text-right tabular-nums"
                                defaultValue={valorInput(suyos.get(s.lunes))}
                                placeholder="calculado"
                              />
                            </>
                          ) : suyos.has(s.lunes) ? (
                            <span className="tabular-nums">{horasLegibles(suyos.get(s.lunes))}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {v ? (
                          <TableCell className="text-right tabular-nums">{horasLegibles(horas.get(c.codigo)?.porSemana[s.lunes] ?? 0)}</TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell className="font-medium">Mes</TableCell>
                      {v ? <TableCell className="text-right font-medium tabular-nums">{horasLegibles(totalCalculado)}</TableCell> : null}
                      <TableCell />
                      {v ? (
                        <TableCell className="text-right font-medium tabular-nums">{horasLegibles(horas.get(c.codigo)?.total ?? 0)}</TableCell>
                      ) : null}
                    </TableRow>
                  </TableBody>
                </Table>
                {editar ? (
                  <div className="flex items-center gap-3">
                    <Button type="submit" size="sm">
                      Guardar objetivos de {c.codigo}
                    </Button>
                    <span className="text-xs text-muted-foreground">Vacío = el calculado. Se aplica al regenerar.</span>
                  </div>
                ) : null}
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
