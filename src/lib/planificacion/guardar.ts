// NOTA: solo servidor. Guardar ediciones, publicar y quitar ausencias de los
// borradores: carga el mismo contexto que ve el tablero (foto de la versión
// con lo vivo encima), repite las operaciones con las funciones PURAS de
// edicion.ts sobre los bloques de la BBDD y vuelve a validar antes de
// escribir. Las Server Actions solo autorizan, validan la petición y auditan.
import {
  calcularMinimos,
  CODIGOS_VALIDACION,
  construirContexto,
  diffPlanes,
  fechasDelMes,
  textoCambio,
  validarPlan,
  type Aviso,
  type CambioPlan,
  type ResumenMotor,
} from "./motor";
import {
  actualizarResumen,
  aplicarOperaciones,
  construirContextoEdicion,
  durasNuevas,
  operacionesQuitarAusencias,
  type Operacion,
} from "./edicion";
import * as repo from "./repositorio";
import { agentesConFila, contarGravedades, type BloqueTablero } from "./tablero";
import { aBloqueTablero, cargarTablero } from "./vistas";

export type ResultadoGuardar =
  | {
      ok: true;
      revision: number;
      bloques: BloqueTablero[];
      cambios: CambioPlan[];
      filas: { insertados: number; actualizados: number; borrados: number };
    }
  | { ok: false; error: string; conflicto: boolean };

/** Contexto del tablero de una versión: el mismo que calcula el navegador. */
function contextoVersion(versionId: number) {
  const version = repo.leerVersion(versionId);
  if (!version) return null;
  const datos = cargarTablero(version.mes, version.id);
  if (!datos) return null;
  const validacion = construirContexto(datos.entrada, calcularMinimos(datos.entrada));
  const edicion = construirContextoEdicion(datos.entrada, agentesConFila(datos.activos, datos.bloques), validacion);
  return { version, datos, validacion, edicion };
}

const clavesDe = (...listas: (readonly BloqueTablero[])[]) =>
  new Set(listas.flatMap((l) => l.map((b) => `${b.agenteNumero}|${b.fecha}`)));

/** Avisos de la versión al día: los de generar que no son validaciones + las validaciones de ahora. */
function avisosAlDia(avisosVersion: unknown, validaciones: Aviso[]): Aviso[] {
  return [...((avisosVersion as Aviso[] | null) ?? []).filter((a) => !CODIGOS_VALIDACION.has(a.codigo)), ...validaciones];
}

/** Texto de los cambios para la auditoría (los primeros y cuántos más). */
export function resumenCambios(cambios: readonly CambioPlan[], max = 12): string {
  if (cambios.length === 0) return "sin cambios de cliente";
  const lista = cambios.slice(0, max).map((c) => textoCambio(c)).join("; ");
  return `${cambios.length} tramos: ${lista}${cambios.length > max ? `; … y ${cambios.length - max} más` : ""}`;
}

/**
 * Repite un lote de operaciones del tablero sobre el borrador y lo guarda.
 * Rechaza: versión que no es borrador o con otra revisión (conflicto: otra
 * persona guardó), operaciones que no se pueden aplicar y cualquier
 * incidencia DURA nueva, aunque el navegador se la haya saltado.
 */
export function guardarCambiosVersion(opciones: {
  versionId: number;
  revision: number;
  operaciones: readonly Operacion[];
  autor: string;
}): ResultadoGuardar {
  const ctx = contextoVersion(opciones.versionId);
  if (!ctx) return { ok: false, error: "La versión no existe.", conflicto: false };
  const { version, validacion, edicion } = ctx;
  if (version.estado !== "borrador") {
    return { ok: false, error: `La v${version.numero} ya no es un borrador (está ${version.estado}).`, conflicto: true };
  }
  if (version.revision !== opciones.revision) {
    return {
      ok: false,
      error: "Otra persona ha guardado cambios en este borrador desde que lo abriste.",
      conflicto: true,
    };
  }

  const original = repo.bloquesVersion(version.id);
  const antes = original.map(aBloqueTablero);
  const r = aplicarOperaciones(antes, opciones.operaciones, edicion);
  if (!r.ok) return { ok: false, error: `Operación ${r.indice + 1}: ${r.error}`, conflicto: false };
  const nuevas = durasNuevas(antes, r.bloques, clavesDe(antes, r.bloques), validacion);
  if (nuevas.length > 0) return { ok: false, error: `No se puede guardar: ${nuevas[0].mensaje}.`, conflicto: false };

  const cambios = diffPlanes(antes, r.bloques);
  const resumen = version.resumen as ResumenMotor | null;
  let filas;
  try {
    filas = repo.guardarEdicion({
      versionId: version.id,
      revision: opciones.revision,
      original,
      final: r.bloques,
      autor: opciones.autor,
      ahora: new Date(),
      avisos: avisosAlDia(version.avisos, validarPlan(r.bloques, validacion)),
      resumen: resumen ? actualizarResumen(resumen, r.bloques) : null,
    });
  } catch (e) {
    if (e instanceof repo.ConflictoVersion) return { ok: false, error: e.message, conflicto: true };
    throw e;
  }
  const { revision, ...contadores } = filas;
  return {
    ok: true,
    revision,
    bloques: repo.bloquesVersion(version.id).map(aBloqueTablero),
    cambios,
    filas: contadores,
  };
}

