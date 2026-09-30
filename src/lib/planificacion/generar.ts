// NOTA: solo servidor. «Generar borrador» desde la web (Server Action) con la
// misma cadena que npm run planificacion:generar: cargador → motor → versión.
import { cargarEntradaMotor } from "./cargador";
import { generarPlan, type BloqueEntrada, type Gravedad } from "./motor";
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
    existente && opciones.modo === "respetar"
      ? repo.bloquesConservables(existente.id).map((b) => ({
          agenteNumero: b.agenteNumero,
          fecha: b.fecha,
          inicioMin: b.inicioMin,
          finMin: b.finMin,
          clienteCodigo: b.clienteCodigo,
          regla: b.origen === "manual" ? "manual" : "fijado",
          datos: b.datos ?? {},
        }))
      : [];

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
