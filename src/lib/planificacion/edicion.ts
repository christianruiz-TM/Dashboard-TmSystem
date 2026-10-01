import { z } from "zod";
import {
  horaCorta,
  normalizarTramos,
  rangoCorto,
  solapan,
  validarPlan,
  type Aviso,
  type BloqueBasico,
  type ContextoValidacion,
  type EntradaMotor,
  type ResumenMotor,
  type Tramo,
} from "./motor";
import type { BloqueTablero } from "./tablero";

// ============================================================
// Edición del plan en el tablero: operaciones PURAS (como el motor; lo
// vigila la misma regla de ESLint) que el navegador aplica al momento y que
// el servidor REPITE al guardar sobre los bloques de la BBDD. La revisión de
// la versión garantiza que los dos parten de lo mismo, así que el servidor
// nunca se fía de los bloques que calcula el navegador: solo de la lista de
// operaciones, validada con zod, y vuelve a validar el plan.
//
// Reglas de una edición:
//   - Lo que se suelta encima de otros bloques del mismo agente y día los
//     recorta (no se solapan nunca). Un bloque FIJADO no se pisa: hay que
//     desfijarlo antes.
//   - Al mover o encoger un bloque de otro cliente, el hueco que deja dentro
//     del turno (sin ausencias ni festivos) vuelve al cliente base (GH), como
//     hace el motor. Si el bloque es del propio cliente base, el hueco queda
//     libre. Eliminar deja siempre el hueco libre; «Devolver a GH» es
//     cambiar de cliente.
//   - No se aplica nada que cree una incidencia DURA nueva (solape, agente
//     sin usuario del cliente, bloque sobre una ausencia, entrante fuera del
//     horario del servicio). Las que ya había no bloquean otras ediciones.
//   - Los bloques nuevos llevan id negativo hasta guardarse; el siguiente es
//     siempre «el menor id − 1», así navegador y servidor dan los mismos.
// ============================================================

const esquemaId = z.number().int().refine((n) => n !== 0, "id no válido");
const esquemaNumero = z.string().regex(/^\d{4}$/, "nº de agente de 4 dígitos");
const esquemaFecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha YYYY-MM-DD");
const esquemaMin = z.number().int().min(0).max(1440);
const esquemaCodigo = z.string().min(1).max(10);

export const esquemaOperacion = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("mover"), id: esquemaId, agenteNumero: esquemaNumero, fecha: esquemaFecha, inicioMin: esquemaMin }),
  z.object({ tipo: z.literal("redimensionar"), id: esquemaId, inicioMin: esquemaMin, finMin: esquemaMin }),
  z.object({ tipo: z.literal("dividir"), id: esquemaId, enMin: esquemaMin }),
  z.object({ tipo: z.literal("unir"), id: esquemaId }),
  z.object({ tipo: z.literal("cambiarCliente"), id: esquemaId, clienteCodigo: esquemaCodigo }),
  z.object({ tipo: z.literal("eliminar"), id: esquemaId }),
  z.object({ tipo: z.literal("fijar"), id: esquemaId, fijado: z.boolean() }),
  /** Recorta los bloques del agente y día que pisan sus ausencias (dejan el hueco libre). */
  z.object({ tipo: z.literal("quitarAusencias"), agenteNumero: esquemaNumero, fecha: esquemaFecha }),
  z.object({
    tipo: z.literal("crear"),
    agenteNumero: esquemaNumero,
    fecha: esquemaFecha,
    inicioMin: esquemaMin,
    finMin: esquemaMin,
    clienteCodigo: esquemaCodigo,
  }),
]);
export type Operacion = z.infer<typeof esquemaOperacion>;

/** Máximo de operaciones por guardado (un lote de una sesión de edición normal son decenas). */
export const MAX_OPERACIONES_LOTE = 500;

/** Qué hizo la persona con un bloque (datos.accion de los bloques manuales). */
export type AccionManual = "movido" | "ajustado" | "cliente" | "creado" | "relleno" | "unido";