export type ResultadoPublicar =
  | { ok: true; numero: number; mes: string; blandas: number; sustituida: number | null; avisos: Aviso[] }
  | { ok: false; error: string };

/**
 * Publica un borrador. Con incidencias duras, no. Con avisos blandos, solo si
 * quien publica ha visto los mismos que hay ahora (`blandasVistas`) y escribe
 * un motivo, que queda en la versión y en la auditoría. Los avisos que cuentan
 * son los mismos que el tablero: validaciones de ahora + los de generar.
 */
export function publicarBorrador(opciones: {
  versionId: number;
  revision: number;
  blandasVistas: number;
  motivo: string;
  autor: string;
}): ResultadoPublicar {
  const ctx = contextoVersion(opciones.versionId);
  if (!ctx) return { ok: false, error: "La versión no existe." };
  const { version, datos, validacion } = ctx;
  if (version.estado !== "borrador") return { ok: false, error: `La v${version.numero} no es un borrador (está ${version.estado}).` };
  if (version.revision !== opciones.revision) {
    return { ok: false, error: "El borrador ha cambiado desde que lo abriste: recarga y revísalo antes de publicar." };
  }
  const incidencias = validarPlan(datos.bloques, validacion);
  const todos = [...datos.avisosGeneracion, ...incidencias];
  const recuento = contarGravedades(todos);
  if (recuento.dura > 0) {
    const primera = incidencias.find((a) => a.gravedad === "dura")!;
    return { ok: false, error: `No se puede publicar con ${recuento.dura} incidencias duras (${primera.mensaje}).` };
  }
  if (recuento.blanda !== opciones.blandasVistas) {
    return {
      ok: false,
      error: `Ahora hay ${recuento.blanda} avisos blandos y aceptaste ${opciones.blandasVistas}: recarga y revísalos.`,
    };
  }
  const motivo = opciones.motivo.trim();
  if (recuento.blanda > 0 && motivo.length < 10) {
    return { ok: false, error: `Para publicar con ${recuento.blanda} avisos hay que explicar el motivo (al menos 10 caracteres).` };
  }
  try {
    const r = repo.publicarVersion({
      versionId: version.id,
      revision: opciones.revision,
      autor: opciones.autor,
      ahora: new Date(),
      motivo: motivo || null,
      avisos: avisosAlDia(version.avisos, incidencias),
    });
    return {
      ok: true,
      numero: version.numero,
      mes: version.mes,
      blandas: recuento.blanda,
      sustituida: r.sustituida,
      avisos: todos.filter((a) => a.gravedad === "blanda"),
    };
  } catch (e) {
    if (e instanceof repo.ConflictoVersion) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Tras dar de alta una ausencia: en los BORRADORES de los meses que toca, se
 * recortan los bloques de ese agente que la pisan (el hueco queda libre). Las
 * publicadas no se tocan: la ausencia sale como incidencia dura hasta que se
 * haga un borrador nuevo. Devuelve lo cambiado por versión (para auditar).
 */
export function quitarAusenciaDeBorradores(opciones: {
  agenteNumero: string;
  desde: string;
  hasta: string;
  autor: string;
}): { mes: string; numero: number; cambios: CambioPlan[]; error?: string }[] {
  const meses = new Set<string>();
  for (let m = opciones.desde.slice(0, 7); m <= opciones.hasta.slice(0, 7); ) {
    meses.add(m);
    const [a, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
  }
  const resultado: { mes: string; numero: number; cambios: CambioPlan[]; error?: string }[] = [];
  for (const mes of meses) {
    const borrador = repo.borradorMes(mes);
    if (!borrador) continue;
    const ctx = contextoVersion(borrador.id);
    if (!ctx) continue;
    const dentro = new Set(fechasDelMes(mes).filter((f) => f >= opciones.desde && f <= opciones.hasta));
    const ops = operacionesQuitarAusencias(
      ctx.datos.bloques.filter((b) => b.agenteNumero === opciones.agenteNumero && dentro.has(b.fecha)),
      ctx.edicion,
    );
    if (ops.length === 0) continue;
    const r = guardarCambiosVersion({ versionId: borrador.id, revision: borrador.revision, operaciones: ops, autor: opciones.autor });
    resultado.push(
      r.ok
        ? { mes, numero: borrador.numero, cambios: r.cambios }
        : { mes, numero: borrador.numero, cambios: [], error: r.error },
    );
  }
  return resultado;
}
