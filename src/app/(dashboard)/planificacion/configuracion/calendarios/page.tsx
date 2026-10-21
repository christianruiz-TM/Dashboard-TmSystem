import type { Metadata } from "next";
import Link from "next/link";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { Campo } from "@/components/planificacion/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import { esquemaFechaISO, hoyISO } from "@/lib/fechas";
import {
  asegurarCalendarios,
  estadoCopia,
  leerCalendarioLaboral,
  leerExcepciones,
  leerFestivosAltitude,
  leerHorariosAltitude,
  nombresCalendarios,
} from "@/lib/planificacion/calendarios";
import {
  CALENDARIO_PLANTILLA,
  diaSemana,
  fechasDelMes,
  lunesDe,
  sumarDias,
  textoTramos,
  type HorarioLike,
  type Tramo,
} from "@/lib/planificacion/motor";
import { fechaDiaMes, nombreMes } from "@/lib/planificacion/tablero";
import { cn } from "@/lib/utils";
import { copiarCalendariosAccion, copiarFestivosLaboralAccion, guardarDiaCalendarioAccion } from "../acciones";

export const metadata: Metadata = { title: "Calendarios de planificación" };
export const dynamic = "force-dynamic";

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
const NOMBRE_DIA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

type EstadoDia =
  | "laborable"
  | "sin_horario"
  | "festivo"
  | "abre"
  | "cierra"
  | "horario"
  | "festivo_laboral"
  | "cierre_empresa"
  | "fin_semana";

