import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Fragment } from "react";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { Campo } from "@/components/planificacion/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEditarRrhh, requireRol, ROLES_RRHH_LECTURA } from "@/lib/auth/rbac";
import { horasLegibles } from "@/lib/fechas";
import { motivosNoDisponible } from "@/lib/rdb/queries/rrhh";
import { hora } from "@/lib/rrhh/dia";
import { DIAS_SEMANA, horasSemana, NOMBRE_DIA, textoHorario } from "@/lib/rrhh/horario";
import { categoriaMotivo, categoriaPorDefecto, CATEGORIAS_MOTIVO, etiquetaMotivo, NOMBRE_CATEGORIA } from "@/lib/rrhh/motivos";
import * as repo from "@/lib/rrhh/repositorio";
import { personasRrhh, type PersonaRrhh } from "@/lib/rrhh/servidor";
import { cn } from "@/lib/utils";
import {
  guardarMotivosAccion,
  guardarPersonaAccion,
  guardarTipoAusenciaAccion,
  volverAprendidoAccion,
} from "../acciones";

// ============================================================
// Configuración del panel de RRHH (16/11/2026, docs/plan-rrhh.md):
// - Personas: contrato, horario (aprendido hasta que RRHH lo confirma o lo
//   cambia; el de la plantilla sale de Planificación) y quién queda fuera.
// - Motivos de pausa: ausencia, trabajo sin cola o no se enseña.
// - Tipos de ausencia: los de Planificación, con el check de «cuenta como
//   trabajada» (cambia también el saldo de Planificación).
// Dirección lo ve sin poder cambiarlo.
// ============================================================

export const metadata: Metadata = { title: "RRHH · Configuración" };
export const dynamic = "force-dynamic";

const CLASE_SELECT =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";
const hhmm = (m: number | undefined) => (m == null ? "" : hora(m));

