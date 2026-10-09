import { normalizarTramos, parsearTramos, textoTramos } from "./motor/calendario";
import { esquemaParametrosCliente, type ParametrosCliente, type Tramo } from "./motor/tipos";

// ============================================================
// Formulario de los parámetros de un cliente de planificación
// (plan_clientes.parametros) en lenguaje sencillo, sin JSON: horas como en
// Patrones («11-14, 16-18»), números con coma y fechas. Ida y vuelta entre
// los campos de texto del formulario y el objeto del motor, más los textos
// de resumen y de auditoría. PURO (misma regla de ESLint que el motor): lo
// usan la página, la Server Action y los tests.
//
// Lo que se guarda es el mismo objeto de siempre, validado con
// esquemaParametrosCliente y sin las claves que valen lo de por defecto (como
// la semilla): el motor no cambia.
// ============================================================

/** Lo que vale un bloque preferido si no se dice otra cosa (la semilla usa 0,3). */
export const PESO_PREFERIDOS_POR_DEFECTO = 0.3;

const CURVAS = ["anio_anterior", "uniforme", "inicio"] as const;
export const TEXTO_CURVA: Record<(typeof CURVAS)[number], string> = {
  anio_anterior: "Como el mismo mes del año pasado",
  uniforme: "Igual todas las semanas",
  inicio: "Todo al principio (lista casi agotada)",
};

/** Los campos del formulario, todos como texto salvo la casilla de entrantes. */
export interface FormularioCliente {
  calendario: string;
  bloquesPreferidos: string;
  bloquesOtros: string;
  evitar: string;
  horasContratadas: string;
  inicioContrato: string;
  fechaFin: string;
  horasSemanaFijas: string;
  maxHorasDiaAgente: string;
  maxHorasSeguidas: string;
  maxBloquesDiaAgente: string;
  erlang: boolean;
  slaPct: string;
  umbralSeg: string;
  margen: string;
  ahtSeg: string;
  pctVivosObjetivo: string;
  ritmoManual: string;
  curva: string;
  campaniasSimilares: string;
  pesoPreferidos: string;
  pesoContacto: string;
  kDia: string;
}

/** Nombre del campo en el <form> (prefijo para no chocar con los del cliente). */
export const nombreCampo = (k: keyof FormularioCliente) => `p_${k}`;

/** Campos de texto (todos menos la casilla `erlang`), para leer el FormData. */
export const CAMPOS_TEXTO = [
  "calendario",
  "bloquesPreferidos",
  "bloquesOtros",
  "evitar",
  "horasContratadas",
  "inicioContrato",
  "fechaFin",
  "horasSemanaFijas",
  "maxHorasDiaAgente",
  "maxHorasSeguidas",
  "maxBloquesDiaAgente",
  "slaPct",
  "umbralSeg",
  "margen",
  "ahtSeg",
  "pctVivosObjetivo",
  "ritmoManual",
  "curva",
  "campaniasSimilares",
  "pesoPreferidos",
  "pesoContacto",
  "kDia",
] as const satisfies readonly Exclude<keyof FormularioCliente, "erlang">[];

/** Cómo se llama cada parámetro en pantalla (errores, resumen y auditoría). */
export const ETIQUETA_PARAMETRO: Record<keyof ParametrosCliente, string> = {
  calendario: "Calendario de atención",
  erlang: "Llamadas entrantes",
  bloques: "Bloques",
  evitar: "Nunca en",
  maxHorasDiaAgente: "Máximo de horas al día por persona",
  maxHorasSeguidas: "Máximo de horas seguidas",
  maxBloquesDiaAgente: "Máximo de bloques al día por persona",
  pctVivosObjetivo: "Parte de la lista que puede quedar sin terminar",
  ritmoManual: "Ritmo fijo",
  horasSemanaFijas: "Horas fijas por semana",
  fechaFin: "Último día de la campaña",
  horasContratadas: "Horas contratadas",
  inicioContrato: "Contrato desde",
  campaniasSimilares: "Campañas parecidas",
  curva: "Reparto entre semanas",
  pesoContacto: "Peso de las horas con más contacto",
  kDia: "Reparto entre días",
};