export interface ContextoEdicion {
  pasoMin: number;
  inicioDiaMin: number;
  finDiaMin: number;
  clienteBase: string;
  fechas: ReadonlySet<string>;
  /** Agentes con fila en el tablero (se les puede poner bloques). */
  agentes: ReadonlySet<string>;
  clientes: ReadonlySet<string>;
  /** `${agente}|${fecha}` → tramos a los que vuelve el cliente base: turno − ausencias (nada en festivo). */
  libre: ReadonlyMap<string, readonly Tramo[]>;
  /** `${agente}|${fecha}` → sus ausencias de ese día. */
  ausencias: ReadonlyMap<string, readonly Tramo[]>;
  /** Para rechazar lo que cree incidencias duras nuevas (null = sin comprobar). */
  validacion: ContextoValidacion | null;
}

export type ResultadoEdicion =
  | {
      ok: true;
      bloques: BloqueTablero[];
      /** false si la operación no cambia nada (mismo sitio, mismo cliente...). */
      cambia: boolean;
      /** Bloque que conviene enfocar después (el movido, el nuevo...). */
      foco: number | null;
    }
  | { ok: false; error: string };

const clave = (agente: string, fecha: string) => `${agente}|${fecha}`;

/** `tramos` menos `quitar` (los dos sin solapes internos). */
export function restarTramos(tramos: readonly Tramo[], quitar: readonly Tramo[]): Tramo[] {
  let resto = normalizarTramos(tramos);
  for (const q of quitar) {
    resto = resto.flatMap((t) => {
      if (!solapan(t, q)) return [t];
      const piezas: Tramo[] = [];
      if (t.inicioMin < q.inicioMin) piezas.push({ inicioMin: t.inicioMin, finMin: q.inicioMin });
      if (q.finMin < t.finMin) piezas.push({ inicioMin: q.finMin, finMin: t.finMin });
      return piezas;
    });
  }
  return resto;
}

/** Contexto de edición a partir de la entrada del tablero (foto + vivo). */
export function construirContextoEdicion(
  entrada: EntradaMotor,
  agentes: Iterable<string>,
  validacion: ContextoValidacion | null,
): ContextoEdicion {
  const festivos = new Set(
    entrada.dias.filter((d) => d.festivos.includes(entrada.servicioCalendario)).map((d) => d.fecha),
  );
  const libre = new Map<string, Tramo[]>();
  const ausencias = new Map<string, Tramo[]>();
  for (const a of entrada.agentes) {
    for (const x of a.ausencias) {
      const k = clave(a.numero, x.fecha);
      ausencias.set(k, [...(ausencias.get(k) ?? []), { inicioMin: x.inicioMin, finMin: x.finMin }]);
    }
    for (const d of entrada.dias) {
      const turno = a.turnos[d.fecha] ?? [];
      if (turno.length === 0 || festivos.has(d.fecha)) continue;
      const tramos = restarTramos(turno, ausencias.get(clave(a.numero, d.fecha)) ?? []);
      if (tramos.length > 0) libre.set(clave(a.numero, d.fecha), tramos);
    }
  }
  return {
    pasoMin: entrada.pasoMin,
    inicioDiaMin: entrada.inicioDiaMin,
    finDiaMin: entrada.finDiaMin,
    clienteBase: entrada.clienteBase,
    fechas: new Set(entrada.dias.map((d) => d.fecha)),
    agentes: new Set(agentes),
    clientes: new Set(entrada.clientes.map((c) => c.codigo)),
    libre,
    ausencias,
    validacion,
  };
}

/** Operaciones que quitan de los bloques lo que pisa una ausencia (una por agente y día afectado). */
export function operacionesQuitarAusencias(bloques: readonly BloqueTablero[], ctx: Pick<ContextoEdicion, "ausencias">): Operacion[] {
  const claves = new Set<string>();
  for (const b of bloques) {
    const k = clave(b.agenteNumero, b.fecha);
    if ((ctx.ausencias.get(k) ?? []).some((x) => solapan(x, b))) claves.add(k);
  }
  return [...claves].sort().map((k) => {
    const [agenteNumero, fecha] = k.split("|");
    return { tipo: "quitarAusencias", agenteNumero, fecha };
  });
}

/**
 * Inicio (minutos) de un bloque de `duracion` soltado en la posición
 * `fraccion` (0..1) del día, ajustado a la franja y sin salirse del día.
 */
