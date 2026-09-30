import type { LambdaFranja } from "./tipos";

// ============================================================
// Demanda a partir de los agregados de 30 min (agg_hora_servicio): λ por
// día de la semana y franja, tasa de contacto de las salientes y AHT.
// ============================================================

export interface FilaDemanda {
  fecha: string;
  inicioMin: number;
  entrantes: number;
  entrantesAtendidas: number;
  salientes: number;
  salientesAtendidas: number;
  segGestionEntrantes: number;
}

export interface DiaVentana {
  fecha: string;
  diaSemana: number;
  laborable: boolean;
}

/**
 * Llamadas por hora medias de cada (día de la semana, franja). El
 * denominador son los días LABORABLES de ese día de la semana en la
 * ventana, sin festivos, y no los días que tuvieron llamadas: contar solo
 * los días con llamadas inflaba las franjas flojas (un día con una sola
 * llamada a las 19 h pesaba como uno lleno). Los festivos tampoco suman en el
 * numerador.
 */
export function calcularLambda(
  filas: readonly FilaDemanda[],
  ventana: readonly DiaVentana[],
  franjas: readonly number[],
  pasoMin: number,
): LambdaFranja[] {
  const laborables = new Map<string, number>(); // fecha → diaSemana
  const diasPorSemana = new Array(7).fill(0);
  for (const d of ventana) {
    if (!d.laborable) continue;
    laborables.set(d.fecha, d.diaSemana);
    diasPorSemana[d.diaSemana]++;
  }
  const suma = new Map<string, number>();
  for (const f of filas) {
    const ds = laborables.get(f.fecha);
    if (ds === undefined) continue;
    const franja = franjas.find((i) => i <= f.inicioMin && f.inicioMin < i + pasoMin);
    if (franja === undefined) continue;
    const clave = `${ds}|${franja}`;
    suma.set(clave, (suma.get(clave) ?? 0) + f.entrantes);
  }
  const resultado: LambdaFranja[] = [];
  for (let ds = 0; ds < 7; ds++) {
    if (diasPorSemana[ds] === 0) continue;
    for (const franja of franjas) {
      const total = suma.get(`${ds}|${franja}`) ?? 0;
      resultado.push({
        diaSemana: ds,
        inicioMin: franja,
        llamadasHora: (total / diasPorSemana[ds]) * (60 / pasoMin),
      });
    }
  }
  return resultado;
}

/**
 * Tasa de contacto de las salientes por franja (atendidas ÷ intentos). Las
 * franjas con menos de `minIntentos` intentos no dan una tasa fiable y se
 * omiten (el motor las trata como 0).
 */
export function calcularTasaContacto(
  filas: readonly FilaDemanda[],
  franjas: readonly number[],
  pasoMin: number,
  minIntentos = 20,
): { inicioMin: number; tasa: number }[] {
  const intentos = new Map<number, number>();
  const atendidas = new Map<number, number>();
  for (const f of filas) {
    const franja = franjas.find((i) => i <= f.inicioMin && f.inicioMin < i + pasoMin);
    if (franja === undefined) continue;
    intentos.set(franja, (intentos.get(franja) ?? 0) + f.salientes);
    atendidas.set(franja, (atendidas.get(franja) ?? 0) + f.salientesAtendidas);
  }
  return franjas
    .filter((i) => (intentos.get(i) ?? 0) >= minIntentos)
    .map((i) => ({ inicioMin: i, tasa: (atendidas.get(i) ?? 0) / intentos.get(i)! }));
}

/** AHT medido (s) de las entrantes atendidas por humanos. null sin datos. */
export function ahtMedido(filas: readonly FilaDemanda[]): number | null {
  let seg = 0;
  let atendidas = 0;
  for (const f of filas) {
    seg += f.segGestionEntrantes;
    atendidas += f.entrantesAtendidas;
  }
  return atendidas > 0 ? seg / atendidas : null;
}

/**
 * Factor de estacionalidad: entrantes del mismo mes del año anterior ÷ las
 * del mes previo a ese (p. ej. oct-2025 / sep-2025). null si falta alguno.
 */
export function factorEstacional(entrantesMesAnterior: number, entrantesMesPrevio: number): number | null {
  if (!(entrantesMesAnterior > 0) || !(entrantesMesPrevio > 0)) return null;
  return entrantesMesAnterior / entrantesMesPrevio;
}