const ETIQUETA_CAMPO: Record<keyof FormularioCliente, string> = {
  calendario: ETIQUETA_PARAMETRO.calendario,
  bloquesPreferidos: "Bloques preferidos",
  bloquesOtros: "Otros bloques posibles",
  evitar: ETIQUETA_PARAMETRO.evitar,
  horasContratadas: ETIQUETA_PARAMETRO.horasContratadas,
  inicioContrato: ETIQUETA_PARAMETRO.inicioContrato,
  fechaFin: ETIQUETA_PARAMETRO.fechaFin,
  horasSemanaFijas: ETIQUETA_PARAMETRO.horasSemanaFijas,
  maxHorasDiaAgente: ETIQUETA_PARAMETRO.maxHorasDiaAgente,
  maxHorasSeguidas: ETIQUETA_PARAMETRO.maxHorasSeguidas,
  maxBloquesDiaAgente: ETIQUETA_PARAMETRO.maxBloquesDiaAgente,
  erlang: ETIQUETA_PARAMETRO.erlang,
  slaPct: "Nivel de servicio (%)",
  umbralSeg: "Segundos de espera",
  margen: "Personas de margen",
  ahtSeg: "Duración media de la llamada",
  pctVivosObjetivo: ETIQUETA_PARAMETRO.pctVivosObjetivo,
  ritmoManual: ETIQUETA_PARAMETRO.ritmoManual,
  curva: ETIQUETA_PARAMETRO.curva,
  campaniasSimilares: ETIQUETA_PARAMETRO.campaniasSimilares,
  pesoPreferidos: "Ventaja de los bloques preferidos",
  pesoContacto: ETIQUETA_PARAMETRO.pesoContacto,
  kDia: ETIQUETA_PARAMETRO.kDia,
};

// ---------- Textos ----------

const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

/** 1200 → «1200», 28.32 → «28,32», 12000 → «12.000». */
export function numeroTexto(n: number): string {
  return n.toLocaleString("es-ES", { maximumFractionDigits: 2 });
}

/** Para un campo de texto: sin separador de miles, para que se pueda volver a leer. */
const numeroCampo = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/** 2026-09-01 → 01/09/2026. */
export const fechaTexto = (iso: string) => iso.split("-").reverse().join("/");

/** Bloques como en el formulario, sin fundir los contiguos (cada uno se coloca entero). */
export function textoBloques(bloques: readonly Tramo[]): string {
  return [...bloques]
    .sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin)
    .map((b) => textoTramos([b]))
    .join(", ");
}

/**
 * «11-14, 16-18» → bloques tal cual (sin fundir: «11-13, 13-15» son dos
 * bloques de 2 h, no uno de 4 h). null si algo no se entiende.
 */
export function parsearBloques(texto: string): Tramo[] | null {
  const bloques: Tramo[] = [];
  for (const parte of texto.split(/[,;]|\s+y\s+/)) {
    if (parte.trim() === "") continue;
    const t = parsearTramos(parte);
    if (t == null || t.length !== 1) return null;
    bloques.push(t[0]);
  }
  return bloques.sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
}

type Bloque = ParametrosCliente["bloques"][number];

/** «11-14 (preferido), 16-18»; con `conPeso`, el número: «11-14 (+0,3)». */
function textoListaBloques(bloques: readonly Bloque[], conPeso = false): string {
  return [...bloques]
    .sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin)
    .map((b) => {
      const t = textoTramos([b]);
      if (b.bonus === 0) return t;
      return conPeso ? `${t} (${b.bonus > 0 ? "+" : ""}${numeroTexto(b.bonus)})` : `${t} (preferido)`;
    })
    .join(", ");
}

function textoErlang(e: NonNullable<ParametrosCliente["erlang"]>): string {
  const aht = e.ahtSeg == null ? "duración medida" : `duración ${numeroTexto(e.ahtSeg)} s`;
  const margen = `${e.margen} ${e.margen === 1 ? "persona" : "personas"} de margen`;
  return `${numeroTexto(e.slaPct)} % antes de ${numeroTexto(e.umbralSeg)} s · ${margen} · ${aht}`;
}

