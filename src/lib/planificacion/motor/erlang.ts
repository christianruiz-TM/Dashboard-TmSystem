// ============================================================
// Erlang C: cuántos agentes hacen falta para atender un % de las llamadas
// antes de un umbral de espera. Es el mínimo de GH por franja.
//
//   A = λ (llamadas/hora) × AHT (s) / 3600          (erlangs)
//   P(espera) = Erlang C(n, A)
//   SL = 1 − P(espera) × e^(−(n − A) × umbral / AHT)
//
// Erlang C se calcula desde Erlang B con la recursión clásica, que no
// desborda (el prototipo usaba factoriales: con A grandes daba Infinity).
// ============================================================

/** Probabilidad de que una llamada espere, con n agentes y A erlangs. */
export function probabilidadEspera(n: number, erlangs: number): number {
  if (erlangs <= 0) return 0;
  if (n <= erlangs) return 1; // cola inestable: todas esperan
  // Erlang B iterativo: B(0) = 1; B(k) = A·B(k−1) / (k + A·B(k−1))
  let b = 1;
  for (let k = 1; k <= n; k++) b = (erlangs * b) / (k + erlangs * b);
  return (n * b) / (n - erlangs * (1 - b));
}

/** Nivel de servicio (0..1): fracción atendida antes de `umbralSeg`. */
export function nivelServicio(n: number, erlangs: number, ahtSeg: number, umbralSeg: number): number {
  if (erlangs <= 0) return 1;
  if (n <= erlangs) return 0;
  return 1 - probabilidadEspera(n, erlangs) * Math.exp((-(n - erlangs) * umbralSeg) / ahtSeg);
}

/**
 * Agentes necesarios (sin margen) para atender `slaPct` % de las llamadas en
 * menos de `umbralSeg` segundos. 0 si no hay llamadas.
 */
export function agentesErlang(
  llamadasHora: number,
  ahtSeg: number,
  slaPct: number,
  umbralSeg: number,
): number {
  const erlangs = (llamadasHora * ahtSeg) / 3600;
  if (!(erlangs > 0) || !(ahtSeg > 0)) return 0;
  const objetivo = slaPct / 100;
  let n = Math.max(1, Math.ceil(erlangs));
  // Tope de seguridad: con datos absurdos no colgar el navegador
  while (nivelServicio(n, erlangs, ahtSeg, umbralSeg) < objetivo && n < 10_000) n++;
  return n;
}

/**
 * Mínimo de agentes de una franja: Erlang + margen (los agentes de GH también
 * hacen salientes). Sin llamadas, 0: no se exige a nadie.
 */
export function minimoFranja(
  llamadasHora: number,
  ahtSeg: number,
  slaPct: number,
  umbralSeg: number,
  margen: number,
): number {
  const n = agentesErlang(llamadasHora, ahtSeg, slaPct, umbralSeg);
  return n > 0 ? n + margen : 0;
}
