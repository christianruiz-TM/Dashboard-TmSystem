import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
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
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string }>;
}) {
  // Lectura: supervisión, operaciones y dirección. Dar de alta, cambiar y
  // borrar, solo supervisión (y la acción lo vuelve a comprobar).
  const usuario = await requireRol(...ROLES_PLAN_LECTURA);
  const { mes } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) notFound();
  const sp = await searchParams;
  const { msg, detalle } = sp;
  const editar = puedeEditarPlan(usuario.rol);
  const d = datosAusenciasMes(mes);
  const tipos = new Map(d.tipos.map((t) => [t.codigo, t]));
  const quien = (numero: string, nombre: string | null) => `${numero}${nombre ? ` ${nombre}` : ""}`;
  // ?editar=<id>: el formulario de arriba sale relleno con esa ausencia
  const enEdicion = editar && sp.editar ? (d.ausencias.find((a) => String(a.id) === sp.editar) ?? null) : null;
  const porHoras = enEdicion?.inicioMin != null;
  // En el desplegable tiene que estar la persona y el tipo de la que se cambia
  // (aunque ya no sea de plantilla o el tipo esté desactivado)
  const agentesFormulario =
    enEdicion && !d.agentes.some((a) => a.numero === enEdicion.agenteNumero)
      ? [...d.agentes, { numero: enEdicion.agenteNumero, nombre: enEdicion.nombre, enPlantilla: false }]
      : d.agentes;
  const tiposFormulario = d.tipos.filter((t) => t.activo || t.codigo === enEdicion?.tipoCodigo);

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
        <Card id="formulario-ausencia" className={enEdicion ? "scroll-mt-4 ring-2 ring-primary" : "scroll-mt-4"}>
          <CardHeader>
            <CardTitle className="text-base">
              {enEdicion ? `Cambiar la ausencia de ${quien(enEdicion.agenteNumero, enEdicion.nombre)}` : "Nueva ausencia"}
            </CardTitle>
            <CardDescription>
              {enEdicion
                ? "Cambia lo que haga falta y pulsa «Guardar cambios». No hace falta borrarla y volver a apuntarla."
                : "Por días (de un día a otro, ambos incluidos) y, si no es la jornada entera, de qué hora a qué hora."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* key: al pasar de una ausencia a otra (o a «nueva») los campos se vuelven a rellenar */}
            <form key={enEdicion?.id ?? "nueva"} action={guardarAusenciaAccion} className="grid gap-4">
              <input type="hidden" name="mes" value={mes} />
              {enEdicion ? <input type="hidden" name="id" value={enEdicion.id} /> : null}
              <div className="grid gap-3 md:grid-cols-[2fr_1.5fr_1fr_1fr]">
                <Campo etiqueta="Agente" htmlFor="aus-agente">
                  <SelectNativo id="aus-agente" name="agenteNumero" required defaultValue={enEdicion?.agenteNumero ?? ""}>
                    <option value="" disabled>
                      Elige agente…
                    </option>
                    {agentesFormulario.map((a) => (
                      <option key={a.numero} value={a.numero}>
                        {quien(a.numero, a.nombre)}
                        {a.enPlantilla ? "" : " (fuera de plantilla)"}
                      </option>
                    ))}
                  </SelectNativo>
                </Campo>
                <Campo etiqueta="Tipo" htmlFor="aus-tipo">
                  <SelectNativo id="aus-tipo" name="tipoCodigo" required defaultValue={enEdicion?.tipoCodigo}>
                    {tiposFormulario.map((t) => (
                      <option key={t.codigo} value={t.codigo}>
                        {t.codigo} · {t.nombre}
                        {t.activo ? "" : " (desactivado)"}
                      </option>
                    ))}
                  </SelectNativo>
                </Campo>
                <Campo etiqueta="Desde" htmlFor="aus-desde">
                  <Input id="aus-desde" name="desde" type="date" required defaultValue={enEdicion?.desde ?? d.primerDia} />
                </Campo>
                <Campo etiqueta="Hasta" htmlFor="aus-hasta">
                  <Input id="aus-hasta" name="hasta" type="date" required defaultValue={enEdicion?.hasta ?? d.primerDia} />
                </Campo>
              </div>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">Horario</legend>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="jornada"
                    value="completa"
                    defaultChecked={!porHoras}
                    className="size-4 accent-foreground"
                  />{" "}
                  Jornada completa
                </label>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="jornada" value="horas" defaultChecked={porHoras} className="size-4 accent-foreground" />{" "}
                    Solo unas horas:
                  </label>
                  <label className="sr-only" htmlFor="aus-inicio">
                    Hora de inicio
                  </label>
                  <Input
                    id="aus-inicio"
                    name="inicio"
                    type="time"
                    step={300}
                    className="w-32"
                    defaultValue={porHoras ? horaLarga(enEdicion!.inicioMin!) : "09:00"}
                  />
                  <span>a</span>
                  <label className="sr-only" htmlFor="aus-fin">
                    Hora de fin
                  </label>
                  <Input
                    id="aus-fin"
                    name="fin"
                    type="time"
                    step={300}
                    className="w-32"
                    defaultValue={porHoras ? horaLarga(enEdicion!.finMin ?? 1440) : "11:00"}
                  />
                </div>
              </fieldset>
              <Campo etiqueta="Notas (opcional)" htmlFor="aus-notas">
                <Input
                  id="aus-notas"
                  name="notas"
                  maxLength={300}
                  placeholder="p. ej. médico, asuntos propios…"
                  defaultValue={enEdicion?.notas ?? ""}
                />
              </Campo>
              <Casilla
                etiqueta="Quitar del borrador los bloques que la pisen (dejan el hueco libre)"
                name="quitar"
                defaultChecked
              />
              <p className="-mt-2 text-xs text-muted-foreground">
                Solo en los borradores de los meses que toca; la versión publicada no se cambia (la ausencia sale como incidencia
                dura hasta que se haga un borrador nuevo).
                {enEdicion
                  ? " Si la acortas, las horas que dejan de ser ausencia no vuelven solas al borrador: añádelas en el tablero."
                  : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit">{enEdicion ? "Guardar cambios" : "Dar de alta"}</Button>
                {enEdicion ? (
                  <Button variant="outline" render={<Link href={`/planificacion/${mes}/ausencias`} />}>
                    Cancelar
                  </Button>
                ) : null}
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
                    <TableRow key={a.id} className={enEdicion?.id === a.id ? "bg-primary/10" : undefined}>
                      <TableCell className="font-medium">{quien(a.agenteNumero, a.nombre)}</TableCell>
                      {/* Parte línea: con «Editar» y «Borrar» la tabla no cabía y los botones quedaban fuera */}
                      <TableCell className="whitespace-normal">
                        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
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
                      <TableCell className="max-w-40 truncate" title={a.notas ?? undefined}>
                        {a.notas ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {a.creadoPor ?? "—"}
                        <br />
                        {a.creadoAtTexto}
                      </TableCell>
                      {editar ? (
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Button
                              variant="outline"
                              size="xs"
                              render={<Link href={`/planificacion/${mes}/ausencias?editar=${a.id}#formulario-ausencia`} />}
                            >
                              <Pencil /> Editar
                            </Button>
                            <form action={borrarAusenciaAccion}>
                              <input type="hidden" name="mes" value={mes} />
                              <input type="hidden" name="id" value={a.id} />
                              <Button type="submit" variant="destructive" size="xs">
                                Borrar
                              </Button>
                            </form>
                          </div>
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