/** Valor de un parámetro en lenguaje de pantalla («—» si no tiene). */
export function textoParametro<K extends keyof ParametrosCliente>(k: K, v: ParametrosCliente[K], conPeso = false): string {
  if (k === "calendario" && v == null) return "sin horario propio";
  if (k === "erlang" && v == null) return "no se calculan";
  if (v == null) return "—";
  switch (k) {
    case "erlang":
      return textoErlang(v as NonNullable<ParametrosCliente["erlang"]>);
    case "bloques": {
      const t = textoListaBloques(v as Bloque[], conPeso);
      return t || "—";
    }
    case "evitar":
      return textoTramos(v as Tramo[]) || "—";
    case "fechaFin":
    case "inicioContrato":
      return fechaTexto(v as string);
    case "curva":
      return TEXTO_CURVA[v as ParametrosCliente["curva"]];
    case "campaniasSimilares": {
      const l = v as string[];
      return l.length > 0 ? l.join(", ") : "las del cliente sin el año";
    }
    case "pctVivosObjetivo":
      return `${numeroTexto(v as number)} %`;
    case "ritmoManual":
      return `${numeroTexto(v as number)} cierres por hora`;
    case "horasContratadas":
    case "horasSemanaFijas":
    case "maxHorasDiaAgente":
    case "maxHorasSeguidas":
      return `${numeroTexto(v as number)} h`;
    default:
      return typeof v === "number" ? numeroTexto(v) : String(v);
  }
}

// ---------- Parámetros → formulario ----------

const POR_DEFECTO = esquemaParametrosCliente.parse({});

/** Los campos del formulario con lo guardado (o lo de por defecto si no vale). */
export function aFormulario(guardado: unknown): FormularioCliente {
  const r = esquemaParametrosCliente.safeParse(guardado ?? {});
  const p = r.success ? r.data : POR_DEFECTO;
  const preferidos = p.bloques.filter((b) => b.bonus > 0);
  const e = p.erlang ?? { ahtSeg: null, slaPct: 80, umbralSeg: 20, margen: 1 };
  return {
    calendario: p.calendario ?? "",
    bloquesPreferidos: textoBloques(preferidos),
    bloquesOtros: textoBloques(p.bloques.filter((b) => b.bonus <= 0)),
    evitar: textoTramos(p.evitar),
    horasContratadas: numeroCampo(p.horasContratadas),
    inicioContrato: p.inicioContrato ?? "",
    fechaFin: p.fechaFin ?? "",
    horasSemanaFijas: numeroCampo(p.horasSemanaFijas),
    maxHorasDiaAgente: numeroCampo(p.maxHorasDiaAgente),
    maxHorasSeguidas: numeroCampo(p.maxHorasSeguidas),
    maxBloquesDiaAgente: numeroCampo(p.maxBloquesDiaAgente),
    erlang: p.erlang != null,
    slaPct: numeroCampo(e.slaPct),
    umbralSeg: numeroCampo(e.umbralSeg),
    margen: numeroCampo(e.margen),
    ahtSeg: numeroCampo(e.ahtSeg),
    pctVivosObjetivo: numeroCampo(p.pctVivosObjetivo),
    ritmoManual: numeroCampo(p.ritmoManual),
    curva: p.curva,
    campaniasSimilares: p.campaniasSimilares.join("\n"),
    pesoPreferidos: numeroCampo(
      preferidos.length > 0 ? Math.max(...preferidos.map((b) => b.bonus)) : PESO_PREFERIDOS_POR_DEFECTO,
    ),
    pesoContacto: numeroCampo(p.pesoContacto),
    kDia: numeroCampo(p.kDia),
  };
}

// ---------- Formulario → parámetros ----------

export type ResultadoFormulario = { ok: true; parametros: Record<string, unknown> } | { ok: false; error: string };

class ErrorCampo extends Error {}

// Declaración de función (no constante): así TypeScript sabe que no vuelve
function falla(k: keyof FormularioCliente, mensaje: string): never {
  throw new ErrorCampo(`${ETIQUETA_CAMPO[k]}: ${mensaje}`);
}

interface ReglaNumero {
  entero?: boolean;
  min?: number;
  /** El mínimo no vale (tiene que ser mayor). */
  mayorQue?: number;
  max?: number;
}

/** Texto → número (coma o punto decimal); null si está vacío. */
function leerNumero(f: FormularioCliente, k: keyof FormularioCliente, regla: ReglaNumero): number | null {
  const v = String(f[k] ?? "").trim();
  if (v === "") return null;
  // «1.200» es mil doscientos en España, pero Number() lo lee como 1,2
  if (/^\d{1,3}(\.\d{3})+$/.test(v)) falla(k, `escribe el número sin puntos de miles (${v.replace(/\./g, "")}).`);
  const n = Number(v.replace(",", "."));
  if (!Number.isFinite(n) || !/^-?\d+([.,]\d+)?$/.test(v)) falla(k, "tiene que ser un número.");
  if (regla.entero && !Number.isInteger(n)) falla(k, "tiene que ser un número entero.");
  if (regla.mayorQue != null && n <= regla.mayorQue) falla(k, `tiene que ser mayor que ${numeroTexto(regla.mayorQue)}.`);
  if (regla.min != null && n < regla.min) falla(k, `no puede ser menor que ${numeroTexto(regla.min)}.`);
  if (regla.max != null && n > regla.max) falla(k, `no puede ser mayor que ${numeroTexto(regla.max)}.`);
  return n;
}

