import { addDays, differenceInCalendarDays, format, parseISO, startOfISOWeek } from "date-fns";
import { z } from "zod";
import { coincideLike } from "@/lib/planificacion/motor/campanias";
import type { BaseResultados, FilaBaseResultados } from "@/lib/rdb/types";
import { esUsuarioDelCliente } from "@/lib/ratios-exito";

// ============================================================
// Resultados de actividad (regla 18, decidido 13/10/2026 con Christian).
// Lógica PURA: sin I/O. Recibe la base de queries/resultados-actividad.ts.
//
// - Finalizado = contacto CERRADO (activity.status = 3) que tipificó un
//   agente, fechado por su cierre y asignado al agente de su última
//   sesión. Los cerrados sin tocar y los cierres administrativos (listas
//   cerradas en bloque) se enseñan aparte, nunca en los ratios.
// - Aprovechamiento (bruto, «ratio bruto» hasta el 21/10/2026) = éxitos ÷
//   finalizados. Con él (21/10/2026): finalizados por éxito (su inversa),
//   llamadas por éxito (intentos de salida a cada contacto de éxito en los 90
//   días anteriores a su cierre, de media) y finalizados por hora (hora
//   logada en lo agrupado; con el script abierto por campaña). Son la familia
//   «resultados» (contactos cerrados): no se mezclan con la de «actividad»
//   (sesiones y llamadas, lib/ratios-exito.ts), que va por la fecha de la
//   llamada.
// - Ratio neto  = éxitos ÷ (finalizados − no válidos). Qué es «no válido»
//   lo decide cada servicio en /admin/resultados; en los servicios sin
//   configurar no hay neto, y en los totales mixtos el neto (y el % de no
//   válidos) se calcula SOLO sobre los configurados.
// GH, septiembre 2026: 8.695 finalizados, 2.597 éxitos, 2.973 «No valido».
// ============================================================

/** Por debajo de estos finalizados los ratios salen en gris («muestra pequeña»). */
export const MIN_FINALIZADOS = 30;

/** Diferencia (puntos porcentuales) con el resto de la campaña que marca a un agente. */
export const UMBRAL_DESVIACION_PP = 10;

/** Margen relativo del ámbar del semáforo: hasta un 10 % del objetivo. */
export const MARGEN_SEMAFORO = 0.1;

/** A partir de estos días la evolución se agrupa por semanas. */
export const DIAS_SERIE_SEMANAL = 62;

/** Columnas (niveles del desglose) que se pueden configurar por servicio. */
export const MAX_NIVELES = 3;

export const SIN_VALOR = "(sin valor)";

export type ColorSemaforo = "verde" | "ambar" | "rojo";

/** Objetivo de un servicio o una campaña (tabla objetivos_resultados). */
export interface ObjetivoResultados {
  campaignShortname: string | null;
  serviceName: string | null;
  brutoMin: number | null;
  netoMin: number | null;
  maxPctNoValidos: number | null;
  desde: string;
  hasta: string | null;
}

export interface Semaforos {
  bruto: ColorSemaforo | null;
  neto: ColorSemaforo | null;
  noValidos: ColorSemaforo | null;
}

export interface RatiosResultado {
  finalizados: number;
  exitos: number;
  noValidos: number;
  /** Finalizados de servicios configurados: base del neto y del % de no válidos. */
  finalizadosConfigurados: number;
  /** Aprovechamiento (bruto) = éxitos ÷ finalizados. */
  brutoPct: number | null;
  /** Finalizados ÷ éxitos: cuántos cierres cuesta un éxito. */
  finalizadosPorExito: number | null;
  /** Llamadas de media a cada contacto de éxito (de los que tienen alguna). */
  llamadasPorExito: number | null;
  /** Horas del período: logadas (agente, total) o con script abierto (campaña). */
  horas: number | null;
  /** Horas logadas (agente y total; por campaña no existen, regla 11). */
  horasLogadas: number | null;
  /** Horas con la ficha del guion abierta (en el agente, de todas sus campañas). */
  horasGuion: number | null;
  finalizadosHora: number | null;
  netoPct: number | null;
  noValidosPct: number | null;
  muestraPequenia: boolean;
  objetivo: ObjetivoResultados | null;
  semaforo: Semaforos;
}

export interface RatiosAgenteCampaniaRes extends RatiosResultado {
  campania: string;
  servicio: string | null;
}

export interface RatiosAgenteRes extends RatiosResultado {
  agente: string;
  nombre: string;
  /** Sus horas logadas cuentan en el total (usuario del cliente, por su prefijo). */
  cuentaEnHoras: boolean;
  campanias: RatiosAgenteCampaniaRes[];
}

/** Contactos cerrados que NO entran en los ratios. */
export interface FueraDeRatios {
  cerrados: number;
  sinTocar: number;
  administrativos: number;
}

