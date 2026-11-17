import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, MessageSquareText, Settings } from "lucide-react";
import { AvisoMsg } from "@/components/admin/aviso-msg";
import { AvisoRango } from "@/components/filtros/aviso-rango";
import { SelectorRango } from "@/components/filtros/selector-rango";
import { TarjetaKpi } from "@/components/kpi/tarjeta-kpi";
import { Tiempo } from "@/components/kpi/tiempo";
import { RefrescoMiServicio } from "@/components/mi-servicio/interaccion";
import { BarraDia, EjeHoras, escalaDe, LeyendaBarra } from "@/components/rrhh/barra-dia";
import { BuscadorPersonas, SelectorDia } from "@/components/rrhh/controles";
import { CabeceraOrdenable, FilasOrdenables, TablaOrdenable } from "@/components/tabla-ordenable";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { puedeEditarRrhh, requireRol, ROLES_RRHH_LECTURA } from "@/lib/auth/rbac";
import { esquemaFechaISO, esquemaRango, fechaCorta, horasLegibles, hoyISO, motivoRangoInvalido, relojDesdeHoras } from "@/lib/fechas";
import { valoresOrden } from "@/lib/orden";
import { desplazarMes, lunesDe, sumarDias } from "@/lib/planificacion/motor";
import { nombreMes } from "@/lib/planificacion/tablero";
import { horarioPublicado } from "@/lib/planificacion/vistas";
import { auditarVerPersona } from "@/lib/rrhh/auditoria";
import { hora, SIN_APUNTAR } from "@/lib/rrhh/dia";
import { GRUPOS_RRHH, leerGrupo, NOMBRE_GRUPO, type GrupoRrhh } from "@/lib/rrhh/grupos";
import * as repo from "@/lib/rrhh/repositorio";
import { datosDia, datosPeriodo, filtrarDia, filtrarPeriodo, MAX_DIAS_PERIODO, NOMBRE_FUENTE } from "@/lib/rrhh/servidor";
import { cn } from "@/lib/utils";
import { DetallePersona } from "./detalle";
import { VistaAgentes } from "./vista-agentes";
import { VistaTurnos } from "./vista-turnos";

// ============================================================
// Panel de RRHH → Ausencias (16/11/2026, docs/plan-rrhh.md): el día de
// cada persona en una barra, con lo que estuvo ausente (sin conectar en su
// horario, pausas que son ausencia y lo apuntado), y el detalle de una
// persona al pulsarla. Hoy se refresca solo cada minuto.
//
// Segunda pestaña, «Por agente» (?vista=agentes&desde=&hasta=): de un
// periodo, cada persona con su tiempo conectado y su tiempo ausente por
// motivo (vista-agentes.tsx).
//
// Tercera, «Turnos» (?vista=turnos&mes=): el último plan PUBLICADO del mes
// (vista-turnos.tsx). Las tres se filtran por grupo (?grupo=bolsas|socios|gh,
// lib/rrhh/grupos.ts), que se conserva al moverse por el panel.
// ============================================================

export const metadata: Metadata = { title: "RRHH · Ausencias" };
export const dynamic = "force-dynamic";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const diaDeLaSemana = (fecha: string) => DIAS[new Date(`${fecha}T12:00:00`).getDay()];

/** Una cifra de la tabla: «—» si es cero (se ve mejor lo que importa). */
function Celda({ min, alerta = false }: { min: number; alerta?: boolean }) {
  if (min < 0.005) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn(alerta && "font-semibold")}>
      <Tiempo horas={min / 60} />
    </span>
  );
}

/** Atajos del periodo de «Por agente». */
function presetsPeriodo(hoy: string) {
  const lunes = lunesDe(hoy);
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMesAnterior = sumarDias(inicioMes, -1);
  return [
    { etiqueta: "Hoy", desde: hoy, hasta: hoy },
    { etiqueta: "Ayer", desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) },
    { etiqueta: "Esta semana", desde: lunes, hasta: hoy },
    { etiqueta: "Semana pasada", desde: sumarDias(lunes, -7), hasta: sumarDias(lunes, -1) },
    { etiqueta: "Mes actual", desde: inicioMes, hasta: hoy },
    { etiqueta: "Mes anterior", desde: `${finMesAnterior.slice(0, 7)}-01`, hasta: finMesAnterior },
  ];
}