function leerFecha(f: FormularioCliente, k: "inicioContrato" | "fechaFin"): string | null {
  const v = f[k].trim();
  if (v === "") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !d || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) {
    falla(k, "fecha no válida.");
  }
  return v;
}

function leerBloques(f: FormularioCliente, k: "bloquesPreferidos" | "bloquesOtros"): Tramo[] {
  const t = parsearBloques(f[k]);
  if (t == null) falla(k, "escribe las horas como «11-14, 16-18» (o «9:30-11»).");
  return t;
}

/**
 * Lee el formulario y devuelve el objeto que se guarda, ya validado con el
 * esquema del motor y sin las claves que valen lo de por defecto.
 */
export function desdeFormulario(f: FormularioCliente): ResultadoFormulario {
  try {
    const preferidos = leerBloques(f, "bloquesPreferidos");
    const otros = leerBloques(f, "bloquesOtros");
    const repetido = preferidos.find((p) => otros.some((o) => o.inicioMin === p.inicioMin && o.finMin === p.finMin));
    if (repetido) {
      falla("bloquesOtros", `${textoTramos([repetido])} ya está en los preferidos: ponlo solo en una de las dos.`);
    }
    const evitar = parsearTramos(f.evitar);
    if (evitar == null) falla("evitar", "escribe las horas como «18-19» (o «13:30-15»).");
    const peso = leerNumero(f, "pesoPreferidos", { mayorQue: 0 }) ?? PESO_PREFERIDOS_POR_DEFECTO;

    const horasContratadas = leerNumero(f, "horasContratadas", { mayorQue: 0 });
    const inicioContrato = leerFecha(f, "inicioContrato");
    if (horasContratadas != null && inicioContrato == null) falla("inicioContrato", "di desde cuándo cuentan las horas contratadas.");
    if (horasContratadas == null && inicioContrato != null) falla("horasContratadas", "pon cuántas horas, o deja también vacía la fecha.");

    const campaniasSimilares = [...new Set(f.campaniasSimilares.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))];
    const mala = campaniasSimilares.find((x) => x.length > 80 || !/^[\w%[\]-]+$/.test(x));
    if (mala) falla("campaniasSimilares", `«${mala}» no vale: solo letras, números, _, %, [ ] y - (como en Campañas).`);

    const curva = f.curva || POR_DEFECTO.curva;
    if (!(CURVAS as readonly string[]).includes(curva)) falla("curva", "elige una opción de la lista.");

    const completo = {
      calendario: f.calendario.trim() || null,
      erlang: f.erlang
        ? {
            ahtSeg: leerNumero(f, "ahtSeg", { mayorQue: 0 }),
            slaPct: leerNumero(f, "slaPct", { min: 1, max: 100 }) ?? 80,
            umbralSeg: leerNumero(f, "umbralSeg", { mayorQue: 0 }) ?? 20,
            margen: leerNumero(f, "margen", { entero: true, min: 0 }) ?? 1,
          }
        : null,
      bloques: [...preferidos.map((b) => ({ ...b, bonus: peso })), ...otros.map((b) => ({ ...b, bonus: 0 }))].sort(
        (a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin,
      ),
      evitar,
      maxHorasDiaAgente: leerNumero(f, "maxHorasDiaAgente", { mayorQue: 0, max: 24 }),
      maxHorasSeguidas: leerNumero(f, "maxHorasSeguidas", { mayorQue: 0, max: 24 }),
      maxBloquesDiaAgente: leerNumero(f, "maxBloquesDiaAgente", { entero: true, min: 1 }),
      pctVivosObjetivo: leerNumero(f, "pctVivosObjetivo", { min: 0, max: 100 }) ?? POR_DEFECTO.pctVivosObjetivo,
      ritmoManual: leerNumero(f, "ritmoManual", { mayorQue: 0 }),
      horasSemanaFijas: leerNumero(f, "horasSemanaFijas", { min: 0 }),
      fechaFin: leerFecha(f, "fechaFin"),
      horasContratadas,
      inicioContrato,
      campaniasSimilares,
      curva,
      pesoContacto: leerNumero(f, "pesoContacto", { min: 0 }) ?? POR_DEFECTO.pesoContacto,
      kDia: leerNumero(f, "kDia", { mayorQue: 0 }) ?? POR_DEFECTO.kDia,
    };
    // Red de seguridad: el mismo esquema que el motor y sin claves de más
    const r = esquemaParametrosCliente.strict().safeParse(completo);
    if (!r.success) {
      const i = r.error.issues[0];
      const k = i?.path[0] as keyof ParametrosCliente | undefined;
      return { ok: false, error: `${k ? ETIQUETA_PARAMETRO[k] : "Parámetros"}: valor no válido (${i?.message ?? "?"}).` };
    }
    return { ok: true, parametros: minimizar(r.data) };
  } catch (e) {
    if (e instanceof ErrorCampo) return { ok: false, error: e.message };
    throw e;
  }
}

