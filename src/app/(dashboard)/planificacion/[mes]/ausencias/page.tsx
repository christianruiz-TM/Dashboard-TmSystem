import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { CabeceraMes } from "@/components/planificacion/cabecera-mes";
import { Campo, Casilla, Muestra } from "@/components/planificacion/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEditarPlan, requireRol, ROLES_PLAN_LECTURA } from "@/lib/auth/rbac";
import { fechaCorta } from "@/lib/fechas";
import { horaLarga } from "@/lib/planificacion/motor";
import { nombreMes } from "@/lib/planificacion/tablero";
import { datosAusenciasMes } from "@/lib/planificacion/vistas";
import { borrarAusenciaAccion, guardarAusenciaAccion } from "../acciones";

export const metadata: Metadata = { title: "Ausencias" };
export const dynamic = "force-dynamic";

export default async function PaginaAusencias({
  params,
  searchParams,
}: {
  params: Promise<{ mes: string }>;
  searchParams: Promise<{ msg?: string; detalle?: string }>;
}) {
  // Lectura: supervisión, operaciones y dirección. Dar de alta y de baja,
  // solo supervisión (y la acción lo vuelve a comprobar).
  const usuario = await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const { msg, detalle } = await searchParams;
  const editar = puedeEditarPlan(usuario.rol);
  const d = datosAusenciasMes(mes);
  const tipos = new Map(d.tipos.map((t) => [t.codigo, t]));
  const quien = (numero: string, nombre: string | null) => `${numero}${nombre ? ` ${nombre}` : ""}`;

  return (
    <div className="space-y-6">
      <CabeceraMes
        mes={mes}
        nombreMes={nombreMes(mes)}
        ayuda="ausencias"
        seccion="/ausencias"
        titulo="Ausencias"
        descripcion="Vacaciones, permisos y libranzas: son hechos, no van por versiones. Cuentan al momento en el tablero (capacidad, barras, saldo y validaciones) sin regenerar."
      />
      <AvisoMsg msg={msg} detalle={detalle} />

      {editar ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nueva ausencia</CardTitle>
            <CardDescription>
              Por días (de un día a otro, ambos incluidos) y, si no es la jornada entera, de qué hora a qué hora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={guardarAusenciaAccion} className="grid gap-4">
              <input type="hidden" name="mes" value={mes} />
              <div className="grid gap-3 md:grid-cols-[2fr_1.5fr_1fr_1fr]">
                <Campo etiqueta="Agente" htmlFor="aus-agente">
                  <SelectNativo id="aus-agente" name="agenteNumero" required defaultValue="">
                    <option value="" disabled>
                      Elige agente…
                    </option>
                    {d.agentes.map((a) => (
                      <option key={a.numero} value={a.numero}>
                        {quien(a.numero, a.nombre)}
                        {a.enPlantilla ? "" : " (fuera de plantilla)"}
                      </option>
                    ))}
                  </SelectNativo>
                </Campo>
                <Campo etiqueta="Tipo" htmlFor="aus-tipo">
                  <SelectNativo id="aus-tipo" name="tipoCodigo" required>
                    {d.tipos
                      .filter((t) => t.activo)
                      .map((t) => (
                        <option key={t.codigo} value={t.codigo}>
                          {t.codigo} · {t.nombre}
                        </option>
                      ))}
                  </SelectNativo>
                </Campo>
                <Campo etiqueta="Desde" htmlFor="aus-desde">
                  <Input id="aus-desde" name="desde" type="date" required defaultValue={d.primerDia} />
                </Campo>
                <Campo etiqueta="Hasta" htmlFor="aus-hasta">
                  <Input id="aus-hasta" name="hasta" type="date" required defaultValue={d.primerDia} />
                </Campo>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Horario</legend>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="radio" name="jornada" value="completa" defaultChecked className="size-4 accent-foreground" /> Jornada
                  completa
                </label>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="jornada" value="horas" className="size-4 accent-foreground" /> Solo unas horas:
                  </label>
                  <label className="sr-only" htmlFor="aus-inicio">
                    Hora de inicio
                  </label>
                  <Input id="aus-inicio" name="inicio" type="time" step={300} className="w-32" defaultValue="09:00" />
                  <span>a</span>
                  <label className="sr-only" htmlFor="aus-fin">
                    Hora de fin
                  </label>
                  <Input id="aus-fin" name="fin" type="time" step={300} className="w-32" defaultValue="11:00" />
                </div>
              </fieldset>
              <Campo etiqueta="Notas (opcional)" htmlFor="aus-notas">
                <Input id="aus-notas" name="notas" maxLength={300} placeholder="p. ej. médico, asuntos propios…" />
              </Campo>
              <Casilla
                etiqueta="Quitar del borrador los bloques que la pisen (dejan el hueco libre)"
                name="quitar"
                defaultChecked
              />
              <p className="-mt-2 text-xs text-muted-foreground">
                Solo en los borradores de los meses que toca; la versión publicada no se cambia (la ausencia sale como incidencia
                dura hasta que se haga un borrador nuevo).
              </p>
              <div>
                <Button type="submit">Dar de alta</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ausencias del mes ({d.ausencias.length})</CardTitle>
          <CardDescription>
            Las que tocan algún día entre el {fechaCorta(d.primerDia)} y el {fechaCorta(d.ultimoDia)}.
            {editar ? " Al borrar una, sus horas no vuelven solas al borrador: añádelas en el tablero o regenera respetando tus cambios." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {d.ausencias.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay ausencias este mes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Días</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Notas</TableHead>
                  <TableHead>Alta</TableHead>
                  {editar ? <TableHead className="text-right">Acciones</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.ausencias.map((a) => {
                  const t = tipos.get(a.tipoCodigo);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{quien(a.agenteNumero, a.nombre)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <Muestra color={t?.color ?? "#BFBFBF"} /> {a.tipoCodigo}
                          <span className="text-muted-foreground">{t?.nombre}</span>
                          {t?.computaComoTrabajada ? <Badge variant="outline">cuenta como trabajada</Badge> : null}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {a.desde === a.hasta ? fechaCorta(a.desde) : `${fechaCorta(a.desde)} – ${fechaCorta(a.hasta)}`}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {a.inicioMin == null ? "jornada completa" : `${horaLarga(a.inicioMin)}–${horaLarga(a.finMin ?? 1440)}`}
                      </TableCell>
                      <TableCell className="max-w-56 truncate" title={a.notas ?? undefined}>
                        {a.notas ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.creadoPor ?? "—"}
                        <br />
                        {a.creadoAtTexto}
                      </TableCell>
                      {editar ? (
                        <TableCell className="text-right">
                          <form action={borrarAusenciaAccion}>
                            <input type="hidden" name="mes" value={mes} />
                            <input type="hidden" name="id" value={a.id} />
                            <Button type="submit" variant="destructive" size="xs">
                              Borrar
                            </Button>
                          </form>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
