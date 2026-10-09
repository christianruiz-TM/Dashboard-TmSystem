"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ipPeticion, registrarAuditoria } from "@/lib/auth/audit";
import { requireRol, ROLES_PLAN_EDICION } from "@/lib/auth/rbac";
import type { User } from "@/lib/db/schema";
import { esquemaFechaISO } from "@/lib/fechas";
import {
  CAMPOS_TEXTO,
  desdeFormulario,
  diferenciasParametros,
  nombreCampo,
  type FormularioCliente,
} from "@/lib/planificacion/formulario-cliente";
import {
  diaSemana,
  MODOS_CLIENTE,
  normalizarTramos,
  parsearTramos,
  textoTramos,
  type TramoDia,
} from "@/lib/planificacion/motor";
import {
  DESCRIPCION_PARAMETROS,
  esquemaParametrosPlan,
  guardarParametroPlan,
  leerParametrosPlan,
  type ClaveParametroPlan,
  type ParametrosPlan,
} from "@/lib/planificacion/parametros";
import * as repo from "@/lib/planificacion/repositorio";

// ============================================================
// Configuración del módulo de planificación: clientes, prefijos, agentes,
// patrones y turnos, parámetros y tipos de ausencia. Todo vive en SQLite
// (nada de clientes, colores ni agentes en el código). Solo supervisión
// (admin siempre pasa): cada acción lo comprueba, porque se pueden invocar
// con un POST a mano. Cada cambio deja rastro en audit_log (plan_config).
// ============================================================

const RUTA = "/planificacion/configuracion";
const DIAS = ["L", "M", "X", "J", "V", "S", "D"];

async function autorizar(): Promise<User> {
  return requireRol(...ROLES_PLAN_EDICION);
}

function volver(seccion: string, msg: string, detalle?: string, extra?: Record<string, string>): never {
  revalidatePath(RUTA, "layout");
  const p = new URLSearchParams({ msg, ...extra });
  if (detalle) p.set("detalle", detalle);
  redirect(`${RUTA}/${seccion}?${p.toString()}`);
}

async function auditar(usuario: User, detalle: string): Promise<void> {
  registrarAuditoria({
    accion: "plan_config",
    userId: usuario.id,
    username: usuario.username,
    detalle: detalle.slice(0, 1000),
    ip: await ipPeticion(),
  });
}

/** «campo: valor» de lo que cambia entre dos objetos (para la auditoría). */
function cambios(antes: Record<string, unknown> | undefined, despues: Record<string, unknown>): string {
  return Object.entries(despues)
    .filter(([k, v]) => JSON.stringify(antes?.[k] ?? null) !== JSON.stringify(v ?? null))
    .map(([k, v]) => `${k}=${JSON.stringify(v)?.slice(0, 80)}`)
    .join(" ");
}