type Vista = "dia" | "agentes" | "turnos";

/** URL del panel con el grupo elegido (los valores vacíos no salen). */
function url(params: Record<string, string | null | undefined>, ancla = ""): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const q = p.toString();
  return `/rrhh${q ? `?${q}` : ""}${ancla}`;
}

/** Título, botones, pestañas y filtro de grupo, comunes a las tres vistas. */
function Cabecera({
  vista,
  excel,
  descripcion,
  grupo,
  enlaceGrupo,
}: {
  vista: Vista;
  excel: { href: string; texto: string } | null;
  descripcion: string;
  grupo: GrupoRrhh | null;
  /** La misma página con otro grupo (null = todos). */
  enlaceGrupo: (g: GrupoRrhh | null) => string;
}) {
  const g = grupo ?? undefined;
  const pestana = (v: Vista, texto: string, href: string) => (
    <Link
      href={href}
      aria-current={vista === v ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        vista === v ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {texto}
    </Link>
  );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Ausencias</h1>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {excel ? (
            <Button variant="outline" size="sm" render={<a href={excel.href} />}>
              <Download className="size-4" aria-hidden />
              {excel.texto}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" render={<Link href="/rrhh/configuracion" />}>
            <Settings className="size-4" aria-hidden />
            Configuración
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Vistas" className="inline-flex gap-1 rounded-lg border p-1">
          {pestana("dia", "Día", url({ grupo: g }))}
          {pestana("agentes", "Por agente", url({ vista: "agentes", grupo: g }))}
          {pestana("turnos", "Turnos", url({ vista: "turnos", grupo: g }))}
        </nav>
        <nav aria-label="Grupo" className="inline-flex flex-wrap items-center gap-1 text-sm">
          <span className="mr-1 text-muted-foreground">Grupo:</span>
          {[null, ...GRUPOS_RRHH].map((x) => (
            <Link
              key={x ?? "todos"}
              href={enlaceGrupo(x)}
              aria-current={grupo === x ? "true" : undefined}
              className={cn(
                "rounded-full border px-3 py-0.5 transition-colors",
                grupo === x ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {x ? NOMBRE_GRUPO[x] : "Todos"}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default async function PaginaRrhh({
  searchParams,
}: {
  searchParams: Promise<{
    fecha?: string;
    persona?: string;
    msg?: string;
    detalle?: string;
    vista?: string;
    desde?: string;
    hasta?: string;
    grupo?: string;
    mes?: string;
  }>;
}) {
  const usuario = await requireRol(...ROLES_RRHH_LECTURA);
  const sp = await searchParams;
  const hoy = hoyISO();
  const grupo = leerGrupo(sp.grupo);
  const g = grupo ?? undefined;

  if (sp.vista === "turnos") {
    const mesHoy = hoy.slice(0, 7);
    const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? (sp.mes as string) : mesHoy;
    const horario = horarioPublicado(mes);
    const enlaceMes = (m: string) => url({ vista: "turnos", mes: m === mesHoy ? undefined : m, grupo: g });
    return (
      <div className="rrhh-raiz space-y-5">
        <Cabecera
          vista="turnos"
          excel={horario ? { href: `/api/planificacion/horario?mes=${mes}&formato=pdf`, texto: "PDF del mes" } : null}
          descripcion="El último plan publicado de Planificación: el turno o la ausencia de cada persona, día a día."
          grupo={grupo}
          enlaceGrupo={(x) => url({ vista: "turnos", mes: sp.mes, grupo: x ?? undefined })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Mes anterior" render={<Link href={enlaceMes(desplazarMes(mes, -1))} />}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="min-w-36 text-center text-sm font-medium first-letter:uppercase">{nombreMes(mes)}</span>
          <Button variant="outline" size="icon" aria-label="Mes siguiente" render={<Link href={enlaceMes(desplazarMes(mes, 1))} />}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {mes !== mesHoy ? (
            <Button variant="outline" size="sm" render={<Link href={enlaceMes(mesHoy)} />}>
              Este mes
            </Button>
          ) : null}
        </div>
        <VistaTurnos
          horario={horario}
          mes={nombreMes(mes)}
          hoy={hoy}
          soloOtroGrupo={grupo === "bolsas" || grupo === "socios"}
          enlaceDia={(fecha, numero) => url({ fecha, persona: numero, grupo: g }, "#detalle")}
        />
      </div>
    );
  }

  if (sp.vista === "agentes") {
    const presets = presetsPeriodo(hoy);
    const mesActual = presets.find((p) => p.etiqueta === "Mes actual") ?? presets[0];
    let motivo: string | null = null;
    let desde = mesActual.desde;
    let hasta = mesActual.hasta;
    if (sp.desde || sp.hasta) {
      const r = esquemaRango.safeParse({ desde: sp.desde, hasta: sp.hasta });
      motivo = motivoRangoInvalido(r);
      if (r.success) {
        const dias = Math.round((Date.parse(r.data.hasta) - Date.parse(r.data.desde)) / 86_400_000) + 1;
        if (r.data.desde > hoy) motivo = "El periodo empieza después de hoy";
        else if (dias > MAX_DIAS_PERIODO) motivo = `El periodo no puede pasar de ${MAX_DIAS_PERIODO} días`;
        else ({ desde, hasta } = r.data);
      }
    }
    const datos = filtrarPeriodo(await datosPeriodo(desde, hasta), grupo);
    const generado = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className="rrhh-raiz space-y-5">
        <Cabecera
          vista="agentes"
          excel={{ href: `/api/export/rrhh-ausencias?${new URLSearchParams({ desde, hasta, ...(g ? { grupo: g } : {}) })}`, texto: "Excel del periodo" }}
          descripcion="Cada persona en el periodo: tiempo conectado y tiempo ausente (pausas de ausencia) por motivo."
          grupo={grupo}
          enlaceGrupo={(x) => url({ vista: "agentes", desde: sp.desde, hasta: sp.hasta, grupo: x ?? undefined })}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SelectorRango desde={desde} hasta={hasta} presets={presets} />
          <RefrescoMiServicio enVivo={datos.enCurso} generado={generado} />
        </div>
        <AvisoRango motivo={motivo} alternativa={`del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`} />
        <VistaAgentes datos={datos} />
      </div>
    );
  }

  const pedida = esquemaFechaISO.safeParse(sp.fecha ?? hoy);
  const fecha = pedida.success && pedida.data <= hoy ? pedida.data : hoy;
  const puedeEditar = puedeEditarRrhh(usuario.rol);

  // El detalle se busca en todas (se puede llegar desde «Turnos» con otro grupo)
  const todas = await datosDia(fecha);
  const datos = filtrarDia(todas, grupo);
  const r = datos.resumen;
  const escala = escalaDe(datos.filas.map((f) => ({ horario: f.horario, tramos: f.dia.tramos })));
  const elegida = sp.persona ? todas.filas.find((f) => f.persona.numero === sp.persona) : undefined;
  if (elegida) await auditarVerPersona(usuario, elegida.persona.numero, fecha);
  const generado = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const enlaceDia = (f: string) => url({ fecha: f === hoy ? undefined : f, grupo: g });
  const ausentesTexto = r.ausentesPorTipo.map((a) => `${a.personas} ${a.tipo === SIN_APUNTAR ? "sin apuntar" : a.tipo}`).join(" · ");

  return (
    <div className="rrhh-raiz space-y-5">
      <Cabecera
        vista="dia"
        excel={{ href: `/api/export/rrhh-ausencias?fecha=${fecha}${g ? `&grupo=${g}` : ""}`, texto: "Excel del día" }}
        descripcion="El día de cada persona: cuándo se conectó, sus pausas y el tiempo que faltó dentro de su horario."
        grupo={grupo}
        enlaceGrupo={(x) => url({ fecha: sp.fecha, persona: sp.persona, grupo: x ?? undefined }, sp.persona ? "#detalle" : "")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Día anterior" render={<Link href={enlaceDia(sumarDias(fecha, -1))} />}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <SelectorDia fecha={fecha} maximo={hoy} grupo={g} />
        {fecha < hoy ? (
          <Button variant="outline" size="icon" aria-label="Día siguiente" render={<Link href={enlaceDia(sumarDias(fecha, 1))} />}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="outline" size="icon" aria-label="Día siguiente" disabled>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        )}
        {fecha !== hoy ? (
          <Button variant="outline" size="sm" render={<Link href={enlaceDia(hoy)} />}>
            Hoy
          </Button>
        ) : null}
        <span className="text-sm font-medium first-letter:uppercase">
          {diaDeLaSemana(fecha)} {fechaCorta(fecha)}
          {datos.esHoy ? " (hoy)" : ""}
        </span>
        <span className="ml-auto">
          <RefrescoMiServicio enVivo={datos.esHoy} generado={generado} />
        </span>
      </div>

      <AvisoMsg msg={sp.msg} detalle={sp.detalle} />
      {datos.festivo ? (
        <Alert>
          <AlertDescription>
            {datos.festivo}: las personas sin planificación no tienen horario hoy (solo sale quien se conectó o tiene algo apuntado).
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TarjetaKpi titulo="Con horario" valor={String(r.conHorario)} sub="personas que tenían que trabajar" />
        <TarjetaKpi
          titulo="Ausentes todo el día"
          valor={String(r.ausentesTodoElDia)}
          sub={ausentesTexto || "nadie"}
          ayuda="Tenían horario y no se conectaron nada (con una ausencia apuntada o sin ella). Hoy, solo cuenta si su horario ya empezó, salvo que tenga una ausencia de jornada completa."
        />
        <TarjetaKpi
          titulo="Llegadas tarde"
          valor={String(r.llegadasTarde)}
          sub={r.llegadasTarde > 0 ? `${horasLegibles(r.tardeMin / 60)} en total` : undefined}
          ayuda="Personas cuya primera conexión fue después de su hora de entrada, desde el primer minuto."
        />
        <TarjetaKpi
          titulo="Sin conectar en su horario"
          valor={horasLegibles(r.sinConectarMin / 60)}
          reloj={relojDesdeHoras(r.sinConectarMin / 60)}
          ayuda="Tiempo de su horario sin estar conectadas y sin nada apuntado: llegar tarde, irse antes, huecos y quien no vino."
        />
        <TarjetaKpi
          titulo="Pausas de ausencia"
          valor={horasLegibles(r.pausasAusenciaMin / 60)}
          sub={`trabajo sin cola: ${horasLegibles(r.pausasTrabajoMin / 60)}`}
          ayuda="Pausas conectada con un motivo que es ausencia (Descanso, Servicio, Fin de Jornada, pausa sin motivo...). Las de trabajo (Formación, Llamada manual...) van aparte. Las de menos de 1 minuto no cuentan. Se cambia en Configuración."
        />
      </div>

      {sp.persona && !elegida ? (
        <Alert>
          <AlertDescription>Esa persona no tiene nada este día (ni horario, ni conexión, ni ausencias).</AlertDescription>
        </Alert>
      ) : null}
      {elegida ? (
        <DetallePersona
          fila={elegida}
          fecha={fecha}
          ahoraMin={datos.ahoraMin}
          notas={repo.leerNotas(fecha, elegida.persona.numero)}
          tipos={repo.leerTiposAusencia()}
          puedeEditar={puedeEditar}
          grupo={g}
        />
      ) : null}

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Cada persona</CardTitle>
              <CardDescription>Pulsa una persona para ver su día en detalle, apuntar una ausencia o una nota.</CardDescription>
            </div>
            <BuscadorPersonas contenedor="rrhh-filas" />
          </div>
          <LeyendaBarra />
        </CardHeader>
        <CardContent id="rrhh-filas" className="overflow-x-auto">
          {datos.filas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie tenía horario ni se conectó este día.</p>
          ) : (
            <TablaOrdenable>
              <Table>
                <TableHeader>
                  <TableRow>
                    <CabeceraOrdenable col={0}>Persona</CabeceraOrdenable>
                    <CabeceraOrdenable col={1}>Horario</CabeceraOrdenable>
                    <TableHead className="w-full min-w-[19rem] align-bottom">
                      <EjeHoras escala={escala} />
                    </TableHead>
                    <CabeceraOrdenable col={2} numerica className="text-right" title="Primera conexión y última desconexión">
                      Entrada / salida
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={3} numerica className="text-right">
                      Tarde
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={4} numerica className="text-right" title="Tarde, salida antes, huecos y no conectarse">
                      Sin conectar
                    </CabeceraOrdenable>
                    <CabeceraOrdenable col={5} numerica className="text-right" title="Pausas con un motivo que es ausencia (Descanso, Servicio...)">
                      Pausas
                    </CabeceraOrdenable>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <FilasOrdenables>
                    {datos.filas.map((f) => {
                      const d = f.dia;
                      const p = f.persona;
                      const enlace = url({ fecha, persona: p.numero, grupo: g }, "#detalle");
                      return (
                        <TableRow
                          key={p.numero}
                          data-orden={valoresOrden(
                            p.codigo,
                            f.horario[0]?.inicioMin ?? null,
                            d.entradaMin,
                            d.tardeMin,
                            d.sinConectarMin,
                            d.pausasAusenciaMin,
                          )}
                          data-buscar={`${p.codigo} ${p.nombre ?? ""} ${p.usuarios.join(" ")} ${p.numero}`}
                          className={cn(elegida?.persona.numero === p.numero && "bg-muted/60")}
                        >
                          <TableCell className="whitespace-nowrap">
                            <Link href={enlace} className="font-medium underline-offset-2 hover:underline">
                              {p.codigo}
                            </Link>
                            {p.nombre ? <span className="block text-xs text-muted-foreground">{p.nombre}</span> : null}
                            <span className="mt-0.5 flex flex-wrap gap-1">
                              {d.ausenciaCompleta ? (
                                <span
                                  className="inline-flex items-center gap-1 rounded border px-1.5 text-[11px]"
                                  title={d.ausenciaCompleta.tipoNombre}
                                >
                                  <span aria-hidden className="size-2 rounded-full" style={{ background: d.ausenciaCompleta.color }} />
                                  {d.ausenciaCompleta.tipoCodigo}
                                </span>
                              ) : d.ausenteTodoElDia ? (
                                <span className="rounded border border-red-600/40 px-1.5 text-[11px] text-red-700 dark:text-red-400">No vino</span>
                              ) : null}
                              {f.notas > 0 ? (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={`${f.notas} nota(s) de RRHH`}>
                                  <MessageSquareText className="size-3" aria-hidden />
                                  {f.notas}
                                </span>
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap tabular-nums">
                            {f.horario.length
                              ? f.horario.map((t) => (
                                  <span key={t.inicioMin} className="block">
                                    {hora(t.inicioMin)}-{hora(t.finMin)}
                                  </span>
                                ))
                              : "—"}
                            <span className="block text-muted-foreground">{NOMBRE_FUENTE[f.fuente]}</span>
                          </TableCell>
                          <TableCell>
                            <Link href={enlace} aria-label={`Ver el día de ${p.codigo}`} className="block">
                              <BarraDia tramos={d.tramos} horario={f.horario} escala={escala} ahoraMin={datos.ahoraMin} etiqueta={p.codigo} />
                            </Link>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {d.entradaMin == null ? (
                              "—"
                            ) : (
                              <>
                                <span className="block">{hora(d.entradaMin)}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {d.conectadaAhora ? "conectada" : d.salidaMin == null ? "—" : hora(d.salidaMin)}
                                </span>
                              </>
                            )}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Celda min={d.tardeMin} alerta />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Celda min={d.sinConectarMin} alerta />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <Celda min={d.pausasAusenciaMin} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </FilasOrdenables>
                  <TableRow data-sin-resultados hidden>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                      Nadie con ese nombre este día.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TablaOrdenable>
          )}
          {datos.sinPlan && (grupo == null || grupo === "gh") ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Este mes no tiene plan publicado en Planificación: las personas de la plantilla salen con su horario de RRHH.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
