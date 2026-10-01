// NOTA: solo servidor. Bolsas de horas del mes: la confirmada por supervisión
// o, si no la hay, la última anterior prorrateada por días laborables
// (1.324 h × 21/22 = 1.263,82 h). La usan el cargador del motor y la página
// /planificacion/[mes]/bolsas, así que las dos dan siempre la misma cifra.
import { festivosServicio } from "@/lib/rdb/queries/planificacion";
import { construirDias, fechasDelMes, laborablesDelMes, prorratearBolsa, sumarDias, type BolsaMotor } from "./motor";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";

export interface DetalleBolsa {
  cliente: string;
  /** La bolsa con que se planifica (confirmada o prorrateada); null = sin bolsa. */
  bolsa: BolsaMotor | null;
  confirmada: { horas: number; origen: "prorrateo" | "manual"; por: string | null; at: Date | null } | null;
  /** El prorrateo por defecto (aunque haya confirmada, para comparar). */
  prorrateo: { horas: number; baseMes: string; baseHoras: number; laborablesBase: number; laborablesMes: number } | null;
}

/**
 * Bolsas de `clientes` en `mes`. `laborablesDe` da los laborables de otro mes
 * (el de la bolsa de partida): el cargador reaprovecha los festivos que ya
 * ha leído.
 */
export async function resolverBolsas(opciones: {
  mes: string;
  clientes: readonly string[];
  laborablesMes: number;
  laborablesDe: (mes: string) => Promise<number>;
}): Promise<DetalleBolsa[]> {
  const delMes = repo.leerBolsas(opciones.mes);
  const previas = repo.ultimasBolsasAnteriores(opciones.mes);
  const cache = new Map<string, number>();
  const detalle: DetalleBolsa[] = [];
  for (const cliente of opciones.clientes) {
    const propia = delMes.find((b) => b.clienteCodigo === cliente);
    const previa = previas.find((b) => b.clienteCodigo === cliente);
    let prorrateo: DetalleBolsa["prorrateo"] = null;
    if (previa) {
      if (!cache.has(previa.mes)) cache.set(previa.mes, await opciones.laborablesDe(previa.mes));
      const laborablesBase = cache.get(previa.mes)!;
      prorrateo = {
        horas: prorratearBolsa(previa.horas, laborablesBase, opciones.laborablesMes),
        baseMes: previa.mes,
        baseHoras: previa.horas,
        laborablesBase,
        laborablesMes: opciones.laborablesMes,
      };
    }
    detalle.push({
      cliente,
      bolsa: propia
        ? { cliente, horas: propia.horas, origen: propia.origen }
        : prorrateo
          ? { cliente, horas: prorrateo.horas, origen: "prorrateo", base: { mes: prorrateo.baseMes, horas: prorrateo.baseHoras } }
          : null,
      confirmada: propia
        ? { horas: propia.horas, origen: propia.origen, por: propia.confirmadaPor, at: propia.confirmadaAt }
        : null,
      prorrateo,
    });
  }
  return detalle;
}

/** Laborables de un mes en el calendario del equipo (festivos de RDBv2, cacheados 24 h). */
export async function laborablesDeMes(mes: string): Promise<number> {
  const p = leerParametrosPlan();
  const fechas = fechasDelMes(mes);
  const { festivos } = await festivosServicio(sumarDias(fechas[0], -1), fechas[fechas.length - 1]);
  return laborablesDelMes(construirDias({ mes, semanaA: p.semanaA, servicioCalendario: p.servicioCalendario, festivos }));
}

/** Bolsas del mes de los clientes activos del equipo (página de bolsas). */
export async function bolsasDelMes(mes: string): Promise<{ laborablesMes: number; filas: DetalleBolsa[] }> {
  const p = leerParametrosPlan();
  const laborablesMes = await laborablesDeMes(mes);
  const filas = await resolverBolsas({
    mes,
    clientes: repo.leerClientes(p.equipo).map((c) => c.codigo),
    laborablesMes,
    laborablesDe: laborablesDeMes,
  });
  return { laborablesMes, filas };
}