export function inicioEnPosicion(fraccion: number, duracion: number, ctx: Pick<ContextoEdicion, "pasoMin" | "inicioDiaMin" | "finDiaMin">): number {
  const total = ctx.finDiaMin - ctx.inicioDiaMin;
  const inicio = ctx.inicioDiaMin + Math.round((fraccion * total) / ctx.pasoMin) * ctx.pasoMin;
  return Math.max(ctx.inicioDiaMin, Math.min(inicio, ctx.finDiaMin - duracion));
}

/** Firma de una incidencia (para saber si una edición crea alguna nueva). */
const firma = (a: Aviso) =>
  `${a.codigo}|${a.agente ?? ""}|${a.fecha ?? ""}|${a.cliente ?? ""}|${a.inicioMin ?? ""}|${a.finMin ?? ""}`;

/** Incidencias duras de los agentes y días indicados (las duras solo dependen del propio agente y día). */
export function durasDe(bloques: readonly BloqueTablero[], claves: ReadonlySet<string>, ctx: ContextoValidacion): Aviso[] {
  const sub = bloques.filter((b) => claves.has(clave(b.agenteNumero, b.fecha)));
  return validarPlan(sub, ctx).filter((a) => a.gravedad === "dura");
}

/** Duras de `despues` que no estaban en `antes` (en los agentes y días indicados). */
export function durasNuevas(
  antes: readonly BloqueTablero[],
  despues: readonly BloqueTablero[],
  claves: ReadonlySet<string>,
  ctx: ContextoValidacion,
): Aviso[] {
  const previas = new Set(durasDe(antes, claves, ctx).map(firma));
  return durasDe(despues, claves, ctx).filter((a) => !previas.has(firma(a)));
}

/** Marca un bloque como editado a mano, conservando de dónde venía (la primera vez). */
function marcar(b: BloqueTablero, accion: AccionManual, cambios: Partial<BloqueTablero>): BloqueTablero {
  const yaManual = b.origen === "manual" && b.regla === "manual";
  // Quién y cuándo los pone el servidor al guardar
  const resto = { ...b.datos };
  delete resto.editadoPor;
  delete resto.editadoAt;
  const datos = yaManual
    ? { ...resto, accion }
    : { accion, clienteAnterior: b.clienteCodigo, reglaAnterior: b.regla };
  return { ...b, ...cambios, origen: "manual", regla: "manual", datos, editadoPor: null, editadoAt: null };
}

class ErrorEdicion extends Error {}

/** Aplica una operación. No muta `bloques`. */
export function aplicarOperacion(bloques: readonly BloqueTablero[], op: Operacion, ctx: ContextoEdicion): ResultadoEdicion {
  try {
    return aplicar(bloques, op, ctx);
  } catch (e) {
    if (e instanceof ErrorEdicion) return { ok: false, error: e.message };
    throw e;
  }
}

/** Aplica una lista de operaciones en orden; la primera que falle para todo. */
export function aplicarOperaciones(
  bloques: readonly BloqueTablero[],
  ops: readonly Operacion[],
  ctx: ContextoEdicion,
): { ok: true; bloques: BloqueTablero[] } | { ok: false; error: string; indice: number } {
  let actual = [...bloques];
  for (let i = 0; i < ops.length; i++) {
    const r = aplicarOperacion(actual, ops[i], ctx);
    if (!r.ok) return { ok: false, error: r.error, indice: i };
    actual = r.bloques;
  }
  return { ok: true, bloques: actual };
}