export interface RatiosCampaniaRes extends RatiosResultado, FueraDeRatios {
  campania: string;
  servicio: string | null;
  configurado: boolean;
}

export interface NodoDesglose {
  codigo: number | null;
  nombre: string;
  contactos: number;
  exitos: number;
  noValidos: number;
  /** % sobre los finalizados del ámbito (servicio o campaña). */
  pct: number | null;
  hijos: NodoDesglose[];
}

export interface DesgloseAmbito {
  /** "svc:<servicio>" o "camp:<campaña>" */
  clave: string;
  etiqueta: string;
  servicio: string;
  niveles: string[];
  finalizados: number;
  nodos: NodoDesglose[];
}

export interface ComparacionAgente {
  agente: string;
  nombre: string;
  campania: string;
  finalizados: number;
  noValidosPct: number | null;
  noValidosRestoPct: number | null;
  difNoValidosPp: number | null;
  brutoPct: number | null;
  brutoRestoPct: number | null;
  difBrutoPp: number | null;
  /** El valor del primer nivel en el que el agente más se separa del resto. */
  resultadoDesviado: { nombre: string; pct: number; restoPct: number; difPp: number } | null;
  marcado: boolean;
}

export interface PuntoSerie {
  /** Día, o lunes de la semana ISO (YYYY-MM-DD). */
  periodo: string;
  finalizados: number;
  exitos: number;
  noValidos: number;
  brutoPct: number | null;
  netoPct: number | null;
  noValidosPct: number | null;
}

export interface ResultadoResultados {
  total: RatiosResultado & FueraDeRatios;
  agentes: RatiosAgenteRes[];
  campanias: RatiosCampaniaRes[];
  desgloses: DesgloseAmbito[];
  comparaciones: ComparacionAgente[];
  serie: { granularidad: "dia" | "semana"; puntos: PuntoSerie[] };
  /** Servicios del alcance con contactos cerrados y sin resultados configurados. */
  serviciosSinConfigurar: string[];
  /**
   * Valores del campo del contacto del cliente (si tiene uno configurado) con
   * sus finalizados en el período, ANTES de aplicar el filtro: son las
   * sugerencias del autocompletado. null sin campo configurado.
   */
  valoresCampo: ValorCampo[] | null;
}

// ------------------------------------------------------------
// Tipos de campaña (14/10/2026): cada cliente puede agrupar sus campañas
// por tipo con patrones LIKE (GH: «BBDD» = gh_bbdd_%) y el panel deja ver
// todas, solo un tipo o el resto. Se filtra la lista de campañas ANTES de
// consultar, así que no cambia ningún cálculo.
// ------------------------------------------------------------

export interface TipoCampania {
  nombre: string;
  /** Patrones LIKE de shortname (% cualquier texto, _ un carácter). */
  patrones: string[];
}

export const esquemaTiposCampania = z
  .array(
    z.object({
      nombre: z.string().trim().min(1).max(30),
      patrones: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
    }),
  )
  .max(10)
  .refine((l) => new Set(l.map((t) => t.nombre.toLowerCase())).size === l.length, {
    message: "Dos tipos con el mismo nombre",
  });

/**
 * Texto del admin («BBDD: gh[_]bbdd[_]%, otro%», uno por línea) → tipos.
 * null si alguna línea no tiene la forma «nombre: patrones».
 */
export function leerTiposCampania(texto: string): TipoCampania[] | null {
  const tipos: TipoCampania[] = [];
  for (const linea of texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
    const i = linea.indexOf(":");
    if (i <= 0) return null;
    const patrones = linea
      .slice(i + 1)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    tipos.push({ nombre: linea.slice(0, i).trim(), patrones });
  }
  const r = esquemaTiposCampania.safeParse(tipos);
  return r.success ? r.data : null;
}

export function escribirTiposCampania(tipos: TipoCampania[]): string {
  return tipos.map((t) => `${t.nombre}: ${t.patrones.join(", ")}`).join("\n");
}

/** Tipo de una campaña (el primero que casa) o null si no es de ninguno. */
export function tipoDeCampania(campania: string, tipos: TipoCampania[]): string | null {
  return tipos.find((t) => t.patrones.some((p) => coincideLike(campania, p)))?.nombre ?? null;
}

/**
 * Reparte filas de campaña por tipo, en el orden configurado y con «Resto»
 * (de ningún tipo) al final; sin tipos, un solo grupo sin nombre. Los grupos
 * sin filas no salen. Lo usan los detalles por campaña de Dirección y de
 * Supervisión (Bolsas: cartera y resto; GH: BBDD y resto).
 */
