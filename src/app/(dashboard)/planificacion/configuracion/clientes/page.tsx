import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { SelectNativo } from "@/components/admin/select-nativo";
import { AreaTexto, Campo, Casilla, Muestra } from "@/components/planificacion/campos";
import { PuntoAyuda } from "@/components/planificacion/punto-ayuda";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import { ayerISO, fechaCorta, hoyISO } from "@/lib/fechas";
import { leerEquipo } from "@/lib/planificacion/equipo";
import {
  aFormulario,
  nombreCampo,
  perdidasAlEditar,
  resumenParametros,
  TEXTO_CURVA,
  textoHorario,
  type FormularioCliente,
} from "@/lib/planificacion/formulario-cliente";
import { MODOS_CLIENTE, sumarDias, type ModoCliente } from "@/lib/planificacion/motor";
import { leerParametrosPlan } from "@/lib/planificacion/parametros";
import * as repo from "@/lib/planificacion/repositorio";
import { festivosServicio, horariosServicio } from "@/lib/rdb/queries/planificacion";
import { borrarPrefijoPlan, guardarClientePlan, guardarPrefijoPlan } from "../acciones";

export const metadata: Metadata = { title: "Clientes de planificación" };
export const dynamic = "force-dynamic";

const MODOS: Record<ModoCliente, string> = {
  resto: "Resto (base: se queda las horas sobrantes)",
  erlang: "Erlang (entrante: cubre su mínimo)",
  objetivo: "Objetivo (saliente: horas por lista y ritmo)",
  a_demanda: "A demanda (sin bloques)",
};

interface Calendario {
  nombre: string;
  horario: { texto: string; hasta: string } | null;
  festivosHasta: string | null;
  proximoFestivo: string | null;
}

/**
 * Calendarios de atención de RDBv2 (horarios_servicio y festivos_servicio,
 * cacheados 24 h). Si RDBv2 no responde, la página se ve igual, sin la lista.
 */
async function leerCalendarios(hoy: string): Promise<{ calendarios: Calendario[]; error: string | null }> {
  try {
    const [horarios, festivos] = await Promise.all([horariosServicio(), festivosServicio(hoy, sumarDias(hoy, 365))]);
    const nombres = [...new Set([...horarios.map((h) => h.servicio), ...Object.keys(festivos.ultimaFechaPorServicio)])].sort();
    return {
      calendarios: nombres.map((nombre) => ({
        nombre,
        horario: textoHorario(horarios, nombre, hoy),
        festivosHasta: festivos.ultimaFechaPorServicio[nombre] ?? null,
        proximoFestivo: festivos.festivos.find((f) => f.servicio === nombre)?.fecha ?? null,
      })),
      error: null,
    };
  } catch (e) {
    console.error("[planificacion] calendarios de RDBv2:", e);
    return { calendarios: [], error: "No se han podido leer los horarios de Altitude (RDBv2). Prueba a recargar en un rato." };
  }
}

/**
 * Un apartado del formulario. `modos` = los modos de cliente que lo usan: con
 * otro modo elegido se oculta (CSS de .form-cliente-plan en globals.css, sin
 * JS). Oculto se sigue enviando: no se pierde nada al cambiar de modo.
 */
function Apartado({
  titulo,
  ayuda,
  descripcion,
  modos,
  children,
}: {
  titulo: string;
  ayuda?: React.ReactNode;
  descripcion: React.ReactNode;
  modos?: ModoCliente[];
  children: React.ReactNode;
}) {
  return (
    <fieldset data-modos={modos?.join(" ")} className="min-w-0 space-y-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">
        {titulo}
        {ayuda}
      </legend>
      <p className="-mt-1 text-xs text-muted-foreground">{descripcion}</p>
      {children}
    </fieldset>
  );
}

/** Campo de texto de los parámetros, con el nombre que lee la acción. */
function Texto({
  campo,
  f,
  etiqueta,
  ayuda,
  numero,
  placeholder,
  modos,
}: {
  campo: Exclude<keyof FormularioCliente, "erlang" | "inicioContrato" | "fechaFin" | "curva" | "calendario">;
  f: FormularioCliente;
  etiqueta: string;
  ayuda?: React.ReactNode;
  numero?: "decimal" | "entero";
  placeholder?: string;
  modos?: ModoCliente[];
}) {
  const id = nombreCampo(campo);
  return (
    <div data-modos={modos?.join(" ")}>
      <Campo etiqueta={etiqueta} htmlFor={id} ayuda={ayuda}>
        <Input
          id={id}
          name={id}
          defaultValue={f[campo]}
          inputMode={numero === "entero" ? "numeric" : numero}
          placeholder={placeholder}
          autoComplete="off"
        />
      </Campo>
    </div>
  );
}