function aplicar(bloques: readonly BloqueTablero[], op: Operacion, ctx: ContextoEdicion): ResultadoEdicion {
  let proximoId = Math.min(0, ...bloques.map((b) => b.id)) - 1;
  const nuevoId = () => proximoId--;
  const sinCambio: ResultadoEdicion = { ok: true, bloques: [...bloques], cambia: false, foco: "id" in op ? op.id : null };

  const buscar = (id: number) => {
    const b = bloques.find((x) => x.id === id);
    if (!b) throw new ErrorEdicion("El bloque ya no existe (¿se ha guardado otra versión?).");
    return b;
  };
  const comprobarRango = (inicio: number, fin: number) => {
    const alineado = (m: number) => (m - ctx.inicioDiaMin) % ctx.pasoMin === 0;
    if (!(ctx.inicioDiaMin <= inicio && inicio < fin && fin <= ctx.finDiaMin) || !alineado(inicio) || !alineado(fin)) {
      throw new ErrorEdicion(`Horario no válido (${rangoCorto(inicio, fin)}): tiene que ir por franjas de ${ctx.pasoMin} min dentro del día.`);
    }
  };
  const comprobarDestino = (agente: string, fecha: string) => {
    if (!ctx.agentes.has(agente)) throw new ErrorEdicion(`El agente ${agente} no está en este plan.`);
    if (!ctx.fechas.has(fecha)) throw new ErrorEdicion(`El ${fecha} no es de este mes.`);
  };
  const comprobarCliente = (codigo: string) => {
    if (!ctx.clientes.has(codigo)) throw new ErrorEdicion(`No existe el cliente ${codigo} en este plan.`);
  };

  /** Recorta los bloques del agente y día que pisa `rango` (salvo `excluir`). Error si pisa uno fijado. */
  const recortar = (lista: BloqueTablero[], agente: string, fecha: string, rango: Tramo, excluir: number | null) => {
    const salida: BloqueTablero[] = [];
    for (const b of lista) {
      if (b.id === excluir || b.agenteNumero !== agente || b.fecha !== fecha || !solapan(b, rango)) {
        salida.push(b);
        continue;
      }
      if (b.fijado) {
        throw new ErrorEdicion(
          `Pisa un bloque fijado (${b.clienteCodigo} ${rangoCorto(b.inicioMin, b.finMin)}): desfíjalo antes.`,
        );
      }
      const izquierda = b.inicioMin < rango.inicioMin;
      const derecha = rango.finMin < b.finMin;
      if (izquierda) salida.push({ ...b, finMin: rango.inicioMin });
      if (derecha) salida.push({ ...b, id: izquierda ? nuevoId() : b.id, inicioMin: rango.finMin });
    }
    return salida;
  };

  /** El hueco que deja un bloque de otro cliente vuelve al cliente base, dentro del turno libre. */
  const rellenarBase = (lista: BloqueTablero[], origen: BloqueTablero, hueco: readonly Tramo[]) => {
    if (origen.clienteCodigo === ctx.clienteBase || hueco.length === 0) return lista;
    const libre = ctx.libre.get(clave(origen.agenteNumero, origen.fecha)) ?? [];
    const ocupados = lista.filter((b) => b.agenteNumero === origen.agenteNumero && b.fecha === origen.fecha);
    const tramos = restarTramos(
      hueco.flatMap((h) => libre.flatMap((l) => (solapan(h, l) ? [{ inicioMin: Math.max(h.inicioMin, l.inicioMin), finMin: Math.min(h.finMin, l.finMin) }] : []))),
      ocupados,
    );
    const nuevos: BloqueTablero[] = tramos.map((t) => ({
      id: nuevoId(),
      agenteNumero: origen.agenteNumero,
      fecha: origen.fecha,
      inicioMin: t.inicioMin,
      finMin: t.finMin,
      clienteCodigo: ctx.clienteBase,
      regla: "manual",
      datos: { accion: "relleno", clienteAnterior: origen.clienteCodigo },
      fijado: false,
      origen: "manual",
      editadoPor: null,
      editadoAt: null,
    }));
    return [...lista, ...nuevos];
  };

  let resultado: BloqueTablero[];
  let foco: number | null = null;
  const afectados = new Set<string>();

  switch (op.tipo) {
    case "mover": {
      const b = buscar(op.id);
      comprobarDestino(op.agenteNumero, op.fecha);
      const fin = op.inicioMin + (b.finMin - b.inicioMin);
      comprobarRango(op.inicioMin, fin);
      if (b.agenteNumero === op.agenteNumero && b.fecha === op.fecha && b.inicioMin === op.inicioMin) return sinCambio;
      const destino = { inicioMin: op.inicioMin, finMin: fin };
      let lista = recortar(
        bloques.filter((x) => x.id !== b.id),
        op.agenteNumero,
        op.fecha,
        destino,
        null,
      );
      lista.push(marcar(b, "movido", { agenteNumero: op.agenteNumero, fecha: op.fecha, ...destino }));
      const mismoDia = b.agenteNumero === op.agenteNumero && b.fecha === op.fecha;
      lista = rellenarBase(lista, b, mismoDia ? restarTramos([b], [destino]) : [b]);
      resultado = lista;
      foco = b.id;
      afectados.add(clave(b.agenteNumero, b.fecha)).add(clave(op.agenteNumero, op.fecha));
      break;
    }
    case "redimensionar": {
      const b = buscar(op.id);
      comprobarRango(op.inicioMin, op.finMin);
      if (op.inicioMin === b.inicioMin && op.finMin === b.finMin) return sinCambio;
      const nuevo = { inicioMin: op.inicioMin, finMin: op.finMin };
      let lista = recortar([...bloques], b.agenteNumero, b.fecha, nuevo, b.id).map((x) =>
        x.id === b.id ? marcar(b, "ajustado", nuevo) : x,
      );
      lista = rellenarBase(lista, b, restarTramos([b], [nuevo]));
      resultado = lista;
      foco = b.id;
      afectados.add(clave(b.agenteNumero, b.fecha));
      break;
    }
    case "dividir": {
      const b = buscar(op.id);
      if (!(b.inicioMin < op.enMin && op.enMin < b.finMin) || (op.enMin - ctx.inicioDiaMin) % ctx.pasoMin !== 0) {
        throw new ErrorEdicion(`No se puede dividir ${rangoCorto(b.inicioMin, b.finMin)} a las ${horaCorta(op.enMin)}.`);
      }
      resultado = bloques.flatMap((x) =>
        x.id === b.id ? [{ ...b, finMin: op.enMin }, { ...b, id: nuevoId(), inicioMin: op.enMin }] : [x],
      );
      foco = b.id;
      afectados.add(clave(b.agenteNumero, b.fecha));
      break;
    }
    case "unir": {
      const b = buscar(op.id);
      const siguiente = bloques.find(
        (x) =>
          x.agenteNumero === b.agenteNumero &&
          x.fecha === b.fecha &&
          x.inicioMin === b.finMin &&
          x.clienteCodigo === b.clienteCodigo,
      );
      if (!siguiente) throw new ErrorEdicion("No hay un bloque contiguo del mismo cliente justo después.");
      const igual = b.origen === siguiente.origen && b.regla === siguiente.regla;
      const unido = igual
        ? { ...b, finMin: siguiente.finMin, fijado: b.fijado || siguiente.fijado }
        : marcar(b, "unido", { finMin: siguiente.finMin, fijado: b.fijado || siguiente.fijado });
      resultado = bloques.filter((x) => x.id !== siguiente.id).map((x) => (x.id === b.id ? unido : x));
      foco = b.id;
      afectados.add(clave(b.agenteNumero, b.fecha));
      break;
    }
    case "cambiarCliente": {
      const b = buscar(op.id);
      comprobarCliente(op.clienteCodigo);
      if (b.clienteCodigo === op.clienteCodigo) return sinCambio;
      resultado = bloques.map((x) => (x.id === b.id ? marcar(b, "cliente", { clienteCodigo: op.clienteCodigo }) : x));
      foco = b.id;
      afectados.add(clave(b.agenteNumero, b.fecha));
      break;
    }
    case "eliminar": {
      const b = buscar(op.id);
      resultado = bloques.filter((x) => x.id !== b.id);
      afectados.add(clave(b.agenteNumero, b.fecha));
      break;
    }
    case "fijar": {
      const b = buscar(op.id);
      if (b.fijado === op.fijado) return sinCambio;
      resultado = bloques.map((x) => (x.id === b.id ? { ...b, fijado: op.fijado } : x));
      foco = b.id;
      break;
    }
    case "quitarAusencias": {
      const quitar = ctx.ausencias.get(clave(op.agenteNumero, op.fecha)) ?? [];
      const pisan = bloques.filter(
        (x) => x.agenteNumero === op.agenteNumero && x.fecha === op.fecha && quitar.some((q) => solapan(q, x)),
      );
      if (pisan.length === 0) return sinCambio;
      const ids = new Set(pisan.map((x) => x.id));
      // Cada trozo que queda conserva lo que era; el primero, el id del bloque
      resultado = bloques.flatMap((x) =>
        ids.has(x.id) ? restarTramos([x], quitar).map((t, i) => ({ ...x, ...t, id: i === 0 ? x.id : nuevoId() })) : [x],
      );
      afectados.add(clave(op.agenteNumero, op.fecha));
      break;
    }
    case "crear": {
      comprobarDestino(op.agenteNumero, op.fecha);
      comprobarRango(op.inicioMin, op.finMin);
      comprobarCliente(op.clienteCodigo);
      const rango = { inicioMin: op.inicioMin, finMin: op.finMin };
      const debajo = bloques.filter((x) => x.agenteNumero === op.agenteNumero && x.fecha === op.fecha && solapan(x, rango));
      const anteriores = [...new Set(debajo.map((x) => x.clienteCodigo))];
      const lista = recortar([...bloques], op.agenteNumero, op.fecha, rango, null);
      const id = nuevoId();
      lista.push({
        id,
        agenteNumero: op.agenteNumero,
        fecha: op.fecha,
        ...rango,
        clienteCodigo: op.clienteCodigo,
        regla: "manual",
        datos: { accion: "creado", clienteAnterior: anteriores.length === 1 ? anteriores[0] : null },
        fijado: false,
        origen: "manual",
        editadoPor: null,
        editadoAt: null,
      });
      resultado = lista;
      foco = id;
      afectados.add(clave(op.agenteNumero, op.fecha));
      break;
    }
  }

  if (ctx.validacion && afectados.size > 0) {
    const nuevas = durasNuevas(bloques, resultado, afectados, ctx.validacion);
    if (nuevas.length > 0) return { ok: false, error: `No se puede: ${nuevas[0].mensaje}.` };
  }
  return { ok: true, bloques: resultado, cambia: true, foco };
}