const ESTILO: Record<EstadoDia, { clase: string; texto: string }> = {
  laborable: { clase: "bg-background", texto: "Se trabaja" },
  sin_horario: { clase: "bg-muted text-muted-foreground", texto: "Sin horario (no abre)" },
  fin_semana: { clase: "bg-muted text-muted-foreground", texto: "Fin de semana" },
  festivo: { clase: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100", texto: "Festivo en Altitude" },
  cierra: { clase: "bg-red-300 text-red-950 dark:bg-red-800 dark:text-red-50", texto: "Cerrado a mano" },
  abre: { clase: "bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50", texto: "Festivo que se trabaja (a mano)" },
  horario: { clase: "bg-amber-200 text-amber-950 dark:bg-amber-800 dark:text-amber-50", texto: "Horario especial (a mano)" },
  festivo_laboral: { clase: "bg-red-200 text-red-950 dark:bg-red-900 dark:text-red-50", texto: "Festivo laboral" },
  cierre_empresa: { clase: "bg-violet-200 text-violet-950 dark:bg-violet-900 dark:text-violet-50", texto: "Cierre de empresa" },
};

/** Tramos del horario semanal de un calendario ese día (sin festivos ni cambios). */
function horarioSemanal(horarios: readonly HorarioLike[], fecha: string): Tramo[] {
  const ds = diaSemana(fecha);
  const vigentes = horarios.filter((h) => h.desde <= fecha && fecha <= h.hasta);
  const ultimo = horarios.reduce((m, h) => (h.hasta > m ? h.hasta : m), "");
  const usar = vigentes.length > 0 ? vigentes : fecha > ultimo ? horarios.filter((h) => h.hasta === ultimo) : [];
  return usar.filter((h) => h.dias[ds]).map((h) => ({ inicioMin: h.entradaMin, finMin: h.salidaMin }));
}

export default async function PaginaCalendarios({
  searchParams,
}: {
  searchParams: Promise<{ cal?: string; anio?: string; dia?: string; msg?: string; detalle?: string }>;
}) {
  await requireRol(...ROLES_PLAN_EDICION);
  const sp = await searchParams;
  const hoy = hoyISO();

  let errorCopia: string | null = null;
  try {
    await asegurarCalendarios("si-falta");
  } catch (e) {
    console.error("[planificacion] calendarios:", e);
    errorCopia = "Aún no hay copia de los calendarios de Altitude y RDBv2 no responde. Prueba a recargar en un rato.";
  }
  const copia = estadoCopia();
  const clientes = nombresCalendarios();
  const calendarios = [CALENDARIO_PLANTILLA, ...clientes];
  const cal = sp.cal && calendarios.includes(sp.cal) ? sp.cal : CALENDARIO_PLANTILLA;
  const esPlantilla = cal === CALENDARIO_PLANTILLA;
  const anio = sp.anio && /^\d{4}$/.test(sp.anio) && Math.abs(Number(sp.anio) - Number(hoy.slice(0, 4))) <= 5 ? Number(sp.anio) : Number(hoy.slice(0, 4));
  const desde = `${anio}-01-01`;
  const hasta = `${anio}-12-31`;
  const diaElegido = esquemaFechaISO.safeParse(sp.dia ?? "").success && sp.dia!.startsWith(`${anio}-`) ? sp.dia! : null;

  // Datos del año del calendario elegido
  const laboral = new Map(leerCalendarioLaboral(desde, hasta).map((d) => [d.fecha, d]));
  const festivosAlt = new Set(leerFestivosAltitude(desde, hasta).filter((f) => f.servicio === cal).map((f) => f.fecha));
  const excepciones = new Map(leerExcepciones(desde, hasta).filter((e) => e.calendario === cal).map((e) => [e.fecha, e]));
  const horarios = leerHorariosAltitude().filter((h) => h.servicio === cal);

  const estadoDe = (fecha: string): EstadoDia => {
    if (esPlantilla) {
      const d = laboral.get(fecha);
      if (d) return d.tipo === "cierre" ? "cierre_empresa" : "festivo_laboral";
      return diaSemana(fecha) >= 5 ? "fin_semana" : "laborable";
    }
    const e = excepciones.get(fecha);
    if (e) return e.tipo;
    if (festivosAlt.has(fecha)) return "festivo";
    if (horarios.length > 0 && horarioSemanal(horarios, fecha).length === 0) return "sin_horario";
    return diaSemana(fecha) >= 5 && horarios.length === 0 ? "fin_semana" : "laborable";
  };
  const textoDia = (fecha: string): string => {
    const estado = estadoDe(fecha);
    const extra = esPlantilla
      ? (laboral.get(fecha)?.nombre ?? "")
      : estado === "horario"
        ? textoTramos(excepciones.get(fecha)!.tramos ?? [])
        : (excepciones.get(fecha)?.motivo ?? "");
    return `${NOMBRE_DIA[diaSemana(fecha)]} ${fechaDiaMes(fecha)}: ${ESTILO[estado].texto}${extra ? ` · ${extra}` : ""}`;
  };
  const enlace = (extra: Record<string, string>) => `?${new URLSearchParams({ cal, anio: String(anio), ...extra }).toString()}`;
  const meses = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`);
  const sinDatosAnio = esPlantilla ? laboral.size === 0 : festivosAlt.size === 0;
  const leyenda: EstadoDia[] = esPlantilla
    ? ["laborable", "festivo_laboral", "cierre_empresa", "fin_semana"]
    : ["laborable", "festivo", "cierra", "abre", "horario", "sin_horario"];

  return (
    <div className="space-y-6">
      <AvisoMsg msg={sp.msg} detalle={sp.detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendarios</CardTitle>
          <CardDescription>
            El <strong>calendario laboral de la plantilla</strong> dice qué días no trabajan los agentes, sea cual sea su
            cliente: un festivo laboral se compensa con FEST si se trabaja; un cierre de empresa justifica el turno sin FEST.
            El calendario de <strong>cada cliente</strong> dice cuándo atiende: sale de Altitude (lo mantiene supervisión y lo
            lee también el Power BI) y aquí se cambia un día sin tocar Altitude. Los cambios se ven al momento en el tablero;
            para que el plan recoloque los bloques, vuelve a generar el borrador.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className={errorCopia ? "text-amber-700" : "text-muted-foreground"}>
            {errorCopia ??
              (copia
                ? `Última copia de Altitude: ${copia.at} (${copia.festivos} festivos y ${copia.horarios} horarios). Se vuelve a copiar cada vez que se genera un borrador.`
                : "Todavía no se ha copiado nada de Altitude.")}
          </span>
          <form action={copiarCalendariosAccion}>
            <input type="hidden" name="cal" value={cal} />
            <input type="hidden" name="anio" value={anio} />
            <Button type="submit" variant="outline" size="sm">
              Copiar ahora de Altitude
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <nav className="flex flex-wrap gap-1" aria-label="Calendario">
            {calendarios.map((c) => (
              <Button key={c} variant={c === cal ? "default" : "outline"} size="sm" render={<Link href={`?${new URLSearchParams({ cal: c, anio: String(anio) })}`} />}>
                {c === CALENDARIO_PLANTILLA ? "Plantilla (laboral)" : c}
              </Button>
            ))}
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {esPlantilla ? "Calendario laboral de la plantilla" : `Calendario de ${cal}`} · {anio}
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="outline" size="xs" render={<Link href={`?${new URLSearchParams({ cal, anio: String(anio - 1) })}`} />}>
                ← {anio - 1}
              </Button>
              <Button variant="outline" size="xs" render={<Link href={`?${new URLSearchParams({ cal, anio: String(anio + 1) })}`} />}>
                {anio + 1} →
              </Button>
            </div>
          </div>
          {!esPlantilla && horarios.length > 0 ? (
            <CardDescription>
              Horario semanal en Altitude:{" "}
              {[0, 1, 2, 3, 4, 5, 6]
                .map((ds) => {
                  // La semana de hoy (o una de mediados del año que se ve)
                  const referencia = hoy.startsWith(`${anio}-`) ? hoy : `${anio}-06-15`;
                  const t = horarioSemanal(horarios, sumarDias(lunesDe(referencia), ds));
                  return t.length > 0 ? `${DIAS[ds]} ${textoTramos(t)}` : null;
                })
                .filter(Boolean)
                .join(" · ") || "ninguno"}
            </CardDescription>
          ) : null}
          {sinDatosAnio ? (
            <p className="text-sm text-amber-700">
              {esPlantilla
                ? `No hay ningún festivo de ${anio} en el calendario laboral: añádelos (o cópialos de un cliente, abajo) antes de planificar ese año.`
                : `Altitude no tiene festivos de ${cal} en ${anio}: supervisión tiene que cargarlos en sus tablas (los lee también el Power BI).`}
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 text-xs">
            {leyenda.map((e) => (
              <span key={e} className="inline-flex items-center gap-1.5">
                <span className={cn("inline-block size-3.5 rounded-[3px] border", ESTILO[e].clase)} aria-hidden />
                {ESTILO[e].texto}
              </span>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {meses.map((mes) => {
              const fechas = fechasDelMes(mes);
              const hueco = diaSemana(fechas[0]);
              return (
                <div key={mes} className="space-y-1">
                  <div className="text-sm font-medium">{nombreMes(mes).replace(` ${anio}`, "")}</div>
                  <div className="grid grid-cols-7 gap-0.5 text-center text-xs">
                    {DIAS.map((d) => (
                      <div key={d} className="text-muted-foreground">
                        {d}
                      </div>
                    ))}
                    {Array.from({ length: hueco }, (_, i) => (
                      <div key={`h${i}`} />
                    ))}
                    {fechas.map((f) => {
                      const estado = estadoDe(f);
                      return (
                        <Link
                          key={f}
                          href={enlace({ dia: f })}
                          title={textoDia(f)}
                          aria-label={textoDia(f)}
                          className={cn(
                            "rounded-[3px] border py-0.5 tabular-nums hover:ring-2 hover:ring-ring",
                            ESTILO[estado].clase,
                            f === hoy && "font-bold underline",
                            f === diaElegido && "ring-2 ring-foreground",
                          )}
                        >
                          {Number(f.slice(8, 10))}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {diaElegido ? (
        <FormularioDia
          cal={cal}
          anio={anio}
          fecha={diaElegido}
          esPlantilla={esPlantilla}
          estado={estadoDe(diaElegido)}
          titulo={textoDia(diaElegido)}
          festivoAltitude={festivosAlt.has(diaElegido)}
          semanal={horarios.length > 0 ? textoTramos(horarioSemanal(horarios, diaElegido)) : null}
          nombre={laboral.get(diaElegido)?.nombre ?? null}
          motivo={excepciones.get(diaElegido)?.motivo ?? null}
          tramos={excepciones.get(diaElegido)?.tramos ?? null}
          volverHref={enlace({})}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Pulsa un día para cambiarlo.</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {esPlantilla ? `Días sin trabajo de la plantilla en ${anio}` : `Cambios a mano de ${cal} en ${anio}`}
          </CardTitle>
          {!esPlantilla ? (
            <CardDescription>Solo cambian el plan del dashboard: Altitude y el Power BI siguen como están.</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {(esPlantilla ? laboral.size : excepciones.size) === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Día</TableHead>
                  <TableHead>Qué pasa</TableHead>
                  <TableHead>{esPlantilla ? "Nombre" : "Motivo"}</TableHead>
                  <TableHead>Quién</TableHead>
                  <TableHead className="text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {esPlantilla
                  ? [...laboral.values()].map((d) => (
                      <TableRow key={d.fecha}>
                        <TableCell className="tabular-nums">
                          {NOMBRE_DIA[diaSemana(d.fecha)]} {fechaDiaMes(d.fecha)}
                        </TableCell>
                        <TableCell>{d.tipo === "cierre" ? "Cierre de empresa" : "Festivo laboral"}</TableCell>
                        <TableCell>{d.nombre ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.autor} · {d.actualizadoAt}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="xs" render={<Link href={enlace({ dia: d.fecha })} />}>
                            Cambiar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  : [...excepciones.values()].map((e) => (
                      <TableRow key={e.fecha}>
                        <TableCell className="tabular-nums">
                          {NOMBRE_DIA[diaSemana(e.fecha)]} {fechaDiaMes(e.fecha)}
                        </TableCell>
                        <TableCell>
                          {e.tipo === "abre" ? "Se trabaja (en Altitude es festivo)" : e.tipo === "cierra" ? "No se trabaja" : `Horario especial: ${textoTramos(e.tramos ?? [])}`}
                        </TableCell>
                        <TableCell>{e.motivo ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {e.autor} · {e.actualizadoAt}
                        </TableCell>
                        <TableCell className="text-right">
                          <form action={guardarDiaCalendarioAccion}>
                            <input type="hidden" name="cal" value={cal} />
                            <input type="hidden" name="anio" value={anio} />
                            <input type="hidden" name="fecha" value={e.fecha} />
                            <input type="hidden" name="opcion" value="altitude" />
                            <Button type="submit" variant="outline" size="xs">
                              Quitar
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {esPlantilla && clientes.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Copiar los festivos de un cliente</CardTitle>
            <CardDescription>
              Añade al calendario laboral los festivos de un cliente en un año (sin el 24 ni el 31 de diciembre, que según el
              convenio no son festivos laborales). No toca los días que ya están. Después, añade a mano los dos festivos
              locales si faltan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={copiarFestivosLaboralAccion} className="flex flex-wrap items-end gap-3">
              <Campo etiqueta="Calendario" htmlFor="origen">
                <SelectNativo id="origen" name="origen" defaultValue={clientes.includes("GrupoHuertas") ? "GrupoHuertas" : clientes[0]}>
                  {clientes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>
              <Campo etiqueta="Año" htmlFor="anio-copia">
                <Input id="anio-copia" name="anio" type="number" defaultValue={anio} className="w-24" />
              </Campo>
              <Button type="submit" variant="outline">
                Copiar festivos
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function FormularioDia(props: {
  cal: string;
  anio: number;
  fecha: string;
  esPlantilla: boolean;
  estado: EstadoDia;
  titulo: string;
  festivoAltitude: boolean;
  semanal: string | null;
  nombre: string | null;
  motivo: string | null;
  tramos: Tramo[] | null;
  volverHref: string;
}) {
  const opciones: { valor: string; texto: string; ayuda?: string }[] = props.esPlantilla
    ? [
        { valor: "laborable", texto: "Laborable", ayuda: "Los agentes trabajan su turno." },
        {
          valor: "festivo",
          texto: "Festivo laboral",
          ayuda: "No se trabaja y justifica el turno. Si alguien lo trabaja, se le compensa con un día FEST.",
        },
        {
          valor: "cierre",
          texto: "Cierre de empresa",
          ayuda: "La empresa cierra: justifica el turno y, si alguien trabaja, no genera FEST.",
        },
      ]
    : [
        {
          valor: "altitude",
          texto: props.festivoAltitude ? "Festivo, como dice Altitude" : "Normal, como dice Altitude",
          ayuda: props.festivoAltitude ? "No se atiende ese día." : props.semanal ? `Horario de siempre: ${props.semanal}.` : undefined,
        },
        props.festivoAltitude
          ? { valor: "abre", texto: "Se trabaja", ayuda: props.semanal ? `Con el horario de siempre: ${props.semanal}.` : "Con el horario de siempre." }
          : { valor: "cierra", texto: "No se trabaja", ayuda: "Ese día no se atiende: el plan no pone entrantes." },
        { valor: "horario", texto: "Horario especial", ayuda: "Solo ese día, por ejemplo «9-15»." },
      ];
  const actual = props.esPlantilla
    ? props.estado === "festivo_laboral"
      ? "festivo"
      : props.estado === "cierre_empresa"
        ? "cierre"
        : "laborable"
    : props.estado === "abre" || props.estado === "cierra" || props.estado === "horario"
      ? props.estado
      : "altitude";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base first-letter:uppercase">{props.titulo}</CardTitle>
        {!props.esPlantilla ? (
          <CardDescription>Cambia solo el plan del dashboard, no Altitude ni el Power BI.</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <form action={guardarDiaCalendarioAccion} className="space-y-4">
          <input type="hidden" name="cal" value={props.cal} />
          <input type="hidden" name="anio" value={props.anio} />
          <input type="hidden" name="fecha" value={props.fecha} />
          <fieldset className="space-y-2">
            <legend className="sr-only">Qué pasa ese día</legend>
            {opciones.map((o) => (
              <label key={o.valor} className="flex items-start gap-2 text-sm">
                <input type="radio" name="opcion" value={o.valor} defaultChecked={o.valor === actual} className="mt-1 accent-foreground" />
                <span>
                  <span className="font-medium">{o.texto}</span>
                  {o.ayuda ? <span className="block text-xs text-muted-foreground">{o.ayuda}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            {!props.esPlantilla ? (
              <Campo etiqueta="Horario especial" htmlFor="tramos" ayuda="Solo si eliges «Horario especial».">
                <Input id="tramos" name="tramos" defaultValue={props.tramos ? textoTramos(props.tramos) : ""} placeholder="p. ej. 9-15" />
              </Campo>
            ) : null}
            <Campo
              etiqueta={props.esPlantilla ? "Nombre del día" : "Motivo"}
              htmlFor="motivo"
              ayuda={props.esPlantilla ? "Por ejemplo «Día de la Hispanidad» o «Fiesta local»." : "Para que se sepa por qué (opcional)."}
            >
              <Input id="motivo" name="motivo" maxLength={200} defaultValue={(props.esPlantilla ? props.nombre : props.motivo) ?? ""} />
            </Campo>
          </div>
          <div className="flex gap-2">
            <Button type="submit">Guardar</Button>
            <Button variant="outline" render={<Link href={props.volverHref} />}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