export function agruparPorTipoCampania<T extends { campania: string }>(
  filas: T[],
  tipos: TipoCampania[],
): { nombre: string | null; filas: T[] }[] {
  if (tipos.length === 0) return [{ nombre: null, filas }];
  const porTipo = new Map<string, T[]>();
  for (const f of filas) {
    const t = tipoDeCampania(f.campania, tipos) ?? "";
    porTipo.set(t, [...(porTipo.get(t) ?? []), f]);
  }
  return [...tipos.map((t) => t.nombre), ""]
    .filter((n) => (porTipo.get(n)?.length ?? 0) > 0)
    .map((n) => ({ nombre: n || "Resto", filas: porTipo.get(n)! }));
}

/** Opciones del selector: «todas», «solo:<tipo>» o «resto» (de ningún tipo). */
export type SeleccionTipo = "todas" | "resto" | `solo:${string}`;

export function opcionesTipo(tipos: TipoCampania[]): { valor: SeleccionTipo; etiqueta: string }[] {
  if (tipos.length === 0) return [];
  return [
    { valor: "todas", etiqueta: "Todas" },
    // Con un solo tipo se lee mejor «Sin BBDD» que «Resto»
    { valor: "resto", etiqueta: tipos.length === 1 ? `Sin ${tipos[0].nombre}` : "Resto" },
    ...tipos.map((t) => ({ valor: `solo:${t.nombre}` as SeleccionTipo, etiqueta: `Solo ${t.nombre}` })),
  ];
}

/** Valor de la URL → selección válida para estos tipos («todas» si no lo es). */
export function seleccionTipo(valor: string | undefined, tipos: TipoCampania[]): SeleccionTipo {
  return opcionesTipo(tipos).find((o) => o.valor === valor)?.valor ?? "todas";
}

export function filtrarPorTipo(
  campanias: string[],
  tipos: TipoCampania[],
  seleccion: SeleccionTipo,
): string[] {
  if (seleccion === "todas" || tipos.length === 0) return campanias;
  if (seleccion === "resto") return campanias.filter((c) => tipoDeCampania(c, tipos) == null);
  const nombre = seleccion.slice("solo:".length);
  return campanias.filter((c) => tipoDeCampania(c, tipos) === nombre);
}

// ------------------------------------------------------------
// Filtro por un campo del contacto (19/10/2026, pedido por Christian: GH
// por el origen del lead, dir_fdlt_origen). El campo es una columna de texto
// del directorio del cliente (tabla dir_* de table_schema, ts_type 4,
// ligada por activity.contact_profile = easycode); se elige por cliente en
// /admin/resultados. GH tiene 483 orígenes distintos (95 en septiembre de
// 2026) y muchos son códigos de campaña de marketing
// («HUE1298_GRANADA_MARCA_VO_…»), así que se busca por «contiene», no por
// «empieza por», y además de un valor exacto se puede filtrar por todos los
// que contienen un texto (todos los de GRANADA, todos los de LEXUS…).
// ------------------------------------------------------------

/** Identificador de SQL Server seguro para ir entre corchetes. */
export const PATRON_IDENTIFICADOR_SQL = /^[A-Za-z0-9_]+$/;

export interface CampoContacto {
  /** Tabla del directorio (dir_*), de la lista blanca de camposContacto(). */
  tabla: string;
  columna: string;
  /** Cómo se llama en pantalla («Origen»). */
  etiqueta: string;
}

export const esquemaCampoContacto = z.object({
  tabla: z.string().regex(PATRON_IDENTIFICADOR_SQL).max(128),
  columna: z.string().regex(PATRON_IDENTIFICADOR_SQL).max(128),
  etiqueta: z.string().trim().min(1).max(40),
});

export type ModoFiltroCampo = "exacto" | "contiene" | "vacio";

export interface FiltroCampo {
  modo: ModoFiltroCampo;
  /** Texto buscado ('' con modo «vacio»). */
  valor: string;
}

export interface ValorCampo {
  /** null = contactos sin valor en el campo. */
  valor: string | null;
  finalizados: number;
}

/** Tope de valores distintos que se mandan al navegador para sugerir. */
export const MAX_VALORES_CAMPO = 2000;

/** Parámetros de la URL (`campo`, `modo`) → filtro; null si no hay filtro. */
export function leerFiltroCampo(valor: string | undefined, modo: string | undefined): FiltroCampo | null {
  if (modo === "vacio") return { modo: "vacio", valor: "" };
  const texto = (valor ?? "").trim().slice(0, 200);
  if (!texto) return null;
  return { modo: modo === "contiene" ? "contiene" : "exacto", valor: texto };
}

/**
 * Patrón LIKE de «contiene»: los comodines del texto (% _ [) van como
 * literales entre corchetes. Se pasa como PARÁMETRO, nunca concatenado.
 */