/** Sin las claves que valen lo de por defecto, como en la semilla. */
export function minimizar(p: ParametrosCliente): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const k of Object.keys(p) as (keyof ParametrosCliente)[]) {
    if (k === "bloques") {
      if (p.bloques.length > 0) {
        salida.bloques = p.bloques.map((b) => (b.bonus === 0 ? { inicioMin: b.inicioMin, finMin: b.finMin } : b));
      }
      continue;
    }
    if (JSON.stringify(p[k]) !== JSON.stringify(POR_DEFECTO[k])) salida[k] = p[k];
  }
  return salida;
}

// ---------- Comparar ----------

/** Forma canónica de un valor para comparar: el orden de bloques y franjas no importa. */
function canonico(k: keyof ParametrosCliente, p: ParametrosCliente): string {
  if (k === "bloques") {
    return JSON.stringify(
      [...p.bloques]
        .sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin || a.bonus - b.bonus)
        .map((b) => [b.inicioMin, b.finMin, b.bonus]),
    );
  }
  if (k === "evitar") return JSON.stringify(normalizarTramos(p.evitar));
  return JSON.stringify(p[k]);
}

/**
 * Lo que cambia entre dos configuraciones, en lenguaje de pantalla
 * («Horas contratadas: — → 1200 h»). Vacío si son equivalentes. Una
 * configuración que no pasa el esquema cuenta como la de por defecto.
 */
export function diferenciasParametros(antes: unknown, despues: unknown): string[] {
  const a = esquemaParametrosCliente.safeParse(antes ?? {});
  const d = esquemaParametrosCliente.safeParse(despues ?? {});
  const pa = a.success ? a.data : POR_DEFECTO;
  const pd = d.success ? d.data : POR_DEFECTO;
  const salida: string[] = [];
  for (const k of Object.keys(ETIQUETA_PARAMETRO) as (keyof ParametrosCliente)[]) {
    if (canonico(k, pa) === canonico(k, pd)) continue;
    salida.push(`${ETIQUETA_PARAMETRO[k]}: ${textoParametro(k, pa[k], true)} → ${textoParametro(k, pd[k], true)}`);
  }
  return salida;
}

/**
 * Qué cambiaría al guardar el formulario tal y como se abre: vacío si lo
 * guardado cabe entero en el formulario. No cabe, por ejemplo, con bloques
 * preferidos de pesos distintos o claves que el motor no conoce.
 */
export function perdidasAlEditar(guardado: Record<string, unknown>): string[] {
  const salida: string[] = [];
  const r = esquemaParametrosCliente.strict().safeParse(guardado);
  if (!r.success) {
    const i = r.error.issues[0];
    salida.push(`Lo guardado no es válido (${i?.path.join(".") || "valor"}: ${i?.message ?? "?"}); se sustituirá por lo de este formulario.`);
  }
  const vuelta = desdeFormulario(aFormulario(guardado));
  if (!vuelta.ok) salida.push(vuelta.error);
  else salida.push(...diferenciasParametros(guardado, vuelta.parametros));
  return salida;
}

// ---------- Resumen para la tabla ----------