const primerError = (e: z.ZodError) => {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "valor"}: ${i.message}` : "datos no válidos";
};

const texto = (f: FormData, k: string) => String(f.get(k) ?? "");
const casilla = (f: FormData, k: string) => f.get(k) === "on";

// ---------- Clientes ----------

const esquemaCliente = z.object({
  codigo: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,9}$/, "mayúsculas, números o _ (máx. 10), empezando por letra"),
  nombre: z.string().trim().min(2).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color #RRGGBB"),
  modo: z.enum(MODOS_CLIENTE),
  prioridad: z.coerce.number().int().min(0).max(1000),
  orden: z.coerce.number().int().min(0).max(1000),
  cuentaComo: z.string().trim().max(10).transform((v) => v || null),
  servicioAltitude: z.string().trim().max(100).transform((v) => v || null),
  equipo: z.string().trim().min(1).max(40),
  campanias: z
    .string()
    .max(2000)
    .transform((t) => [...new Set(t.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))])
    .refine((l) => l.every((x) => x.length <= 80 && /^[\w%[\]-]+$/.test(x)), "patrones LIKE de shortname: letras, números, _, %, [ ] y -"),
  activo: z.boolean(),
});

export async function guardarClientePlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const id = formData.get("id") ? Number(formData.get("id")) : null;
  const todos = repo.leerClientesTodos();
  const actual = id != null ? todos.find((c) => c.id === id) : undefined;
  if (id != null && !actual) volver("clientes", "error_datos", "El cliente no existe.");

  const datos = esquemaCliente.safeParse({
    codigo: actual?.codigo ?? texto(formData, "codigo").toUpperCase(),
    nombre: texto(formData, "nombre"),
    color: texto(formData, "color"),
    modo: texto(formData, "modo"),
    prioridad: texto(formData, "prioridad"),
    orden: texto(formData, "orden"),
    cuentaComo: texto(formData, "cuentaComo"),
    servicioAltitude: texto(formData, "servicioAltitude"),
    equipo: texto(formData, "equipo"),
    campanias: texto(formData, "campanias"),
    activo: casilla(formData, "activo"),
  });
  // Con el tipo explícito, TypeScript sabe que no vuelve (y estrecha tras llamarla)
  const volverAqui: (detalle: string) => never = (detalle) =>
    volver("clientes", "error_datos", detalle, actual ? { editar: actual.codigo } : undefined);
  if (!datos.success) volverAqui(primerError(datos.error));
  const c = datos.data;

  // Parámetros del motor: campos en lenguaje sencillo (formulario-cliente.ts),
  // que se convierten al mismo objeto de siempre y se validan con el esquema
  // del motor. Sin el campo del reparto (un <select>, siempre se envía), el
  // formulario es el antiguo, el del JSON: guardar dejaría los parámetros
  // vacíos.
  if (!formData.has(nombreCampo("curva"))) {
    volverAqui("El formulario es de una versión anterior: recarga la página y vuelve a guardar.");
  }
  const campos = Object.fromEntries(CAMPOS_TEXTO.map((k) => [k, texto(formData, nombreCampo(k))])) as Omit<
    FormularioCliente,
    "erlang"
  >;
  const leidos = desdeFormulario({ ...campos, erlang: casilla(formData, nombreCampo("erlang")) });
  if (!leidos.ok) volverAqui(leidos.error);
  const parametros = leidos.parametros;

  if (!actual && todos.some((x) => x.codigo === c.codigo)) volverAqui(`Ya existe un cliente ${c.codigo}.`);
  if (c.cuentaComo) {
    const destino = todos.find((x) => x.codigo === c.cuentaComo);
    if (!destino || destino.codigo === c.codigo) volverAqui("«Cuenta como» tiene que ser otro cliente existente.");
    if (destino.cuentaComo) volverAqui(`${destino.codigo} ya cuenta como ${destino.cuentaComo}: no se encadenan.`);
    if (todos.some((x) => x.cuentaComo === c.codigo)) {
      volverAqui(`Otros clientes cuentan como ${c.codigo}: no puede contar a su vez como otro.`);
    }
  }
  // El motor necesita exactamente un cliente «resto» activo en el equipo planificado
  const equipoPlan = leerParametrosPlan().equipo;
  const despues = [...todos.filter((x) => x.id !== id), { ...c, id: -1 }];
  const restos = despues.filter((x) => x.activo && x.equipo === equipoPlan && x.modo === "resto");
  if (despues.some((x) => x.activo && x.equipo === equipoPlan) && restos.length !== 1) {
    volverAqui(
      `El equipo ${equipoPlan} tiene que tener exactamente un cliente activo de modo «resto» (quedarían ${restos.length}).`,
    );
  }

  // El código no cambia al editar (lo usan bloques, prefijos y bolsas)
  const { codigo, ...resto } = { ...c, parametros };
  // Los parámetros, en lenguaje de pantalla («Horas contratadas: — → 1200 h»)
  const detalle = (antes: Record<string, unknown> | undefined) =>
    [cambios(antes, { ...resto, parametros: antes?.parametros }), ...diferenciasParametros(antes?.parametros ?? {}, parametros)]
      .filter(Boolean)
      .join(" · ");
  if (actual) {
    repo.actualizarCliente(actual.id, resto);
    await auditar(usuario, `cliente ${codigo}: ${detalle(actual) || "sin cambios"}`);
  } else {
    repo.crearCliente({ codigo, ...resto });
    await auditar(usuario, `cliente nuevo ${codigo}: ${detalle(undefined)}`);
  }
  volver("clientes", actual ? "guardado" : "creado");
}

// ---------- Prefijos ----------

const esquemaPrefijo = z.object({
  prefijo: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]*(_[A-Za-z0-9]+)*$/, "prefijo como GH, UGR o Soc_Fed").max(20),
  sufijo: z
    .string()
    .trim()
    .regex(/^((_[A-Za-z0-9]+)+)?$/, "sufijo vacío o como _BD, _BD_LX")
    .max(20),
  clienteCodigo: z.string().trim().min(1),
});

export async function guardarPrefijoPlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const datos = esquemaPrefijo.safeParse({
    prefijo: texto(formData, "prefijo"),
    sufijo: texto(formData, "sufijo"),
    clienteCodigo: texto(formData, "clienteCodigo"),
  });
  if (!datos.success) volver("clientes", "error_datos", primerError(datos.error));
  const p = datos.data;
  if (!repo.leerClientesTodos().some((c) => c.codigo === p.clienteCodigo)) {
    volver("clientes", "error_datos", `No existe el cliente ${p.clienteCodigo}.`);
  }
  // resolverCliente no distingue mayúsculas: Av y AV serían el mismo prefijo
  const parecido = repo
    .leerPrefijos()
    .find(
      (x) =>
        x.prefijo.toLowerCase() === p.prefijo.toLowerCase() &&
        x.sufijo.toLowerCase() === p.sufijo.toLowerCase() &&
        (x.prefijo !== p.prefijo || x.sufijo !== p.sufijo),
    );
  if (parecido) volver("clientes", "error_datos", `Ya existe como ${parecido.prefijo}${parecido.sufijo}: edítalo ahí.`);
  repo.guardarPrefijo(p);
  await auditar(usuario, `prefijo ${p.prefijo}${p.sufijo} → ${p.clienteCodigo}`);
  volver("clientes", "guardado");
}

export async function borrarPrefijoPlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) volver("clientes", "error_datos");
  const fila = repo.borrarPrefijo(id);
  if (fila) await auditar(usuario, `-prefijo ${fila.prefijo}${fila.sufijo} (era ${fila.clienteCodigo})`);
  volver("clientes", "borrado");
}

// ---------- Agentes ----------

const esquemaAgente = z.object({
  numero: z.string().regex(/^\d{4}$/),
  alias: z.string().trim().max(40).transform((v) => v || null),
  contratoSemanalH: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : Number(v.replace(",", "."))))
    .refine((v) => v == null || (Number.isFinite(v) && v >= 0 && v <= 60), "contrato entre 0 y 60 h"),
  enPlantilla: z.boolean(),
  equipo: z.string().trim().max(40).transform((v) => v || null),
  forzarActivo: z.boolean(),
  notas: z.string().trim().max(300).transform((v) => v || null),
});

export async function guardarAgentePlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const datos = esquemaAgente.safeParse({
    numero: texto(formData, "numero"),
    alias: texto(formData, "alias"),
    contratoSemanalH: texto(formData, "contratoSemanalH"),
    enPlantilla: casilla(formData, "enPlantilla"),
    equipo: texto(formData, "equipo"),
    forzarActivo: casilla(formData, "forzarActivo"),
    notas: texto(formData, "notas"),
  });
  if (!datos.success) volver("agentes", "error_datos", primerError(datos.error));
  const { numero, ...valores } = datos.data;
  if (valores.enPlantilla && !valores.equipo) {
    volver("agentes", "error_datos", "Un agente en plantilla necesita equipo.", { editar: numero });
  }
  const antes = repo.leerAgentes().find((a) => a.numero === numero);
  if (!antes || !repo.guardarAgente(numero, valores)) volver("agentes", "error_datos", `No existe el agente ${numero}.`);
  await auditar(usuario, `agente ${numero}: ${cambios(antes, valores) || "sin cambios"}`);
  volver("agentes", "guardado");
}

// ---------- Patrones y turnos ----------

export async function guardarPatronPlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const id = formData.get("id") ? Number(formData.get("id")) : undefined;
  const nombre = texto(formData, "nombre").trim();
  const extra = id != null ? { editar: String(id) } : undefined;
  if (nombre.length < 3 || nombre.length > 80) volver("patrones", "error_datos", "Nombre de 3 a 80 caracteres.", extra);
  const patrones = repo.leerPatrones();
  if (id != null && !patrones.some((p) => p.id === id)) volver("patrones", "error_datos", "El patrón no existe.");
  if (patrones.some((p) => p.nombre === nombre && p.id !== id)) {
    volver("patrones", "error_datos", `Ya hay un patrón «${nombre}».`, extra);
  }
  const tramos: TramoDia[] = [];
  for (let d = 0; d < 7; d++) {
    const t = parsearTramos(texto(formData, `d${d}`));
    if (t == null) {
      volver("patrones", "error_datos", `${DIAS[d]}: escribe los tramos como «9-14, 16-20».`, extra);
    }
    tramos.push(...t.map((x) => ({ diaSemana: d, ...x })));
  }
  const nuevoId = repo.guardarPatron({ id, nombre, activo: casilla(formData, "activo"), tramos });
  const resumen = DIAS.map((l, d) => `${l} ${textoTramos(tramos.filter((t) => t.diaSemana === d)) || "—"}`).join(" · ");
  await auditar(usuario, `patrón ${id != null ? id : `nuevo ${nuevoId}`} «${nombre}»: ${resumen}`);
  volver("patrones", id != null ? "guardado" : "creado");
}

const esquemaTurno = z
  .object({
    agenteNumero: z.string().regex(/^\d{4}$/),
    patronAId: z.string().transform((v) => (v ? Number(v) : null)),
    patronBId: z.string().transform((v) => (v ? Number(v) : null)),
    desde: esquemaFechaISO,
    hasta: z.union([z.literal("").transform(() => null), esquemaFechaISO]),
  })
  .refine((t) => t.hasta == null || t.hasta >= t.desde, { message: "«hasta» anterior a «desde»", path: ["hasta"] });

export async function asignarTurnoPlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const datos = esquemaTurno.safeParse({
    agenteNumero: texto(formData, "agenteNumero"),
    patronAId: texto(formData, "patronAId"),
    patronBId: texto(formData, "patronBId"),
    desde: texto(formData, "desde"),
    hasta: texto(formData, "hasta"),
  });
  if (!datos.success) volver("patrones", "error_datos", primerError(datos.error));
  const t = datos.data;
  const ids = new Set(repo.leerPatrones().map((p) => p.id));
  if ((t.patronAId != null && !ids.has(t.patronAId)) || (t.patronBId != null && !ids.has(t.patronBId))) {
    volver("patrones", "error_datos", "Patrón inexistente.");
  }
  if (!repo.leerAgentes().some((a) => a.numero === t.agenteNumero)) {
    volver("patrones", "error_datos", `No existe el agente ${t.agenteNumero}.`);
  }
  repo.asignarTurno(t);
  await auditar(usuario, `turno ${t.agenteNumero} desde ${t.desde}${t.hasta ? ` hasta ${t.hasta}` : ""}: A=${t.patronAId ?? "—"} B=${t.patronBId ?? "—"}`);
  volver("patrones", "guardado");
}

const esquemaTramosAprendidos = z
  .array(
    z.object({
      diaSemana: z.number().int().min(0).max(6),
      inicioMin: z.number().int().min(0).max(1440),
      finMin: z.number().int().min(0).max(1440),
    }),
  )
  .max(100);

/** Mismo conjunto de tramos por día (orden y fusión aparte). */
function mismosTramos(a: readonly TramoDia[], b: readonly TramoDia[]): boolean {
  for (let d = 0; d < 7; d++) {
    const x = normalizarTramos(a.filter((t) => t.diaSemana === d));
    const y = normalizarTramos(b.filter((t) => t.diaSemana === d));
    if (JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

/**
 * «Aceptar» un patrón aprendido: se reutiliza el patrón que tenga exactamente
 * esos tramos o se crea uno («Aprendido 0851 A...») y se asigna desde la
 * fecha indicada. La rotación que no se pudo aprender conserva el patrón que
 * tenía.
 */
export async function aceptarPatronAprendido(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const agenteNumero = texto(formData, "agenteNumero");
  const desde = esquemaFechaISO.safeParse(texto(formData, "desde"));
  if (!/^\d{4}$/.test(agenteNumero) || !desde.success) volver("patrones", "error_datos", "Agente o fecha no válidos.", { aprender: "1" });
  const leer = (k: string): TramoDia[] | null => {
    const bruto = texto(formData, k);
    if (bruto === "") return null;
    try {
      const r = esquemaTramosAprendidos.safeParse(JSON.parse(bruto));
      return r.success && r.data.every((t) => t.finMin > t.inicioMin) ? r.data : null;
    } catch {
      return null;
    }
  };
  const tramosA = leer("tramosA");
  const tramosB = leer("tramosB");
  if (!tramosA && !tramosB) volver("patrones", "error_datos", "No hay ningún patrón aprendido que aceptar.", { aprender: "1" });

  const patrones = repo.leerPatrones();
  const vigente = repo
    .leerAsignacionesTurno()
    .filter((t) => t.agenteNumero === agenteNumero && t.desde <= desde.data && (t.hasta == null || t.hasta >= desde.data))
    .sort((a, b) => b.desde.localeCompare(a.desde))[0];
  const hoy = desde.data.split("-").reverse().join("/");
  const idPara = (rot: "A" | "B", tramos: TramoDia[] | null): number | null => {
    if (!tramos) return rot === "A" ? (vigente?.patronAId ?? null) : (vigente?.patronBId ?? null);
    const existente = patrones.find((p) => mismosTramos(p.tramos, tramos));
    if (existente) return existente.id;
    const horas = tramos.reduce((a, t) => a + (t.finMin - t.inicioMin), 0) / 60;
    let nombre = `Aprendido ${agenteNumero} ${rot} · ${horas.toLocaleString("es-ES")} h (${hoy})`;
    for (let n = 2; patrones.some((p) => p.nombre === nombre); n++) nombre = `${nombre} ${n}`;
    const id = repo.guardarPatron({ nombre, activo: true, tramos });
    patrones.push({ id, nombre, activo: true, tramos });
    return id;
  };
  const patronAId = idPara("A", tramosA);
  const patronBId = idPara("B", tramosB);
  repo.asignarTurno({ agenteNumero, patronAId, patronBId, desde: desde.data, hasta: null });
  await auditar(usuario, `patrón aprendido aceptado ${agenteNumero} desde ${desde.data}: A=${patronAId ?? "—"} B=${patronBId ?? "—"}`);
  volver("patrones", "guardado", undefined, { aprender: "1" });
}

// ---------- Parámetros globales ----------

function leerCampo(formData: FormData, prop: ClaveParametroPlan): unknown {
  const tipo = DESCRIPCION_PARAMETROS[prop].tipo;
  const v = texto(formData, prop).trim();
  switch (tipo) {
    case "booleano":
      return casilla(formData, prop);
    case "entero":
    case "decimal":
      return v === "" ? undefined : Number(v.replace(",", "."));
    case "hora": {
      const m = /^(\d{1,2}):(\d{2})$/.exec(v);
      return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
    }
    default:
      return v;
  }
}

export async function guardarParametrosPlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const actuales = leerParametrosPlan();
  const nuevos: Partial<ParametrosPlan> = {};
  for (const prop of Object.keys(DESCRIPCION_PARAMETROS) as ClaveParametroPlan[]) {
    const r = esquemaParametrosPlan.shape[prop].safeParse(leerCampo(formData, prop));
    if (!r.success) volver("parametros", "error_datos", `${DESCRIPCION_PARAMETROS[prop].etiqueta}: ${r.error.issues[0]?.message}`);
    (nuevos as Record<string, unknown>)[prop] = r.data;
  }
  const p = { ...actuales, ...nuevos } as ParametrosPlan;
  if (p.finDiaMin <= p.inicioDiaMin) volver("parametros", "error_datos", "La última hora tiene que ser posterior a la primera.");
  if ((p.finDiaMin - p.inicioDiaMin) % p.pasoMin !== 0) {
    volver("parametros", "error_datos", "El día tiene que dividirse en franjas enteras.");
  }
  if (diaSemana(p.semanaA) !== 0) volver("parametros", "error_datos", "La semana A de referencia tiene que empezar en lunes.");
  if (p.semanasRitmoMax < p.semanasRitmo) {
    volver("parametros", "error_datos", "Las semanas de ritmo (máximo) no pueden ser menos que las de ritmo.");
  }
  const cambiados = (Object.keys(nuevos) as ClaveParametroPlan[]).filter(
    (k) => JSON.stringify(actuales[k]) !== JSON.stringify(p[k]),
  );
  for (const k of cambiados) guardarParametroPlan(k, p[k]);
  await auditar(
    usuario,
    cambiados.length > 0
      ? `parámetros: ${cambiados.map((k) => `${k} ${JSON.stringify(actuales[k])}→${JSON.stringify(p[k])}`).join(", ")}`
      : "parámetros: sin cambios",
  );
  volver("parametros", "guardado");
}

// ---------- Tipos de ausencia ----------

const esquemaTipoAusencia = z.object({
  codigo: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,9}$/, "mayúsculas, números o _ (máx. 10)"),
  nombre: z.string().trim().min(2).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "color #RRGGBB"),
  computaComoTrabajada: z.boolean(),
  activo: z.boolean(),
});

export async function guardarTipoAusenciaPlan(formData: FormData): Promise<void> {
  const usuario = await autorizar();
  const crear = formData.get("crear") === "1";
  const datos = esquemaTipoAusencia.safeParse({
    codigo: texto(formData, "codigo").toUpperCase(),
    nombre: texto(formData, "nombre"),
    color: texto(formData, "color"),
    computaComoTrabajada: casilla(formData, "computaComoTrabajada"),
    activo: casilla(formData, "activo"),
  });
  if (!datos.success) volver("ausencias", "error_datos", primerError(datos.error));
  const antes = repo.leerTiposAusencia().find((t) => t.codigo === datos.data.codigo);
  if (crear && antes) volver("ausencias", "error_existe", `(${datos.data.codigo})`);
  if (!crear && !antes) volver("ausencias", "error_datos", `No existe el tipo ${datos.data.codigo}.`);
  repo.guardarTipoAusencia(datos.data, crear);
  await auditar(usuario, `tipo de ausencia ${datos.data.codigo}: ${cambios(antes, datos.data) || "sin cambios"}`);
  volver("ausencias", crear ? "creado" : "guardado");
}