export function patronContiene(texto: string): string {
  return `%${texto.replace(/[%_[]/g, (c) => `[${c}]`)}%`;
}

/**
 * Texto para comparar sin mayúsculas ni tildes y con los espacios
 * normalizados, como la intercalación de RDBv2 (SQL_Latin1_General_CP1_CI_AI).
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Valores que contienen el texto, de más a menos finalizados (como mucho `max`). */
export function sugerenciasCampo(valores: ValorCampo[], texto: string, max = 50): ValorCampo[] {
  const buscado = normalizarBusqueda(texto);
  return valores
    .filter((v) => v.valor != null && (!buscado || normalizarBusqueda(v.valor).includes(buscado)))
    .sort((a, b) => b.finalizados - a.finalizados || a.valor!.localeCompare(b.valor!))
    .slice(0, max);
}

/** Finalizados que se quedarían con un filtro (para el texto de la opción). */
export function finalizadosConFiltro(valores: ValorCampo[], filtro: FiltroCampo): number {
  const buscado = normalizarBusqueda(filtro.valor);
  return valores
    .filter((v) => {
      if (filtro.modo === "vacio") return v.valor == null;
      if (v.valor == null) return false;
      const n = normalizarBusqueda(v.valor);
      return filtro.modo === "contiene" ? n.includes(buscado) : n === buscado;
    })
    .reduce((s, v) => s + v.finalizados, 0);
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

/** Suma de los valores que hay; null si no hay ninguno. */
function sumaONull(valores: (number | null)[]): number | null {
  const hay = valores.filter((x): x is number => x != null);
  return hay.length > 0 ? hay.reduce((s, x) => s + x, 0) : null;
}

/** Redondeo del valor FINAL (2 decimales); los parciales se suman sin redondear. */
function r2(valor: number | null): number | null {
  return valor == null ? null : Math.round(valor * 100) / 100;
}

function cociente(numerador: number, denominador: number, factor = 1): number | null {
  return denominador > 0 ? (numerador / denominador) * factor : null;
}

/** Semáforo de un ratio con objetivo MÍNIMO (bruto, neto). */
export function colorMinimo(valor: number | null, objetivo: number | null): ColorSemaforo | null {
  if (valor == null || objetivo == null) return null;
  if (valor >= objetivo) return "verde";
  if (valor >= objetivo * (1 - MARGEN_SEMAFORO)) return "ambar";
  return "rojo";
}

/** Semáforo de un ratio con objetivo MÁXIMO (% de no válidos). */
export function colorMaximo(valor: number | null, objetivo: number | null): ColorSemaforo | null {
  if (valor == null || objetivo == null) return null;
  if (valor <= objetivo) return "verde";
  if (valor <= objetivo * (1 + MARGEN_SEMAFORO)) return "ambar";
  return "rojo";
}

/**
 * Objetivo de una campaña para un período: el de la campaña si lo hay; si
 * no, el de su servicio. Vale si su vigencia se solapa con el período; con
 * varios, el que empieza más tarde.
 */
export function objetivoDe(
  objetivos: ObjetivoResultados[],
  campania: string,
  servicio: string | null,
  desde: string,
  hasta: string,
): ObjetivoResultados | null {
  const vigentes = objetivos.filter((o) => o.desde <= hasta && (o.hasta == null || o.hasta >= desde));
  const masReciente = (lista: ObjetivoResultados[]) =>
    [...lista].sort((a, b) => b.desde.localeCompare(a.desde))[0] ?? null;
  return (
    masReciente(vigentes.filter((o) => o.campaignShortname === campania)) ??
    (servicio
      ? masReciente(vigentes.filter((o) => !o.campaignShortname && o.serviceName === servicio))
      : null)
  );
}

/** El objetivo si todas las campañas comparten el mismo; si no, ninguno. */
function objetivoComun(lista: (ObjetivoResultados | null)[]): ObjetivoResultados | null {
  if (lista.length === 0) return null;
  const primero = lista[0];
  return primero && lista.every((o) => o === primero) ? primero : null;
}

interface Acumulado {
  finalizados: number;
  exitos: number;
  finalizadosConf: number;
  exitosConf: number;
  noValidos: number;
  llamadasExitos: number;
  exitosConLlamadas: number;
}

function vacio(): Acumulado {
  return {
    finalizados: 0,
    exitos: 0,
    finalizadosConf: 0,
    exitosConf: 0,
    noValidos: 0,
    llamadasExitos: 0,
    exitosConLlamadas: 0,
  };
}

/** Suma una fila TIPIFICADA (las demás no entran en los ratios). */
function acumular(a: Acumulado, f: FilaBaseResultados, configurado: boolean): void {
  a.finalizados += f.contactos;
  a.exitos += f.exitos;
  a.llamadasExitos += f.llamadasExitos;
  a.exitosConLlamadas += f.exitosConLlamadas;
  if (configurado) {
    a.finalizadosConf += f.contactos;
    a.exitosConf += f.exitos;
    a.noValidos += f.noValidos;
  }
}

function ratios(
  a: Acumulado,
  objetivo: ObjetivoResultados | null,
  horas: number | null = null,
  horasLogadas: number | null = null,
  horasGuion: number | null = null,
): RatiosResultado {
  const brutoPct = r2(cociente(a.exitos, a.finalizados, 100));
  const netoPct = r2(cociente(a.exitosConf, a.finalizadosConf - a.noValidos, 100));
  const noValidosPct = r2(cociente(a.noValidos, a.finalizadosConf, 100));
  const muestraPequenia = a.finalizados < MIN_FINALIZADOS;
  // Con muestra pequeña no se colorea: un 0 % de 3 contactos no es un rojo
  const o = muestraPequenia ? null : objetivo;
  return {
    finalizados: a.finalizados,
    exitos: a.exitos,
    noValidos: a.noValidos,
    finalizadosConfigurados: a.finalizadosConf,
    brutoPct,
    finalizadosPorExito: r2(cociente(a.finalizados, a.exitos)),
    llamadasPorExito: r2(cociente(a.llamadasExitos, a.exitosConLlamadas)),
    horas: r2(horas),
    horasLogadas: r2(horasLogadas),
    horasGuion: r2(horasGuion),
    finalizadosHora: horas != null ? r2(cociente(a.finalizados, horas)) : null,
    netoPct,
    noValidosPct,
    muestraPequenia,
    objetivo,
    semaforo: {
      bruto: colorMinimo(brutoPct, o?.brutoMin ?? null),
      neto: colorMinimo(netoPct, o?.netoMin ?? null),
      noValidos: colorMaximo(noValidosPct, o?.maxPctNoValidos ?? null),
    },
  };
}

function fuera(): FueraDeRatios {
  return { cerrados: 0, sinTocar: 0, administrativos: 0 };
}

function sumarFuera(fr: FueraDeRatios, f: FilaBaseResultados): void {
  fr.cerrados += f.contactos;
  if (f.categoria === "sinTocar") fr.sinTocar += f.contactos;
  if (f.categoria === "administrativo") fr.administrativos += f.contactos;
}

// ------------------------------------------------------------
// Desglose resultado → subresultado
// ------------------------------------------------------------

interface NodoTmp {
  codigo: number | null;
  contactos: number;
  exitos: number;
  noValidos: number;
  hijos: Map<number | null, NodoTmp>;
}

function nodoTmp(codigo: number | null): NodoTmp {
  return { codigo, contactos: 0, exitos: 0, noValidos: 0, hijos: new Map() };
}

function insertar(raiz: Map<number | null, NodoTmp>, f: FilaBaseResultados, niveles: number): void {
  let nivel = raiz;
  for (let i = 0; i < niveles; i++) {
    const codigo = f.codigos[i] ?? null;
    // Sin valor en un nivel inferior, el contacto se queda en el de arriba
    if (codigo == null && i > 0) break;
    const n = nivel.get(codigo) ?? nodoTmp(codigo);
    n.contactos += f.contactos;
    n.exitos += f.exitos;
    n.noValidos += f.noValidos;
    nivel.set(codigo, n);
    nivel = n.hijos;
  }
}

function cerrarNodos(
  mapa: Map<number | null, NodoTmp>,
  textos: Record<number, string>,
  total: number,
): NodoDesglose[] {
  return [...mapa.values()]
    .map((n) => {
      const hijos = cerrarNodos(n.hijos, textos, total);
      // Si unos hijos tienen valor y otros no, el resto va a «(sin valor)»
      const enHijos = hijos.reduce((s, h) => s + h.contactos, 0);
      if (hijos.length > 0 && enHijos < n.contactos) {
        const ex = n.exitos - hijos.reduce((s, h) => s + h.exitos, 0);
        const nv = n.noValidos - hijos.reduce((s, h) => s + h.noValidos, 0);
        hijos.push({
          codigo: null,
          nombre: SIN_VALOR,
          contactos: n.contactos - enHijos,
          exitos: ex,
          noValidos: nv,
          pct: r2(cociente(n.contactos - enHijos, total, 100)),
          hijos: [],
        });
      }
      return {
        codigo: n.codigo,
        nombre: n.codigo == null ? SIN_VALOR : (textos[n.codigo] ?? `#${n.codigo}`),
        contactos: n.contactos,
        exitos: n.exitos,
        noValidos: n.noValidos,
        pct: r2(cociente(n.contactos, total, 100)),
        hijos,
      };
    })
    .sort((a, b) => b.contactos - a.contactos || a.nombre.localeCompare(b.nombre));
}

function desglosar(
  clave: string,
  etiqueta: string,
  servicio: string,
  niveles: string[],
  filas: FilaBaseResultados[],
  textos: Record<number, string>,
): DesgloseAmbito {
  const raiz = new Map<number | null, NodoTmp>();
  let finalizados = 0;
  for (const f of filas) {
    finalizados += f.contactos;
    insertar(raiz, f, niveles.length);
  }
  return { clave, etiqueta, servicio, niveles, finalizados, nodos: cerrarNodos(raiz, textos, finalizados) };
}

// ------------------------------------------------------------
// Agente frente al resto de su campaña
// ------------------------------------------------------------

function comparar(
  agente: string,
  nombre: string,
  campania: string,
  delAgente: FilaBaseResultados[],
  delResto: FilaBaseResultados[],
  configurado: boolean,
  textos: Record<number, string>,
): ComparacionAgente | null {
  const suma = (l: FilaBaseResultados[], k: "contactos" | "exitos" | "noValidos") =>
    l.reduce((s, f) => s + f[k], 0);
  const fa = suma(delAgente, "contactos");
  const fr = suma(delResto, "contactos");
  if (fa < MIN_FINALIZADOS || fr < MIN_FINALIZADOS) return null;

  const brutoA = cociente(suma(delAgente, "exitos"), fa, 100)!;
  const brutoR = cociente(suma(delResto, "exitos"), fr, 100)!;
  const nvA = configurado ? cociente(suma(delAgente, "noValidos"), fa, 100) : null;
  const nvR = configurado ? cociente(suma(delResto, "noValidos"), fr, 100) : null;

  // Primer nivel: el valor con la mayor diferencia absoluta
  let desviado: ComparacionAgente["resultadoDesviado"] = null;
  if (configurado) {
    const porCodigo = (l: FilaBaseResultados[]) => {
      const m = new Map<number | null, number>();
      for (const f of l) m.set(f.codigos[0] ?? null, (m.get(f.codigos[0] ?? null) ?? 0) + f.contactos);
      return m;
    };
    const ma = porCodigo(delAgente);
    const mr = porCodigo(delResto);
    for (const codigo of new Set([...ma.keys(), ...mr.keys()])) {
      const pa = ((ma.get(codigo) ?? 0) / fa) * 100;
      const pr = ((mr.get(codigo) ?? 0) / fr) * 100;
      if (!desviado || Math.abs(pa - pr) > Math.abs(desviado.difPp)) {
        desviado = {
          nombre: codigo == null ? SIN_VALOR : (textos[codigo] ?? `#${codigo}`),
          pct: pa,
          restoPct: pr,
          difPp: pa - pr,
        };
      }
    }
  }
  const difNv = nvA != null && nvR != null ? nvA - nvR : null;
  return {
    agente,
    nombre,
    campania,
    finalizados: fa,
    noValidosPct: r2(nvA),
    noValidosRestoPct: r2(nvR),
    difNoValidosPp: r2(difNv),
    brutoPct: r2(brutoA),
    brutoRestoPct: r2(brutoR),
    difBrutoPp: r2(brutoA - brutoR),
    resultadoDesviado: desviado
      ? {
          nombre: desviado.nombre,
          pct: r2(desviado.pct)!,
          restoPct: r2(desviado.restoPct)!,
          difPp: r2(desviado.difPp)!,
        }
      : null,
    // La tipificación es lo que se vigila: no válidos o un resultado concreto
    marcado:
      Math.abs(difNv ?? 0) >= UMBRAL_DESVIACION_PP ||
      Math.abs(desviado?.difPp ?? 0) >= UMBRAL_DESVIACION_PP,
  };
}

// ------------------------------------------------------------
// Evolución
// ------------------------------------------------------------

function serie(
  tipificadas: FilaBaseResultados[],
  configurados: Set<string>,
  servicioDe: (c: string) => string | null,
  desde: string,
  hasta: string,
): ResultadoResultados["serie"] {
  const semanal = differenceInCalendarDays(parseISO(hasta), parseISO(desde)) + 1 > DIAS_SERIE_SEMANAL;
  const periodoDe = (fecha: string) =>
    semanal ? format(startOfISOWeek(parseISO(fecha)), "yyyy-MM-dd") : fecha;

  // Todos los períodos del rango, también los vacíos (la gráfica no salta días)
  const acum = new Map<string, Acumulado>();
  const fin = parseISO(hasta);
  for (let d = parseISO(periodoDe(desde)); d <= fin; d = addDays(d, semanal ? 7 : 1)) {
    acum.set(format(d, "yyyy-MM-dd"), vacio());
  }
  for (const f of tipificadas) {
    const a = acum.get(periodoDe(f.fecha));
    if (!a) continue;
    const s = servicioDe(f.campania);
    acumular(a, f, s != null && configurados.has(s));
  }
  return {
    granularidad: semanal ? "semana" : "dia",
    puntos: [...acum].map(([periodo, a]) => {
      const r = ratios(a, null);
      return {
        periodo,
        finalizados: r.finalizados,
        exitos: r.exitos,
        noValidos: r.noValidos,
        brutoPct: r.brutoPct,
        netoPct: r.netoPct,
        noValidosPct: r.noValidosPct,
      };
    }),
  };
}

// ------------------------------------------------------------
// Cálculo principal
// ------------------------------------------------------------

export function calcularResultados(
  base: BaseResultados,
  objetivos: ObjetivoResultados[],
  desde: string,
  hasta: string,
  /** Prefijo de los usuarios del cliente (GH…): solo sus horas van al total. */
  prefijo: string | null = null,
): ResultadoResultados {
  const configurados = new Set(base.serviciosConfigurados);
  const servicioDe = (c: string) => base.servicioDeCampania[c] ?? null;
  const esConfigurada = (c: string) => {
    const s = servicioDe(c);
    return s != null && configurados.has(s);
  };
  const objetivoCampania = new Map<string, ObjetivoResultados | null>();
  const objetivoDeCampania = (c: string) => {
    if (!objetivoCampania.has(c)) {
      objetivoCampania.set(c, objetivoDe(objetivos, c, servicioDe(c), desde, hasta));
    }
    return objetivoCampania.get(c)!;
  };

  const tipificadas = base.filas.filter((f) => f.categoria === "tipificado" && f.agente != null);
  // Horas de «finalizados por hora»: null si no llegaron o el agente no tiene
  const h = base.horas;
  const horasLogadas = (agente: string) => h?.logadas[agente] ?? null;
  const horasGuion = (campania: string, agente?: string) =>
    h ? ((agente ? h.guionAgenteCampania[`${agente}|${campania}`] : h.guionCampania[campania]) ?? null) : null;

  // 1) Campañas (con los cerrados que no entran en los ratios)
  const porCampania = new Map<string, { a: Acumulado; fr: FueraDeRatios }>();
  const total = vacio();
  const frTotal = fuera();
  for (const f of base.filas) {
    const c = porCampania.get(f.campania) ?? { a: vacio(), fr: fuera() };
    sumarFuera(c.fr, f);
    sumarFuera(frTotal, f);
    if (f.categoria === "tipificado" && f.agente != null) {
      acumular(c.a, f, esConfigurada(f.campania));
      acumular(total, f, esConfigurada(f.campania));
    }
    porCampania.set(f.campania, c);
  }
  const campanias: RatiosCampaniaRes[] = [...porCampania]
    .map(([campania, { a, fr }]) => ({
      campania,
      servicio: servicioDe(campania),
      configurado: esConfigurada(campania),
      ...ratios(a, objetivoDeCampania(campania), horasGuion(campania), null, horasGuion(campania)),
      ...fr,
    }))
    .sort((x, y) => y.finalizados - x.finalizados || x.campania.localeCompare(y.campania));

  // 2) Agentes con su detalle por campaña
  const porAgente = new Map<string, FilaBaseResultados[]>();
  for (const f of tipificadas) {
    const l = porAgente.get(f.agente!) ?? [];
    l.push(f);
    porAgente.set(f.agente!, l);
  }
  const agentes: RatiosAgenteRes[] = [...porAgente].map(([agente, filas]) => {
    const acum = vacio();
    const porCamp = new Map<string, Acumulado>();
    for (const f of filas) {
      const conf = esConfigurada(f.campania);
      acumular(acum, f, conf);
      const a = porCamp.get(f.campania) ?? vacio();
      acumular(a, f, conf);
      porCamp.set(f.campania, a);
    }
    const campsAgente = [...porCamp.keys()];
    // Ficha abierta del agente: la suma de sus campañas con finalizados
    const guiones = campsAgente.map((c) => horasGuion(c, agente)).filter((x): x is number => x != null);
    const guionAgente = guiones.length > 0 ? guiones.reduce((s, x) => s + x, 0) : null;
    return {
      agente,
      nombre: filas.find((f) => f.nombre)?.nombre ?? agente,
      cuentaEnHoras: esUsuarioDelCliente(agente, prefijo),
      ...ratios(acum, objetivoComun(campsAgente.map(objetivoDeCampania)), horasLogadas(agente), horasLogadas(agente), guionAgente),
      campanias: [...porCamp]
        .map(([campania, a]) => ({
          campania,
          servicio: servicioDe(campania),
          ...ratios(a, objetivoDeCampania(campania), horasGuion(campania, agente), null, horasGuion(campania, agente)),
        }))
        .sort((x, y) => y.finalizados - x.finalizados || x.campania.localeCompare(y.campania)),
    };
  });
  // Agentes que trabajaron en las campañas del alcance sin cerrar ningún
  // contacto (23/10/2026): salen con sus horas y 0 finalizados. Con prefijo,
  // solo los usuarios del cliente
  for (const [agente, nombre] of Object.entries(h?.activos ?? {})) {
    if (porAgente.has(agente) || !esUsuarioDelCliente(agente, prefijo)) continue;
    const logadas = horasLogadas(agente);
    if (logadas == null) continue;
    const guiones = Object.entries(h!.guionAgenteCampania)
      .filter(([clave]) => clave.startsWith(`${agente}|`))
      .map(([, v]) => v);
    agentes.push({
      agente,
      nombre,
      cuentaEnHoras: true,
      ...ratios(vacio(), null, logadas, logadas, sumaONull(guiones)),
      campanias: [],
    });
  }
  agentes.sort((a, b) => {
    if (a.muestraPequenia !== b.muestraPequenia) return a.muestraPequenia ? 1 : -1;
    return b.finalizados - a.finalizados || a.nombre.localeCompare(b.nombre);
  });

  // 3) Desgloses: por servicio configurado y por cada campaña suya
  const desgloses: DesgloseAmbito[] = [];
  const porServicio = new Map<string, FilaBaseResultados[]>();
  for (const f of tipificadas) {
    if (!esConfigurada(f.campania)) continue;
    const s = servicioDe(f.campania)!;
    const l = porServicio.get(s) ?? [];
    l.push(f);
    porServicio.set(s, l);
  }
  for (const [servicio, filas] of [...porServicio].sort((a, b) => a[0].localeCompare(b[0]))) {
    const niveles = base.niveles[servicio] ?? [];
    if (niveles.length === 0) continue;
    desgloses.push(
      desglosar(`svc:${servicio}`, `${servicio} (todas sus campañas)`, servicio, niveles, filas, base.textos),
    );
    const camps = new Map<string, FilaBaseResultados[]>();
    for (const f of filas) {
      const l = camps.get(f.campania) ?? [];
      l.push(f);
      camps.set(f.campania, l);
    }
    for (const [campania, fc] of [...camps].sort((a, b) => a[0].localeCompare(b[0]))) {
      desgloses.push(desglosar(`camp:${campania}`, campania, servicio, niveles, fc, base.textos));
    }
  }

  // 4) Cada agente frente al resto de su campaña
  const comparaciones: ComparacionAgente[] = [];
  const filasPorCampania = new Map<string, FilaBaseResultados[]>();
  for (const f of tipificadas) {
    const l = filasPorCampania.get(f.campania) ?? [];
    l.push(f);
    filasPorCampania.set(f.campania, l);
  }
  for (const [campania, filas] of filasPorCampania) {
    const agentesCamp = new Set(filas.map((f) => f.agente!));
    for (const agente of agentesCamp) {
      const delAgente = filas.filter((f) => f.agente === agente);
      const c = comparar(
        agente,
        delAgente.find((f) => f.nombre)?.nombre ?? agente,
        campania,
        delAgente,
        filas.filter((f) => f.agente !== agente),
        esConfigurada(campania),
        base.textos,
      );
      if (c) comparaciones.push(c);
    }
  }
  comparaciones.sort((a, b) => {
    if (a.marcado !== b.marcado) return a.marcado ? -1 : 1;
    const da = Math.max(Math.abs(a.difNoValidosPp ?? 0), Math.abs(a.resultadoDesviado?.difPp ?? 0));
    const db = Math.max(Math.abs(b.difNoValidosPp ?? 0), Math.abs(b.resultadoDesviado?.difPp ?? 0));
    return db - da || a.campania.localeCompare(b.campania) || a.nombre.localeCompare(b.nombre);
  });

  const conCerrados = [...porCampania.keys()];
  const serviciosSinConfigurar = [
    ...new Set(conCerrados.map(servicioDe).filter((s): s is string => s != null && !configurados.has(s))),
  ].sort();

  // Horas del total: las logadas de los agentes con finalizados
  // Horas del total: las de los agentes de la tabla que son del cliente
  const horasTotal = sumaONull(agentes.filter((a) => a.cuentaEnHoras).map((a) => horasLogadas(a.agente)));
  return {
    total: {
      ...ratios(
        total,
        objetivoComun(conCerrados.map(objetivoDeCampania)),
        horasTotal,
        horasTotal,
        sumaONull(conCerrados.map((c) => horasGuion(c))),
      ),
      ...frTotal,
    },
    agentes,
    campanias,
    desgloses,
    comparaciones,
    serie: serie(tipificadas, configurados, servicioDe, desde, hasta),
    serviciosSinConfigurar,
    valoresCampo: base.valoresCampo ?? null,
  };
}