/** Frases cortas de lo configurado (lo que no vale lo de por defecto). */
export function resumenParametros(guardado: unknown): string[] {
  const r = esquemaParametrosCliente.safeParse(guardado ?? {});
  if (!r.success) return ["Configuración no válida: revísala"];
  const p = r.data;
  const salida: string[] = [];
  if (p.calendario) salida.push(`Horario: ${p.calendario}`);
  if (p.erlang) salida.push(`Entrantes: ${numeroTexto(p.erlang.slaPct)} % antes de ${numeroTexto(p.erlang.umbralSeg)} s`);
  if (p.bloques.length > 0) salida.push(`Bloques: ${textoListaBloques(p.bloques)}`);
  if (p.evitar.length > 0) salida.push(`Nunca en ${textoTramos(p.evitar)}`);
  if (p.horasContratadas != null) {
    salida.push(
      `Contrato: ${numeroTexto(p.horasContratadas)} h${p.inicioContrato ? ` desde el ${fechaTexto(p.inicioContrato)}` : ""}`,
    );
  }
  if (p.fechaFin) salida.push(`Hasta el ${fechaTexto(p.fechaFin)}`);
  if (p.horasSemanaFijas != null) salida.push(`${numeroTexto(p.horasSemanaFijas)} h por semana`);
  const topes = [
    p.maxHorasDiaAgente != null ? `${numeroTexto(p.maxHorasDiaAgente)} h al día` : null,
    p.maxBloquesDiaAgente != null ? `${p.maxBloquesDiaAgente} ${p.maxBloquesDiaAgente === 1 ? "bloque" : "bloques"} al día` : null,
    p.maxHorasSeguidas != null ? `${numeroTexto(p.maxHorasSeguidas)} h seguidas` : null,
  ].filter(Boolean);
  if (topes.length > 0) salida.push(`Por persona: máx. ${topes.join(", ")}`);
  if (p.pctVivosObjetivo > 0) salida.push(`Puede quedar ${numeroTexto(p.pctVivosObjetivo)} % de la lista`);
  if (p.ritmoManual != null) salida.push(`Ritmo fijo: ${numeroTexto(p.ritmoManual)} cierres/h`);
  return salida;
}

// ---------- Horario de atención (horarios_servicio) ----------

export interface FilaHorario {
  servicio: string;
  /** dias[0] = lunes … dias[6] = domingo. */
  dias: boolean[];
  entradaMin: number;
  salidaMin: number;
  desde: string;
  hasta: string;
}

/**
 * Horario de atención de un calendario el día `hoy`, en texto: «L-V 9-14,
 * 16-20 · S 10-13». Si `hoy` cae fuera de su vigencia, el tramo más cercano
 * (como hace el cargador). null si el calendario no tiene filas.
 */
export function textoHorario(
  filas: readonly FilaHorario[],
  calendario: string,
  hoy: string,
): { texto: string; hasta: string } | null {
  const suyas = filas.filter((h) => h.servicio === calendario);
  if (suyas.length === 0) return null;
  const ultimoHasta = suyas.reduce((m, h) => (h.hasta > m ? h.hasta : m), suyas[0].hasta);
  const primerDesde = suyas.reduce((m, h) => (h.desde < m ? h.desde : m), suyas[0].desde);
  let vigentes = suyas.filter((h) => h.desde <= hoy && hoy <= h.hasta);
  if (vigentes.length === 0 && hoy > ultimoHasta) vigentes = suyas.filter((h) => h.hasta === ultimoHasta);
  if (vigentes.length === 0 && hoy < primerDesde) vigentes = suyas.filter((h) => h.desde === primerDesde);

  const porDia = DIAS.map((_, d) =>
    textoTramos(vigentes.filter((h) => h.dias[d]).map((h) => ({ inicioMin: h.entradaMin, finMin: h.salidaMin }))),
  );
  // Días seguidos con el mismo horario, juntos: «L-V»
  const grupos: { desde: number; hasta: number; texto: string }[] = [];
  porDia.forEach((texto, d) => {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === texto && ultimo.hasta === d - 1) ultimo.hasta = d;
    else grupos.push({ desde: d, hasta: d, texto });
  });
  const texto = grupos
    .filter((g) => g.texto !== "")
    .map((g) => `${g.desde === g.hasta ? DIAS[g.desde] : `${DIAS[g.desde]}-${DIAS[g.hasta]}`} ${g.texto}`)
    .join(" · ");
  return { texto: texto || "cerrado todos los días", hasta: ultimoHasta };
}