function TextoHorario({ p }: { p: PersonaRrhh }) {
  if (p.enPlanificacion) return <span className="text-muted-foreground">De Planificación (cada día, el de su plan)</span>;
  const h = p.horarioConfirmado ?? p.horarioAprendido;
  const texto = textoHorario(h);
  return (
    <>
      {texto ? (
        texto.split(" · ").map((g) => (
          <span key={g} className="block whitespace-nowrap tabular-nums">
            {g}
          </span>
        ))
      ) : (
        <span className="text-muted-foreground">Sin horario</span>
      )}
      <span className={cn("block text-xs", p.horarioConfirmado ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>
        {p.horarioConfirmado ? "Confirmado por RRHH" : "Aprendido (sin confirmar)"}
      </span>
    </>
  );
}

function FormularioPersona({ p }: { p: PersonaRrhh }) {
  const h = p.horarioConfirmado ?? p.horarioAprendido;
  return (
    <form action={guardarPersonaAccion} className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <input type="hidden" name="persona" value={p.numero} />
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Campo
          etiqueta="Contrato (h/semana)"
          htmlFor={`contrato-${p.numero}`}
          ayuda={p.contratoPlan != null ? `En Planificación: ${p.contratoPlan.toLocaleString("es-ES")} h` : undefined}
        >
          <Input
            id={`contrato-${p.numero}`}
            name="contrato"
            inputMode="decimal"
            defaultValue={p.contratoRrhh != null ? p.contratoRrhh.toLocaleString("es-ES") : ""}
            placeholder={p.contratoPlan != null ? p.contratoPlan.toLocaleString("es-ES") : "p. ej. 38"}
          />
        </Campo>
        <Campo etiqueta="Notas (opcional)" htmlFor={`notas-${p.numero}`}>
          <Input id={`notas-${p.numero}`} name="notas" maxLength={300} defaultValue={p.notas ?? ""} />
        </Campo>
      </div>
      {p.enPlanificacion ? (
        <p className="text-sm text-muted-foreground">
          Su horario sale cada día del plan de Planificación: se cambia allí (supervisión).
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Horario {p.horarioConfirmado ? "" : "(el aprendido: revísalo y guarda para confirmarlo)"}
          </legend>
          <input type="hidden" name="conHorario" value="1" />
          <div className="grid gap-x-8 gap-y-2 lg:grid-cols-2">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-20">{NOMBRE_DIA[d]}</span>
                {[0, 1].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1">
                    {t === 1 ? <span className="px-1 text-muted-foreground">y</span> : null}
                    <Input
                      name={`ini${d}_${t + 1}`}
                      type="time"
                      className="h-8 w-24"
                      defaultValue={hhmm(h[d]?.[t]?.inicioMin)}
                      aria-label={`${NOMBRE_DIA[d]}: entrada ${t === 0 ? "" : "de la tarde"}`}
                    />
                    <span aria-hidden>–</span>
                    <Input
                      name={`fin${d}_${t + 1}`}
                      type="time"
                      className="h-8 w-24"
                      defaultValue={hhmm(h[d]?.[t]?.finMin)}
                      aria-label={`${NOMBRE_DIA[d]}: salida ${t === 0 ? "" : "de la tarde"}`}
                    />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Deja un día vacío si libra. El segundo tramo es para el turno partido (por ejemplo, 08:00-15:00 y 17:00-20:00).
          </p>
        </fieldset>
      )}
      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" name="excluida" defaultChecked={p.excluida} className="size-4 accent-foreground" />
        Fuera del panel (por ejemplo, supervisoras)
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit">{p.enPlanificacion || p.horarioConfirmado ? "Guardar" : "Guardar y confirmar horario"}</Button>
        <Button variant="outline" render={<Link href={`/rrhh/configuracion#p-${p.numero}`} />}>
          Cancelar
        </Button>
        {p.horarioConfirmado ? (
          <Button type="submit" variant="ghost" formAction={volverAprendidoAccion}>
            Volver al horario aprendido
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export default async function ConfiguracionRrhh({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string }>;
}) {
  const usuario = await requireRol(...ROLES_RRHH_LECTURA);
  const puedeEditar = puedeEditarRrhh(usuario.rol);
  const sp = await searchParams;
  const [personas, motivos] = await Promise.all([personasRrhh(), motivosNoDisponible().catch(() => [])]);
  const config = repo.leerConfigMotivosRrhh();
  const tipos = repo.leerTiposAusencia();
  const dentro = personas.filter((p) => !p.excluida);
  const fuera = personas.filter((p) => p.excluida);
  const sinConfirmar = dentro.filter((p) => !p.enPlanificacion && !p.horarioConfirmado).length;
  const conAviso = dentro.filter((p) => p.avisoContrato).length;
  const motivosVisibles = motivos.filter((m) => !/^undefined Not Ready Reason/i.test(m.nombre));

  const filaPersona = (p: PersonaRrhh) => {
    const editando = puedeEditar && sp.editar === p.numero;
    return (
      <Fragment key={p.numero}>
        <TableRow id={`p-${p.numero}`} className={cn("scroll-mt-24", editando && "bg-muted/60")}>
          <TableCell className="max-w-72 whitespace-normal">
            <span className="font-medium">{p.codigo}</span>
            {p.nombre ? <span className="block text-xs text-muted-foreground">{p.nombre}</span> : null}
            {p.usuarios.length > 1 ? (
              <span className="block text-xs break-words text-muted-foreground" title="Sus usuarios de Altitude">
                {p.usuarios.join(", ")}
              </span>
            ) : null}
          </TableCell>
          <TableCell>{p.enPlanificacion ? "Sí" : "No"}</TableCell>
          <TableCell className="text-sm">
            <TextoHorario p={p} />
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {p.enPlanificacion ? "—" : horasLegibles(horasSemana(p.horarioConfirmado ?? p.horarioAprendido))}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {p.contratoRrhh != null ? horasLegibles(p.contratoRrhh) : <span className="text-muted-foreground">—</span>}
            {p.avisoContrato ? (
              <span className="mt-0.5 flex items-center justify-end gap-1 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="size-3.5" aria-hidden />
                Planificación: {horasLegibles(p.contratoPlan)}
              </span>
            ) : p.contratoPlan != null && p.enPlanificacion && p.contratoRrhh == null ? (
              <span className="block text-xs text-muted-foreground">Planificación: {horasLegibles(p.contratoPlan)}</span>
            ) : null}
          </TableCell>
          <TableCell className="text-right">
            {puedeEditar && !editando ? (
              <Button variant="outline" size="xs" render={<Link href={`/rrhh/configuracion?editar=${p.numero}#p-${p.numero}`} />}>
                Editar
              </Button>
            ) : null}
          </TableCell>
        </TableRow>
        {editando ? (
          <TableRow>
            <TableCell colSpan={6}>
              <FormularioPersona p={p} />
            </TableCell>
          </TableRow>
        ) : null}
      </Fragment>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Configuración de RRHH</h1>
          <p className="text-sm text-muted-foreground">Horarios y contratos, qué es cada pausa y los tipos de ausencia.</p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/rrhh" />}>
          <ArrowLeft className="size-4" aria-hidden />
          Volver a Ausencias
        </Button>
      </div>
      <AvisoMsg msg={sp.msg} detalle={sp.detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personas</CardTitle>
          <CardDescription>
            Las de la plantilla de Planificación llevan el horario de su plan. Las demás, el que se aprende de sus conexiones de las
            últimas 6 semanas hasta que lo confirmes o lo cambies.
            {sinConfirmar > 0 ? ` ${sinConfirmar} con el horario sin confirmar.` : ""}
            {conAviso > 0 ? ` ${conAviso} con un contrato distinto del de Planificación.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>En Planificación</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead className="text-right">Horas del horario</TableHead>
                <TableHead className="text-right">Contrato</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {dentro.map(filaPersona)}
              {fuera.length > 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="pt-5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Fuera del panel
                  </TableCell>
                </TableRow>
              ) : null}
              {fuera.map(filaPersona)}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card id="motivos" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Motivos de pausa</CardTitle>
          <CardDescription>
            Qué cuenta como ausencia. «Hasta ponerse disponible» (la pausa que pone Altitude al conectarse, hasta pulsar Disponible)
            va siempre aparte y no cuenta como ausencia. Las pausas de menos de 1 minuto no cuentan nunca.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {motivosVisibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se ha podido leer la lista de motivos de Altitude. Prueba más tarde.</p>
          ) : (
            <form action={guardarMotivosAccion} className="space-y-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Motivo en el panel</TableHead>
                    <TableHead>Nombre en Altitude</TableHead>
                    <TableHead>Cuenta como</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {motivosVisibles.map((m) => {
                    const defecto = categoriaPorDefecto(m.nombre);
                    const actual = categoriaMotivo(m.codigo, m.nombre, config);
                    return (
                      <TableRow key={m.codigo}>
                        <TableCell className="font-medium">{etiquetaMotivo(m.nombre)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.nombre} (código {m.codigo})
                        </TableCell>
                        <TableCell>
                          <input type="hidden" name={`defecto-${m.codigo}`} value={defecto} />
                          <select
                            name={`motivo-${m.codigo}`}
                            defaultValue={actual}
                            className={CLASE_SELECT}
                            disabled={!puedeEditar}
                            aria-label={`Cuenta como (${etiquetaMotivo(m.nombre)})`}
                          >
                            {CATEGORIAS_MOTIVO.map((c) => (
                              <option key={c} value={c}>
                                {NOMBRE_CATEGORIA[c]}
                                {c === defecto ? " (por defecto)" : ""}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {puedeEditar ? <Button type="submit">Guardar motivos</Button> : null}
            </form>
          )}
        </CardContent>
      </Card>

      <Card id="tipos" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Tipos de ausencia</CardTitle>
          <CardDescription>
            Es la misma lista que usa Planificación. «Cuenta como trabajada» cambia también el saldo de horas de Planificación: una
            ausencia que cuenta como trabajada no deja a la persona con horas de menos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Cuenta como trabajada</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tipos.map((t) => (
                <TableRow key={t.codigo}>
                  <TableCell className="font-medium">{t.codigo}</TableCell>
                  <TableCell colSpan={5} className="p-0">
                    <form action={guardarTipoAusenciaAccion} className="grid grid-cols-[1fr_4rem_10rem_5rem_auto] items-center gap-3 px-2 py-1.5">
                      <input type="hidden" name="codigo" value={t.codigo} />
                      <Input name="nombre" defaultValue={t.nombre} className="h-8" disabled={!puedeEditar} aria-label={`Nombre de ${t.codigo}`} />
                      <Input name="color" type="color" defaultValue={t.color} className="h-8 p-1" disabled={!puedeEditar} aria-label={`Color de ${t.codigo}`} />
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" name="trabajada" defaultChecked={t.computaComoTrabajada} disabled={!puedeEditar} className="size-4 accent-foreground" />
                        {t.computaComoTrabajada ? "Sí" : "No"}
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm">
                        <input type="checkbox" name="activo" defaultChecked={t.activo} disabled={!puedeEditar} className="size-4 accent-foreground" />
                        {t.activo ? "Sí" : "No"}
                      </label>
                      {puedeEditar ? (
                        <Button type="submit" size="xs" variant="outline">
                          Guardar
                        </Button>
                      ) : (
                        <span />
                      )}
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {puedeEditar ? (
            <form action={guardarTipoAusenciaAccion} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[8rem_1fr_4rem_auto_auto_auto]">
              <Campo etiqueta="Código nuevo" htmlFor="tipo-codigo">
                <Input id="tipo-codigo" name="codigo" required maxLength={10} placeholder="p. ej. MAT" />
              </Campo>
              <Campo etiqueta="Nombre" htmlFor="tipo-nombre">
                <Input id="tipo-nombre" name="nombre" required maxLength={60} placeholder="p. ej. Permiso de maternidad" />
              </Campo>
              <Campo etiqueta="Color" htmlFor="tipo-color">
                <Input id="tipo-color" name="color" type="color" defaultValue="#BFBFBF" className="h-8 p-1" />
              </Campo>
              <label className="inline-flex items-center gap-2 pb-1.5 text-sm">
                <input type="checkbox" name="trabajada" className="size-4 accent-foreground" />
                Cuenta como trabajada
              </label>
              <input type="hidden" name="activo" value="on" />
              <input type="hidden" name="nuevo" value="1" />
              <Button type="submit">Añadir tipo</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
