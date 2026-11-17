import Link from "next/link";
import { X } from "lucide-react";
import { Tiempo } from "@/components/kpi/tiempo";
import { Campo } from "@/components/planificacion/campos";
import { BarraDia, EjeHoras, escalaDe } from "@/components/rrhh/barra-dia";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { planTiposAusencia, RrhhNotaRow } from "@/lib/db/schema";
import { hora, type TramoDia } from "@/lib/rrhh/dia";
import { textoHorario } from "@/lib/rrhh/horario";
import { NOMBRE_CATEGORIA } from "@/lib/rrhh/motivos";
import { NOMBRE_FUENTE, type FilaDia } from "@/lib/rrhh/servidor";
import { detalleTramo, tipoTramo } from "@/lib/rrhh/textos";
import { cn } from "@/lib/utils";
import { borrarAusenciaAccion, borrarNotaAccion, guardarAusenciaAccion, guardarNotaAccion } from "./acciones";

// ============================================================
// Detalle de una persona en un día (panel de RRHH, ?persona=nnnn): todo lo
// que pasó por orden de hora, los totales por motivo, las ausencias
// apuntadas y las notas de RRHH. Cada vez que se abre queda en audit_log.
// ============================================================

const CLASE_SELECT =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Muestra de color del tramo, para la tabla (el color nunca va solo: al lado va su nombre). */
function Muestra({ t }: { t: TramoDia }) {
  const clase =
    t.tipo === "conectada"
      ? "rrhh-con h-1.5"
      : t.tipo === "arranque"
        ? "rrhh-arr h-3"
        : t.tipo === "pausa"
          ? cn(t.categoria === "ausencia" ? "rrhh-aus" : "rrhh-tra", "h-3")
          : t.tipo === "sin_conectar"
            ? "rrhh-sin h-3"
            : "rrhh-apu h-3";
  return <span aria-hidden className={cn("inline-block w-3 shrink-0 rounded-[3px]", clase)} />;
}

function Cifra({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="text-sm font-semibold tabular-nums">{children}</div>
    </div>
  );
}