function Fecha({ campo, f, etiqueta, ayuda }: { campo: "inicioContrato" | "fechaFin"; f: FormularioCliente; etiqueta: string; ayuda: string }) {
  const id = nombreCampo(campo);
  return (
    <Campo etiqueta={etiqueta} htmlFor={id} ayuda={ayuda}>
      <Input id={id} name={id} type="date" defaultValue={f[campo]} />
    </Campo>
  );
}

export default async function PaginaClientesPlan({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; detalle?: string; editar?: string }>;
}) {
  await requireRol(...ROLES_PLAN_EDICION);
  const { msg, detalle, editar } = await searchParams;
  const p = leerParametrosPlan();
  const clientes = repo.leerClientesTodos();
  const eq = leerEquipo(p.equipo, ayerISO());
  const enEdicion = editar ? clientes.find((c) => c.codigo === editar) : undefined;
  const colorDe = new Map(clientes.map((c) => [c.codigo, c.color]));
  const hoy = hoyISO();
  const { calendarios, error: errorCalendarios } = await leerCalendarios(hoy);
  const f = aFormulario(enEdicion?.parametros ?? {});
  // Lo guardado que el formulario no puede enseñar tal cual (se avisa antes de guardar)
  const perdidas = enEdicion ? perdidasAlEditar(enEdicion.parametros) : [];

  const usuariosDe = (prefijo: string, sufijo: string) =>
    eq.usuarios.filter((u) => u.prefijo.toLowerCase() === prefijo.toLowerCase() && u.sufijo.toLowerCase() === sufijo.toLowerCase());
  const sinMapear = [...new Set(eq.usuarios.filter((u) => u.cliente == null).map((u) => `${u.prefijo}|${u.sufijo}`))]
    .map((k) => {
      const [prefijo, sufijo] = k.split("|");
      const suyos = usuariosDe(prefijo, sufijo);
      const ultima = suyos.map((u) => eq.ultimas.get(u.usrName)).filter((x): x is string => !!x).sort().pop() ?? null;
      return { prefijo, sufijo, usuarios: suyos.length, ultima };
    })
    .sort((a, b) => (b.ultima ?? "").localeCompare(a.ultima ?? "") || a.prefijo.localeCompare(b.prefijo));

  const selectorCliente = (nombre: string, porDefecto?: string | null, vacio?: string) => (
    <SelectNativo name={nombre} defaultValue={porDefecto ?? ""} required={!vacio}>
      {vacio ? <option value="">{vacio}</option> : null}
      {clientes.map((c) => (
        <option key={c.codigo} value={c.codigo}>
          {c.codigo} · {c.nombre}
        </option>
      ))}
    </SelectNativo>
  );

  return (
    <div className="space-y-6">
      <AvisoMsg msg={msg} detalle={detalle} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clientes de planificación</CardTitle>
          <CardDescription>
            Un cliente de planificación no es un servicio de Altitude: GH, su BBDD (BD) y Lexus (LX) son tres clientes del
            servicio GrupoHuertas porque se trabajan con usuarios distintos. El equipo que se planifica es «{p.equipo}».
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead className="text-right">Prioridad</TableHead>
                <TableHead>Cuenta como</TableHead>
                <TableHead>Servicio · equipo</TableHead>
                <TableHead>Campañas</TableHead>
                <TableHead>Cómo se planifica</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.map((c) => (
                <TableRow key={c.id} className={!c.activo ? "opacity-50" : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <Muestra color={c.color} /> {c.codigo}
                      {!c.activo ? <Badge variant="outline">inactivo</Badge> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.nombre}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.modo}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.prioridad}</TableCell>
                  <TableCell>{c.cuentaComo ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    {c.servicioAltitude ?? "—"}
                    <div className="text-xs text-muted-foreground">{c.equipo}</div>
                  </TableCell>
                  <TableCell className="max-w-56 font-mono text-xs whitespace-normal">{c.campanias.join(", ") || "—"}</TableCell>
                  <TableCell className="max-w-72 text-xs whitespace-normal">
                    {resumenParametros(c.parametros).map((r) => (
                      <div key={r}>{r}</div>
                    ))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="xs" render={<a href={`?editar=${c.codigo}`} />}>
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
          <CardTitle className="text-base">{enEdicion ? `Editar ${enEdicion.codigo}` : "Nuevo cliente"}</CardTitle>
          <CardDescription>
            {enEdicion
              ? "El código no se puede cambiar: lo usan los bloques, los prefijos y las bolsas. Para retirarlo, desmárcalo como activo."
              : "Después, asígnale los prefijos de usuario de Altitude más abajo."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={guardarClientePlan} key={enEdicion?.codigo ?? "nuevo"} className="form-cliente-plan space-y-4">
            {enEdicion ? <input type="hidden" name="id" value={enEdicion.id} /> : null}
            <div className="grid gap-3 md:grid-cols-4">
              <Campo etiqueta="Código" htmlFor="codigo">
                <Input
                  id="codigo"
                  name="codigo"
                  defaultValue={enEdicion?.codigo}
                  disabled={!!enEdicion}
                  placeholder="p. ej. SOC"
                  required={!enEdicion}
                />
              </Campo>
              <Campo etiqueta="Nombre" htmlFor="nombre" className="md:col-span-2">
                <Input id="nombre" name="nombre" defaultValue={enEdicion?.nombre} required />
              </Campo>
              <Campo etiqueta="Color" htmlFor="color">
                <Input id="color" name="color" type="color" defaultValue={enEdicion?.color ?? "#DDDDDD"} className="h-8 p-1" />
              </Campo>
              <Campo etiqueta="Modo" className="md:col-span-2">
                <SelectNativo name="modo" defaultValue={enEdicion?.modo ?? "objetivo"}>
                  {MODOS_CLIENTE.map((m) => (
                    <option key={m} value={m}>
                      {MODOS[m]}
                    </option>
                  ))}
                </SelectNativo>
              </Campo>
              <Campo etiqueta="Prioridad" htmlFor="prioridad" ayuda="Los «objetivo» se colocan de menor a mayor.">
                <Input id="prioridad" name="prioridad" type="number" min={0} max={1000} defaultValue={enEdicion?.prioridad ?? 100} />
              </Campo>
              <Campo etiqueta="Orden en pantalla" htmlFor="orden">
                <Input id="orden" name="orden" type="number" min={0} max={1000} defaultValue={enEdicion?.orden ?? clientes.length + 1} />
              </Campo>
              <Campo etiqueta="Cuenta como" ayuda="Cuenta en la cobertura (y la bolsa) de otro cliente: BD y LX → GH.">
                {selectorCliente("cuentaComo", enEdicion?.cuentaComo, "— (ninguno)")}
              </Campo>
              <Campo etiqueta="Servicio de Altitude" htmlFor="servicioAltitude" ayuda="ph_service.name (demanda por franja).">
                <Input id="servicioAltitude" name="servicioAltitude" defaultValue={enEdicion?.servicioAltitude ?? ""} />
              </Campo>
              <Campo etiqueta="Equipo" htmlFor="equipo">
                <Input id="equipo" name="equipo" defaultValue={enEdicion?.equipo ?? p.equipo} required />
              </Campo>
              <div className="flex items-end pb-1.5">
                <Casilla etiqueta="Activo" name="activo" defaultChecked={enEdicion?.activo ?? true} />
              </div>
            </div>
            <Campo
              etiqueta="Campañas (patrones LIKE, uno por línea)"
              htmlFor="campanias"
              className="md:w-1/2"
              ayuda="Solo la lista EN CURSO (p. ej. UGR[_]EGRE26): las antiguas conservan vivos que nadie llama e inflan el objetivo."
            >
              <AreaTexto id="campanias" name="campanias" rows={4} defaultValue={(enEdicion?.campanias ?? []).join("\n")} />
            </Campo>

            <div className="space-y-1 pt-2">
              <h3 className="text-sm font-medium">Cómo se planifica este cliente</h3>
              <p className="text-xs text-muted-foreground">
                Solo salen los apartados que usa el modo elegido arriba. Lo que se deja vacío usa el valor normal. Los
                cambios se notan al volver a generar el borrador.
              </p>
            </div>

            {perdidas.length > 0 ? (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <div className="font-medium">Al guardar, esto cambiará (el formulario no puede enseñarlo tal cual):</div>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs">
                    {perdidas.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Apartado
                titulo="Horario de atención"
                ayuda={<PuntoAyuda id="cliente-horario" />}
                descripcion="Las horas en que la línea del cliente está abierta y sus festivos. No se cambian aquí: salen de las tablas de horarios y festivos de los servicios en Altitude. Aquí solo se elige cuál es la de este cliente."
              >
                <Campo
                  etiqueta="Calendario"
                  htmlFor={nombreCampo("calendario")}
                  ayuda="Sin horario propio: el plan le puede poner horas a cualquier hora del día."
                >
                  <SelectNativo id={nombreCampo("calendario")} name={nombreCampo("calendario")} defaultValue={f.calendario}>
                    <option value="">— Sin horario propio</option>
                    {calendarios.map((c) => (
                      <option key={c.nombre} value={c.nombre}>
                        {c.nombre}
                      </option>
                    ))}
                    {f.calendario && !calendarios.some((c) => c.nombre === f.calendario) ? (
                      <option value={f.calendario}>
                        {f.calendario}
                        {errorCalendarios ? "" : " (no está en Altitude)"}
                      </option>
                    ) : null}
                  </SelectNativo>
                </Campo>
                {errorCalendarios ? <p className="text-xs text-amber-700">{errorCalendarios}</p> : null}
                {calendarios.length > 0 ? (
                  <ul className="space-y-1 rounded-md bg-muted/50 p-2 text-xs">
                    {calendarios.map((c) => (
                      <li key={c.nombre} className={c.nombre === f.calendario ? "font-medium" : "text-muted-foreground"}>
                        {c.nombre}: {c.horario ? c.horario.texto : "sin horario cargado"}
                        {c.festivosHasta ? ` · festivos cargados hasta el ${fechaCorta(c.festivosHasta)}` : " · sin festivos"}
                        {c.proximoFestivo ? ` · próximo: ${fechaCorta(c.proximoFestivo)}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Apartado>

              <Apartado
                titulo="Cuándo se le puede planificar"
                ayuda={<PuntoAyuda id="cliente-bloques" />}
                modos={["objetivo"]}
                descripcion="Las horas en que el plan puede poner a alguien con este cliente. Escríbelas como en Patrones: «11-14, 16-18». Cada bloque se da de una vez a una sola persona: «11-14» son 3 horas seguidas; para tramos de 2 horas, escribe «11-13, 13-15»."
              >
                <Texto campo="bloquesPreferidos" f={f} etiqueta="Bloques preferidos" placeholder="p. ej. 11-14" ayuda="El plan los elige antes que los otros." />
                <Texto
                  campo="bloquesOtros"
                  f={f}
                  etiqueta="Otros bloques posibles"
                  placeholder="p. ej. 16-18"
                  ayuda="También se usan, pero el plan prefiere los de arriba."
                />
                <Texto
                  campo="evitar"
                  f={f}
                  etiqueta="Nunca en"
                  placeholder="p. ej. 18-19"
                  ayuda="Horas en que nunca se le pone a nadie: un bloque que las pise no se usa."
                />
              </Apartado>

              <Apartado
                titulo="Contrato y fin de campaña"
                ayuda={<PuntoAyuda id="cliente-contrato" />}
                modos={["objetivo"]}
                descripcion="Para que el plan no ponga más horas de las contratadas y para estimar cuándo se acaban (se ve en «Bolsas y objetivos»)."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Texto
                    campo="horasContratadas"
                    f={f}
                    etiqueta="Horas contratadas"
                    numero="decimal"
                    placeholder="p. ej. 1200"
                    ayuda="Las de toda la campaña, no las del mes. Sin puntos: 1200."
                  />
                  <Fecha campo="inicioContrato" f={f} etiqueta="Contrato desde" ayuda="Desde este día cuentan las horas ya hechas." />
                  <Fecha
                    campo="fechaFin"
                    f={f}
                    etiqueta="Último día de la campaña"
                    ayuda="Después no se planifica. Vacío: hasta que se acabe la lista o las horas."
                  />
                  <Texto
                    campo="horasSemanaFijas"
                    f={f}
                    etiqueta="Horas fijas por semana"
                    numero="decimal"
                    ayuda="Siempre las mismas cada semana (CEFF: 4), menos si la lista ya no lo necesita. En semanas con festivo, la parte que toca. Vacío: las que pida la lista."
                  />
                </div>
              </Apartado>

              <Apartado
                titulo="Límites por persona"
                descripcion="Lo máximo para una misma persona con este cliente. Vacío: sin máximo."
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <Texto
                    campo="maxHorasDiaAgente"
                    f={f}
                    etiqueta="Horas al día"
                    numero="decimal"
                    modos={["objetivo"]}
                  />
                  <Texto
                    campo="maxBloquesDiaAgente"
                    f={f}
                    etiqueta="Bloques al día"
                    numero="entero"
                    modos={["objetivo"]}
                  />
                  <Texto
                    campo="maxHorasSeguidas"
                    f={f}
                    etiqueta="Horas seguidas"
                    numero="decimal"
                    ayuda="Si se pasa en el tablero, sale un aviso."
                  />
                </div>
              </Apartado>

              <Apartado
                titulo="Llamadas entrantes"
                ayuda={<PuntoAyuda id="cliente-entrantes" />}
                modos={["resto", "erlang"]}
                descripcion="Para clientes que reciben llamadas: el plan calcula cuántas personas hacen falta en cada hora (con las llamadas de las últimas semanas) y avisa si una hora se queda por debajo."
              >
                <Casilla
                  etiqueta="Calcular cuántas personas hacen falta para las llamadas"
                  name={nombreCampo("erlang")}
                  defaultChecked={f.erlang}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Texto campo="slaPct" f={f} etiqueta="Atender el … % de las llamadas" numero="decimal" ayuda="Normal: 80." />
                  <Texto campo="umbralSeg" f={f} etiqueta="… antes de (segundos)" numero="decimal" ayuda="Normal: 20." />
                  <Texto
                    campo="margen"
                    f={f}
                    etiqueta="Personas de margen"
                    numero="entero"
                    ayuda="Se suman a lo calculado (también hacen salientes). Normal: 1."
                  />
                  <Texto
                    campo="ahtSeg"
                    f={f}
                    etiqueta="Duración media (s)"
                    numero="decimal"
                    ayuda="De una llamada. Vacío: la que se mide en las llamadas reales."
                  />
                </div>
              </Apartado>

              <Apartado
                titulo="Lista de llamadas"
                modos={["objetivo"]}
                descripcion="Cuántas horas pide la lista: los contactos que quedan por cerrar entre los cierres por hora."
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Texto
                    campo="pctVivosObjetivo"
                    f={f}
                    etiqueta="Puede quedar sin terminar (%)"
                    numero="decimal"
                    ayuda="La lista se da por acabada al llegar a este % de contactos sin cerrar (UGR: 28,32, lo que quedó en 2025). 0: hasta el último."
                  />
                  <Texto
                    campo="ritmoManual"
                    f={f}
                    etiqueta="Ritmo fijo (cierres por hora)"
                    numero="decimal"
                    ayuda="Vacío: se mide con las últimas semanas. Ponlo en una lista nueva, sin historia (LX: 6,9)."
                  />
                  <Campo
                    etiqueta="Reparto entre semanas"
                    htmlFor={nombreCampo("curva")}
                    ayuda="No cuenta si hay horas fijas por semana."
                  >
                    <SelectNativo id={nombreCampo("curva")} name={nombreCampo("curva")} defaultValue={f.curva}>
                      {Object.entries(TEXTO_CURVA).map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </SelectNativo>
                  </Campo>
                  <Campo
                    etiqueta="Campañas parecidas (una por línea)"
                    htmlFor={nombreCampo("campaniasSimilares")}
                    ayuda="Ya terminadas, para estimar cuándo acabará esta. Vacío: las del cliente sin el año (UGR[_]EGRE26 → UGR[_]EGRE%)."
                  >
                    <AreaTexto
                      id={nombreCampo("campaniasSimilares")}
                      name={nombreCampo("campaniasSimilares")}
                      rows={2}
                      defaultValue={f.campaniasSimilares}
                    />
                  </Campo>
                </div>
              </Apartado>
            </div>

            <details data-modos="objetivo" className="rounded-lg border p-4 text-sm">
              <summary className="cursor-pointer font-medium">Opciones avanzadas (normalmente no hace falta tocarlas)</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Texto
                  campo="pesoPreferidos"
                  f={f}
                  etiqueta="Ventaja de los bloques preferidos"
                  numero="decimal"
                  ayuda="0,3 es lo normal. Más alto: más se insiste en ellos."
                />
                <Texto
                  campo="pesoContacto"
                  f={f}
                  etiqueta="Peso de las horas con más contacto"
                  numero="decimal"
                  ayuda="1: busca las horas en que más gente contesta. 0: da igual la hora."
                />
                <Texto
                  campo="kDia"
                  f={f}
                  etiqueta="Reparto entre días"
                  numero="decimal"
                  ayuda="6 es lo normal. Más bajo: reparte más las horas entre días distintos en vez de juntarlas."
                />
              </div>
            </details>

            {enEdicion ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Ver la configuración guardada en JSON (solo lectura, para TI)</summary>
                <pre className="mt-1 overflow-x-auto rounded-md bg-muted/50 p-2 font-mono text-foreground">
                  {JSON.stringify(enEdicion.parametros, null, 2)}
                </pre>
              </details>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit">{enEdicion ? "Guardar" : "Crear cliente"}</Button>
              {enEdicion ? (
                <Button variant="outline" render={<a href="?" />}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="prefijos">
        <CardHeader>
          <CardTitle className="text-base">Prefijos de usuario → cliente</CardTitle>
          <CardDescription>
            Cada agente tiene un usuario de Altitude por cliente (GH_0851, GH_0851_BD, UGR_0851…): el par prefijo + sufijo
            dice el cliente. Sin mayúsculas: Av y AV son el mismo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prefijo + sufijo</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Usuarios</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...eq.prefijos]
                .sort((a, b) => a.clienteCodigo.localeCompare(b.clienteCodigo) || a.sufijo.localeCompare(b.sufijo))
                .map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="font-mono text-sm">
                      {x.prefijo}_nnnn{x.sufijo}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <Muestra color={colorDe.get(x.clienteCodigo) ?? "#DDDDDD"} /> {x.clienteCodigo}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usuariosDe(x.prefijo, x.sufijo).length}</TableCell>
                    <TableCell className="text-right">
                      <form action={borrarPrefijoPlan}>
                        <input type="hidden" name="id" value={x.id} />
                        <Button variant="outline" size="xs" type="submit">
                          Quitar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>

          <form action={guardarPrefijoPlan} className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1.5fr_auto]">
            <Campo etiqueta="Prefijo" htmlFor="prefijo">
              <Input id="prefijo" name="prefijo" placeholder="GH" required />
            </Campo>
            <Campo etiqueta="Sufijo (opcional)" htmlFor="sufijo">
              <Input id="sufijo" name="sufijo" placeholder="_BD" />
            </Campo>
            <Campo etiqueta="Cliente">{selectorCliente("clienteCodigo")}</Campo>
            <Button type="submit">Añadir o cambiar</Button>
          </form>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Prefijos de agentes sin cliente ({sinMapear.length})</h3>
            <p className="text-xs text-muted-foreground">
              Usuarios de agente cuyo prefijo no casa con ningún cliente: otros equipos o un cliente nuevo. Los recientes
              salen como aviso en Planificación.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Prefijo + sufijo</TableHead>
                  <TableHead className="text-right">Usuarios</TableHead>
                  <TableHead>Última sesión</TableHead>
                  <TableHead className="text-right">Asignar a</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sinMapear.map((x) => (
                  <TableRow key={`${x.prefijo}${x.sufijo}`}>
                    <TableCell className="font-mono text-sm">
                      {x.prefijo}_nnnn{x.sufijo}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{x.usuarios}</TableCell>
                    <TableCell className="text-sm">{x.ultima ? fechaCorta(x.ultima) : "—"}</TableCell>
                    <TableCell>
                      <form action={guardarPrefijoPlan} className="flex items-center justify-end gap-2">
                        <input type="hidden" name="prefijo" value={x.prefijo} />
                        <input type="hidden" name="sufijo" value={x.sufijo} />
                        <div className="w-44">{selectorCliente("clienteCodigo")}</div>
                        <Button variant="outline" size="xs" type="submit">
                          Asignar
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