/**
 * Resumen de la versión con las horas de los bloques actuales. La capacidad,
 * los objetivos, las bolsas y quién estaba activo son los del momento de
 * generar; solo cambian las horas planificadas.
 */
export function actualizarResumen(resumen: ResumenMotor, bloques: readonly BloqueBasico[]): ResumenMotor {
  const semanaDe = new Map(resumen.semanas.flatMap((s) => s.fechas.map((f) => [f, s.lunes] as const)));
  const vacio = () => Object.fromEntries(resumen.semanas.map((s) => [s.lunes, 0])) as Record<string, number>;
  const porCliente = new Map<string, { horas: number; porSemana: Record<string, number> }>();
  const porAgente = new Map<string, { horas: number; porCliente: Record<string, number>; porSemana: Record<string, number> }>();
  let total = 0;
  for (const b of bloques) {
    const h = (b.finMin - b.inicioMin) / 60;
    const lunes = semanaDe.get(b.fecha);
    total += h;
    const c = porCliente.get(b.clienteCodigo) ?? { horas: 0, porSemana: vacio() };
    c.horas += h;
    if (lunes) c.porSemana[lunes] += h;
    porCliente.set(b.clienteCodigo, c);
    const a = porAgente.get(b.agenteNumero) ?? { horas: 0, porCliente: {}, porSemana: vacio() };
    a.horas += h;
    a.porCliente[b.clienteCodigo] = (a.porCliente[b.clienteCodigo] ?? 0) + h;
    if (lunes) a.porSemana[lunes] += h;
    porAgente.set(b.agenteNumero, a);
  }
  return {
    ...resumen,
    planificadoH: total,
    clientes: resumen.clientes.map((c) => ({
      ...c,
      horas: porCliente.get(c.codigo)?.horas ?? 0,
      porSemana: porCliente.get(c.codigo)?.porSemana ?? vacio(),
    })),
    agentes: resumen.agentes.map((a) => ({
      ...a,
      horas: porAgente.get(a.numero)?.horas ?? 0,
      porCliente: porAgente.get(a.numero)?.porCliente ?? {},
      porSemana: porAgente.get(a.numero)?.porSemana ?? vacio(),
    })),
  };
}
