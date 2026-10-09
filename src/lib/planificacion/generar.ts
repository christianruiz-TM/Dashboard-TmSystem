// NOTA: solo servidor. «Generar borrador» desde la web (Server Action) con la
// misma cadena que npm run planificacion:generar: cargador → motor → versión.
// También el recálculo de los lunes de la tarea nocturna.
import { actualizarResumen } from "./edicion";
import { cargarEntradaMotor } from "./cargador";
import {
  CODIGOS_VALIDACION,
  construirContexto,
  diffPlanes,
  generarPlan,
  validarPlan,
  type BloqueEntrada,
  type CambioPlan,
  type EntradaMotor,
  type Gravedad,
} from "./motor";
import { componerRecalculo, conservablesDesde, objetivosRecalculo } from "./nocturno";
import * as repo from "./repositorio";
import { contarGravedades } from "./tablero";

/**
 * - `nuevo`: no hay borrador (si lo hay, error: la pantalla pregunta antes).
 * - `respetar`: regenera conservando los bloques fijados o editados a mano del
 *   borrador actual (el motor los aplica tal cual y reparte el resto).
 * - `cero`: descarta el borrador actual y empieza de nuevo.
 * En los dos últimos, el borrador anterior queda como «descartada».
 */
export type ModoGenerar = "nuevo" | "respetar" | "cero";

export interface ResultadoGenerar {
  id: number;
  numero: number;
  bloques: number;
  fijados: number;
  planificadoH: number;
  avisos: Record<Gravedad, number>;
}

export async function generarBorrador(opciones: {
  mes: string;
  modo: ModoGenerar;
  autor: string;
  hastaDatos?: string;
}): Promise<ResultadoGenerar> {
  const existente = repo.borradorMes(opciones.mes) ?? null;
  if (existente && opciones.modo === "nuevo") {
    throw new Error(`Ya hay un borrador de ${opciones.mes} (v${existente.numero}): elige regenerarlo o empezar de cero`);
  }
  const fijados: BloqueEntrada[] =
    existente && opciones.modo === "respetar" ? repo.bloquesConservables(existente.id).map(comoFijado) : [];

  const entrada = await cargarEntradaMotor(opciones.mes, { hastaDatos: opciones.hastaDatos, fijados });
  const salida = generarPlan(entrada);
  const v = repo.crearBorrador({
    mes: opciones.mes,
    entrada,
    salida,
    autor: opciones.autor,
    origen: existente && opciones.modo === "respetar" ? "recalculo" : "motor",
    basadaEnId: existente?.id ?? null,
    reemplazar: existente != null,
    esperado: existente?.id ?? null,
  });
  return {
    ...v,
    bloques: salida.bloques.length,
    fijados: fijados.length,
    planificadoH: salida.resumen.planificadoH,
    avisos: contarGravedades(salida.avisos),
  };
}

/** Bloque guardado → bloque que el motor respeta tal cual. */
function comoFijado(b: ReturnType<typeof repo.bloquesVersion>[number]): BloqueEntrada {
  return {
    agenteNumero: b.agenteNumero,
    fecha: b.fecha,
    inicioMin: b.inicioMin,
    finMin: b.finMin,
    clienteCodigo: b.clienteCodigo,
    regla: b.origen === "manual" ? "manual" : "fijado",
    datos: b.datos ?? {},
  };
}

export type ResultadoRecalculo =
  | { estado: "sin_plan" }
  | { estado: "sin_cambios"; base: number; fijados: number }
  | {
      estado: "nuevo";
      /** Versión creada (null al simular). */
      id: number | null;
      numero: number | null;
      /** Versión de partida (la vigente: el borrador si lo hay; si no, la publicada). */
      base: number;
      baseEstado: string;
      fijados: number;
      cambios: CambioPlan[];
      planificadoH: number;
      avisos: Record<Gravedad, number>;
    };

/**
 * Recálculo de los lunes (tarea nocturna): rehace con los datos de hoy los
 * días desde `desde` (un lunes que aún no ha empezado) de la versión vigente.
 *
 * - Los días anteriores se conservan TAL CUAL (con su origen y quién los
 *   editó) y sus semanas guardan los objetivos con que se planificaron.
 * - Desde `desde`, el motor respeta los bloques fijados y los cambiados a
 *   mano, y los objetivos solo se reparten en esas semanas, descontando lo
 *   que ya está planificado entre los datos y `desde` (cargador).
 * - El resultado es un BORRADOR: si la vigente es la publicada, queda al
 *   lado; si es un borrador, lo sustituye (el anterior, «descartada»). Si no
 *   cambia ningún tramo, no se crea nada.
 */
export async function recalcularDesde(opciones: {
  mes: string;
  desde: string;
  autor: string;
  hastaDatos?: string;
  /** false: calcula y compara, pero no guarda. */
  guardar: boolean;
}): Promise<ResultadoRecalculo> {
  const versiones = repo.versionesMes(opciones.mes);
  const borrador = versiones.find((v) => v.estado === "borrador");
  const base = borrador ?? versiones.find((v) => v.estado === "publicada");
  if (!base) return { estado: "sin_plan" };
  const bloquesBase = repo.bloquesVersion(base.id);
  const fijados = conservablesDesde(bloquesBase, opciones.desde).map(comoFijado);

  const entrada = await cargarEntradaMotor(opciones.mes, {
    hastaDatos: opciones.hastaDatos,
    fijados,
    desde: opciones.desde,
  });
  const salida = generarPlan(entrada);
  const { conservados, nuevos } = componerRecalculo(bloquesBase, salida.bloques, opciones.desde);
  const final = [...conservados, ...nuevos];
  const cambios = diffPlanes(bloquesBase, final);
  if (cambios.length === 0) return { estado: "sin_cambios", base: base.numero, fijados: fijados.length };

  // Validaciones y resumen del mes ENTERO (días conservados incluidos)
  const avisos = [
    ...salida.avisos.filter((a) => !CODIGOS_VALIDACION.has(a.codigo)),
    ...validarPlan(final, construirContexto(entrada, salida.minimos)),
  ];
  const resumen = actualizarResumen(salida.resumen, final);
  const fotoBase = base.entradas as EntradaMotor | null;
  const entradaGuardada: EntradaMotor = {
    ...entrada,
    objetivos: objetivosRecalculo(fotoBase?.objetivos ?? [], entrada.objetivos, opciones.desde),
  };

  let v: { id: number; numero: number } | null = null;
  if (opciones.guardar) {
    v = repo.crearBorrador({
      mes: opciones.mes,
      entrada: entradaGuardada,
      salida: { bloques: nuevos, avisos, resumen },
      conservados,
      autor: opciones.autor,
      origen: "recalculo",
      basadaEnId: base.id,
      reemplazar: borrador != null,
      esperado: borrador?.id ?? null,
    });
  }
  return {
    estado: "nuevo",
    id: v?.id ?? null,
    numero: v?.numero ?? null,
    base: base.numero,
    baseEstado: base.estado,
    fijados: fijados.length,
    cambios,
    planificadoH: resumen.planificadoH,
    avisos: contarGravedades(avisos),
  };
}
