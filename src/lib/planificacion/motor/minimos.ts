import { minimoFranja } from "./erlang";
import { franjaDentro, generarFranjas } from "./franjas";
import type { EntradaMotor, MinimosDia } from "./tipos";

// ============================================================
// Mínimo de agentes por fecha y franja de los clientes con demanda (Erlang
// C), solo dentro del horario de su servicio. Sale únicamente de la entrada,
// así que el tablero lo recalcula en el navegador con la foto de la versión
// (la versión guarda la entrada, no los mínimos).
// ============================================================

export function calcularMinimos(entrada: EntradaMotor): MinimosDia[] {
  const paso = entrada.pasoMin;
  const franjas = generarFranjas(entrada.inicioDiaMin, entrada.finDiaMin, paso);
  const clientes = new Map(entrada.clientes.map((c) => [c.codigo, c]));
  const minimos: MinimosDia[] = [];
  for (const dem of [...entrada.demanda].sort((a, b) => a.cliente.localeCompare(b.cliente))) {
    const c = clientes.get(dem.cliente);
    if (!c) continue;
    const lambda = new Map(dem.lambda.map((l) => [`${l.diaSemana}|${l.inicioMin}`, l.llamadasHora]));
    const factor = dem.aplicarEstacionalidad && dem.factorEstacional ? dem.factorEstacional : 1;
    for (const d of entrada.dias) {
      const horario = c.horario ? (c.horario[d.fecha] ?? []) : null;
      const fila = franjas.map((f) => {
        if (horario ? !franjaDentro(f, paso, horario) : !d.laborable) return 0;
        const l = (lambda.get(`${d.diaEquivalente}|${f}`) ?? 0) * factor;
        return minimoFranja(l, dem.ahtSeg, dem.slaPct, dem.umbralSeg, dem.margen);
      });
      minimos.push({ fecha: d.fecha, cliente: c.codigo, porFranja: fila });
    }
  }
  return minimos;
}
