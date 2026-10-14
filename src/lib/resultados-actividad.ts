import { addDays, differenceInCalendarDays, format, parseISO, startOfISOWeek } from "date-fns";
import type { BaseResultados, FilaBaseResultados } from "@/lib/rdb/types";

// ============================================================
// Resultados de actividad (regla 18, decidido 13/10/2026 con Christian).
// Lógica PURA: sin I/O. Recibe la base de queries/resultados-actividad.ts.
//
// - Finalizado = contacto CERRADO (activity.status = 3) que tipificó un
//   agente, fechado por su cierre y asignado al agente de su última
//   sesión. Los cerrados sin tocar y los cierres administrativos (listas
//   cerradas en bloque) se enseñan aparte, nunca en los ratios.
// - Ratio bruto = éxitos ÷ finalizados.
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
  brutoPct: number | null;
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
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

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
}

function vacio(): Acumulado {
  return { finalizados: 0, exitos: 0, finalizadosConf: 0, exitosConf: 0, noValidos: 0 };
}

/** Suma una fila TIPIFICADA (las demás no entran en los ratios). */
function acumular(a: Acumulado, f: FilaBaseResultados, configurado: boolean): void {
  a.finalizados += f.contactos;
  a.exitos += f.exitos;
  if (configurado) {
    a.finalizadosConf += f.contactos;
    a.exitosConf += f.exitos;
    a.noValidos += f.noValidos;
  }
}

function ratios(a: Acumulado, objetivo: ObjetivoResultados | null): RatiosResultado {
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
      ...ratios(a, objetivoDeCampania(campania)),
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
    return {
      agente,
      nombre: filas.find((f) => f.nombre)?.nombre ?? agente,
      ...ratios(acum, objetivoComun(campsAgente.map(objetivoDeCampania))),
      campanias: [...porCamp]
        .map(([campania, a]) => ({
          campania,
          servicio: servicioDe(campania),
          ...ratios(a, objetivoDeCampania(campania)),
        }))
        .sort((x, y) => y.finalizados - x.finalizados || x.campania.localeCompare(y.campania)),
    };
  });
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

  return {
    total: {
      ...ratios(total, objetivoComun(conCerrados.map(objetivoDeCampania))),
      ...frTotal,
    },
    agentes,
    campanias,
    desgloses,
    comparaciones,
    serie: serie(tipificadas, configurados, servicioDe, desde, hasta),
    serviciosSinConfigurar,
  };
}