export function DetallePersona({
  fila,
  fecha,
  ahoraMin,
  notas,
  tipos,
  puedeEditar,
  grupo,
}: {
  fila: FilaDia;
  fecha: string;
  ahoraMin: number | null;
  notas: RrhhNotaRow[];
  tipos: (typeof planTiposAusencia.$inferSelect)[];
  puedeEditar: boolean;
  /** Filtro de grupo de la página, para volver con él al cerrar. */
  grupo?: string;
}) {
  const { persona, dia } = fila;
  const escala = escalaDe([{ horario: fila.horario, tramos: dia.tramos }]);
  const cerrar = `/rrhh?fecha=${fecha}${grupo ? `&grupo=${grupo}` : ""}`;
  const horarioTexto = fila.horario.length ? fila.horario.map((t) => `${hora(t.inicioMin)}-${hora(t.finMin)}`).join(", ") : "Sin horario este día";
  const apuntadas = fila.ausencias;

  return (
    <Card id="detalle" className="rrhh-raiz scroll-mt-24 border-foreground/20">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-lg">
            {persona.codigo}
            {persona.nombre ? ` · ${persona.nombre}` : ""}
          </CardTitle>
          <CardDescription>
            {horarioTexto} ({NOMBRE_FUENTE[fila.fuente].toLowerCase()})
            {fila.fuente !== "planificacion" && persona.horarioConfirmado == null && Object.keys(persona.horarioAprendido).length > 0
              ? ` · aprendido: ${textoHorario(persona.horarioAprendido)}`
              : ""}
            {persona.usuarios.length > 1 ? ` · usuarios ${persona.usuarios.join(", ")}` : ""}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" render={<Link href={cerrar} scroll={false} />}>
          <X className="size-4" aria-hidden />
          Cerrar
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
          <Cifra titulo="Entrada">{dia.entradaMin == null ? "—" : hora(dia.entradaMin)}</Cifra>
          <Cifra titulo="Salida">{dia.conectadaAhora ? "Conectada" : dia.salidaMin == null ? "—" : hora(dia.salidaMin)}</Cifra>
          <Cifra titulo="Llegó tarde">
            <Tiempo horas={dia.tardeMin / 60} />
          </Cifra>
          <Cifra titulo="Sin conectar en su horario">
            <Tiempo horas={dia.sinConectarMin / 60} />
          </Cifra>
          <Cifra titulo="Pausas (ausencia)">
            <Tiempo horas={dia.pausasAusenciaMin / 60} />
          </Cifra>
          <Cifra titulo="Pausas (trabajo sin cola)">
            <Tiempo horas={dia.pausasTrabajoMin / 60} />
          </Cifra>
          <Cifra titulo="Hasta ponerse disponible">
            <Tiempo horas={dia.arranqueMin / 60} />
          </Cifra>
          <Cifra titulo="Conectada">
            <Tiempo horas={dia.conectadaMin / 60} />
          </Cifra>
        </div>

        <div className="space-y-1">
          <EjeHoras escala={escala} />
          <BarraDia tramos={dia.tramos} horario={fila.horario} escala={escala} ahoraMin={ahoraMin} etiqueta={persona.codigo} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[3fr_2fr]">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Lo que pasó, por orden de hora</h3>
            {dia.tramos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada que contar este día.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hora</TableHead>
                    <TableHead>Qué</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead className="text-right">Duración</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dia.tramos.map((t) => (
                    <TableRow key={`${t.tipo}${t.inicioMin}`} className={t.tipo === "conectada" ? "text-muted-foreground" : undefined}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {hora(t.inicioMin)}–{hora(t.finMin)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <Muestra t={t} />
                          {tipoTramo(t)}
                        </span>
                      </TableCell>
                      <TableCell>{detalleTramo(t)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        <Tiempo horas={(t.finMin - t.inicioMin) / 60} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {fila.sesiones.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                Conexiones (Altitude):{" "}
                {fila.sesiones.map((s) => `${s.usrName} ${hora(s.inicioMin)}–${hora(s.finMin)}`).join(" · ")}
              </p>
            ) : null}
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Pausas por motivo</h3>
              {dia.porMotivo.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin pausas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Cuenta como</TableHead>
                      <TableHead className="text-right">Veces</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dia.porMotivo.map((m) => (
                      <TableRow key={m.motivo}>
                        <TableCell>{m.motivo}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {m.categoria === "arranque" ? "No es ausencia" : NOMBRE_CATEGORIA[m.categoria]}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{m.veces}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Tiempo horas={m.minutos / 60} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Ausencias apuntadas</h3>
              {apuntadas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguna este día.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {apuntadas.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                      <span>
                        <span className="font-medium">{a.tipoNombre}</span>{" "}
                        <span className="text-muted-foreground">
                          {a.inicioMin == null ? "jornada completa" : `${hora(a.inicioMin)}–${hora(a.finMin ?? 1440)}`}
                          {a.notas ? ` · ${a.notas}` : ""}
                          {a.computaComoTrabajada ? " · cuenta como trabajada" : ""}
                        </span>
                      </span>
                      {puedeEditar ? (
                        <form action={borrarAusenciaAccion}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="volver" value={fecha} />
                          <Button type="submit" variant="ghost" size="xs" title="Borrar (también de Planificación)">
                            Borrar
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {puedeEditar ? (
                <details className="rounded-lg border px-3 py-2">
                  <summary className="cursor-pointer text-sm font-medium">Apuntar una ausencia</summary>
                  <form action={guardarAusenciaAccion} className="mt-3 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="persona" value={persona.numero} />
                    <input type="hidden" name="volver" value={fecha} />
                    <Campo etiqueta="Tipo" htmlFor="aus-tipo" className="sm:col-span-2">
                      <select id="aus-tipo" name="tipo" className={CLASE_SELECT} required>
                        {tipos
                          .filter((t) => t.activo)
                          .map((t) => (
                            <option key={t.codigo} value={t.codigo}>
                              {t.nombre} ({t.codigo})
                            </option>
                          ))}
                      </select>
                    </Campo>
                    <Campo etiqueta="Desde" htmlFor="aus-desde">
                      <Input id="aus-desde" name="desde" type="date" defaultValue={fecha} required />
                    </Campo>
                    <Campo etiqueta="Hasta" htmlFor="aus-hasta">
                      <Input id="aus-hasta" name="hasta" type="date" defaultValue={fecha} required />
                    </Campo>
                    <fieldset className="space-y-1.5 sm:col-span-2">
                      <legend className="text-sm font-medium">¿Cuánto?</legend>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <input type="radio" name="jornada" value="completa" defaultChecked className="accent-foreground" />
                          Jornada completa
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input type="radio" name="jornada" value="horas" className="accent-foreground" />
                          Unas horas: de
                        </label>
                        <Input name="inicio" type="time" className="h-8 w-28" aria-label="Desde la hora" />
                        <span>a</span>
                        <Input name="fin" type="time" className="h-8 w-28" aria-label="Hasta la hora" />
                      </div>
                    </fieldset>
                    <Campo etiqueta="Notas (opcional)" htmlFor="aus-notas" className="sm:col-span-2">
                      <Input id="aus-notas" name="notas" maxLength={300} placeholder="p. ej. justificante entregado" />
                    </Campo>
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Se apunta en la misma lista que Planificación: supervisión la verá en su tablero.
                    </p>
                    <div className="sm:col-span-2">
                      <Button type="submit">Apuntar</Button>
                    </div>
                  </form>
                </details>
              ) : null}
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Notas de RRHH</h3>
              {notas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin notas este día.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {notas.map((n) => (
                    <li key={n.id} className="flex items-start justify-between gap-2 rounded-lg border px-3 py-2">
                      <span>
                        {n.inicioMin != null ? <span className="font-medium tabular-nums">{hora(n.inicioMin)} · </span> : null}
                        {n.texto}
                        <span className="block text-xs text-muted-foreground">{n.creadoPor}</span>
                      </span>
                      {puedeEditar ? (
                        <form action={borrarNotaAccion}>
                          <input type="hidden" name="id" value={n.id} />
                          <input type="hidden" name="fecha" value={fecha} />
                          <Button type="submit" variant="ghost" size="xs">
                            Borrar
                          </Button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {puedeEditar ? (
                <form action={guardarNotaAccion} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="persona" value={persona.numero} />
                  <input type="hidden" name="fecha" value={fecha} />
                  <Campo etiqueta="Hora (opcional)" htmlFor="nota-hora">
                    <Input id="nota-hora" name="hora" type="time" className="h-8 w-28" />
                  </Campo>
                  <Campo etiqueta="Nota" htmlFor="nota-texto" className="min-w-56 flex-1">
                    <Input id="nota-texto" name="texto" maxLength={500} required placeholder="p. ej. médico, justificante entregado" />
                  </Campo>
                  <Button type="submit">Guardar nota</Button>
                </form>
              ) : null}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
