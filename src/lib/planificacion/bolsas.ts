// NOTA: solo servidor. Bolsas de horas del mes (en pantalla, «cupos»): la
// confirmada por supervisión o, si no la hay, la última anterior prorrateada
// por días laborables (1.324 h × 21/22 = 1.263,82 h). Los laborables son los
// del calendario del CLIENTE (si tiene y plan.cupoLaborablesCliente, decidido
// el 21/10/2026) o los de la plantilla. La usan el cargador del motor y la
// página /planificacion/[mes]/bolsas, así que las dos dan siempre la misma
// cifra.
import { asegurarCalendarios, calendarioDelCupo, calendarioPlan, laborablesEnCalendario } from "./calendarios";
import { esquemaParametrosCliente, prorratearBolsa, type BolsaMotor, type CalendarioEfectivo } from "./motor";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";

export interface DetalleBolsa {
  cliente: string;
  /** La bolsa con que se planifica (confirmada o prorrateada); null = sin bolsa. */
  bolsa: BolsaMotor | null;
  confirmada: { horas: number; origen: "prorrateo" | "manual"; por: string | null; at: Date | null } | null;
  /** El prorrateo por defecto (aunque haya confirmada, para comparar). */
  prorrateo: {
    horas: number;
    baseMes: string;
    baseHoras: number;
    laborablesBase: number;
    laborablesMes: number;
    /** Calendario con el que se cuentan los laborables. */
    calendario: string;
  } | null;
}

/**
 * Bolsas de `clientes` en `mes`. `calendarioDe` da el calendario con que se
 * cuentan los laborables de cada cliente; `cal`, el calendario ya leído.
 */
export function resolverBolsas(opciones: {
  mes: string;
  clientes: readonly string[];
  calendarioDe: (cliente: string) => string;
  cal: CalendarioEfectivo;
}): DetalleBolsa[] {
  const delMes = repo.leerBolsas(opciones.mes);
  const previas = repo.ultimasBolsasAnteriores(opciones.mes);
  const cache = new Map<string, number>();
  const laborables = (mes: string, calendario: string) => {
    const k = `${mes}|${calendario}`;
    if (!cache.has(k)) cache.set(k, laborablesEnCalendario(mes, calendario, opciones.cal));
    return cache.get(k)!;
  };
  const detalle: DetalleBolsa[] = [];
  for (const cliente of opciones.clientes) {
    const propia = delMes.find((b) => b.clienteCodigo === cliente);
    const previa = previas.find((b) => b.clienteCodigo === cliente);
    let prorrateo: DetalleBolsa["prorrateo"] = null;
    if (previa) {
      const calendario = opciones.calendarioDe(cliente);
      const laborablesBase = laborables(previa.mes, calendario);
      const laborablesMes = laborables(opciones.mes, calendario);
      prorrateo = {
        horas: prorratearBolsa(previa.horas, laborablesBase, laborablesMes),
        baseMes: previa.mes,
        baseHoras: previa.horas,
        laborablesBase,
        laborablesMes,
        calendario,
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

/** Calendario del cupo de cada cliente del equipo (su `parametros.calendario` o el de la plantilla). */
export function calendariosCupo(filas: readonly { codigo: string; parametros: unknown }[]): (cliente: string) => string {
  const p = leerParametrosPlan();
  const porCliente = new Map(
    filas.map((c) => {
      const r = esquemaParametrosCliente.safeParse(c.parametros ?? {});
      return [c.codigo, calendarioDelCupo(r.success ? r.data.calendario : null, p.cupoLaborablesCliente)];
    }),
  );
  return (cliente) => porCliente.get(cliente) ?? calendarioDelCupo(null, false);
}

/** Bolsas del mes de los clientes activos del equipo (página de cupos). */
export async function bolsasDelMes(mes: string): Promise<{ filas: DetalleBolsa[] }> {
  const p = leerParametrosPlan();
  await asegurarCalendarios("si-falta");
  const clientes = repo.leerClientes(p.equipo);
  const filas = resolverBolsas({
    mes,
    clientes: clientes.map((c) => c.codigo),
    calendarioDe: calendariosCupo(clientes),
    cal: calendarioPlan(),
  });
  return { filas };
}
