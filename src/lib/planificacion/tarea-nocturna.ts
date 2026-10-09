// NOTA: solo servidor. Tarea nocturna de planificación (F5): ejecuta lo que
// decide nocturno.ts (puro) para una fecha. Una sola tarea, diaria e
// idempotente (`npm run planificacion:nocturno`, 02:15): ejecutarla dos veces
// seguidas no duplica nada. Cada paso va por separado; si fallan los
// agregados, no se genera ni se recalcula con datos viejos (la noche
// siguiente se pone al día). El resultado queda en app_settings para /admin
// y para el aviso de /planificacion.
import { registrarAuditoria } from "@/lib/auth/audit";
import { agregarPlanificacion } from "./agregados";
import { cargarEntradaMotor } from "./cargador";
import { generarBorrador, recalcularDesde } from "./generar";
import { resumenCambios } from "./guardar";
import { generarPlan, sumarDias } from "./motor";
import {
  AUTOR_NOCTURNO,
  decidirNocturno,
  type DecisionNocturno,
  type EjecucionNocturna,
  type NombrePaso,
  type PasoNocturno,
} from "./nocturno";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";
import { contarGravedades } from "./tablero";

const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const h2 = (h: number) => h.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const error = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function ejecutarTareaNocturna(opciones: {
  hoy: string;
  /** La fecha real de hoy: con otra (simulación con --hoy), no se hace la foto de listas. */
  hoyReal: string;
  /** Calcula y cuenta lo que haría, sin escribir nada. */
  simular: boolean;
  forzarRecalculo?: boolean;
  log?: (linea: string) => void;
}): Promise<{ decision: DecisionNocturno; ejecucion: EjecucionNocturna }> {
  const log = opciones.log ?? (() => {});
  const inicio = new Date();
  const p = leerParametrosPlan();
  const decision = decidirNocturno({
    hoy: opciones.hoy,
    diaGeneracion: p.diaGeneracion,
    ultimoAgregado: repo.ultimoAgregado(),
    ultimoRecalculo: repo.ultimoRecalculoNocturno(),
    versiones: repo.listarVersiones(),
    forzarRecalculo: opciones.forzarRecalculo,
  });
  const fechaDatos = sumarDias(opciones.hoy, -1);
  const pasos: PasoNocturno[] = [];
  const paso = (nombre: NombrePaso, ok: boolean, texto: string) => {
    pasos.push({ paso: nombre, ok, texto });
    log(`${ok ? "✔" : "✖"} ${texto}`);
  };

  // ---------- 1. Agregados (hasta ayer; nunca más allá del ayer real) ----------
  const ayerReal = sumarDias(opciones.hoyReal, -1);
  const desde = decision.agregados.desde;
  const hasta = decision.agregados.hasta < ayerReal ? decision.agregados.hasta : ayerReal;
  let agregadosOk = true;
  if (desde > hasta) {
    paso("agregados", true, `Agregados: nada que agregar (${dm(desde)} es posterior a ayer)`);
  } else if (opciones.simular) {
    paso("agregados", true, `Agregados: se harían del ${dm(desde)} al ${dm(hasta)} (simulación: no se escribe)`);
  } else {
    try {
      const foto = opciones.hoy === opciones.hoyReal;
      const r = await agregarPlanificacion({ desde, hasta, foto, hoy: opciones.hoy, log: (l) => log(`  ${l}`) });
      paso(
        "agregados",
        true,
        `Agregados del ${dm(desde)} al ${dm(hasta)}: ${r.totales.logado} islas de tiempo logado, ` +
          `${r.totales.sesiones} de sesión, ${r.totales.demanda} franjas de demanda, ${r.totales.cierres} filas de cierres` +
          (r.listas != null ? `; foto de ${r.listas} listas` : "; sin foto de listas (fecha simulada)") +
          ` (${(r.ms / 1000).toFixed(1).replace(".", ",")} s)`,
      );
    } catch (e) {
      agregadosOk = false;
      paso("agregados", false, `Agregados del ${dm(desde)} al ${dm(hasta)}: ${error(e)}`);
    }
  }

  // ---------- 2. Borrador del mes siguiente ----------
  if (decision.generar && !agregadosOk) {
    paso("generar", false, `Borrador de ${decision.generar}: no se genera porque fallaron los agregados`);
  } else if (decision.generar) {
    const mes = decision.generar;
    const t = Date.now();
    try {
      if (opciones.simular) {
        const salida = generarPlan(await cargarEntradaMotor(mes, { hastaDatos: fechaDatos }));
        const g = contarGravedades(salida.avisos);
        paso(
          "generar",
          true,
          `Borrador de ${mes}: saldría con ${salida.bloques.length} bloques y ${h2(salida.resumen.planificadoH)} h ` +
            `(${g.dura} duras, ${g.blanda} blandas; simulación: no se guarda)`,
        );
      } else {
        const r = await generarBorrador({ mes, modo: "nuevo", autor: AUTOR_NOCTURNO, hastaDatos: fechaDatos });
        registrarAuditoria({
          accion: "plan_generar",
          username: AUTOR_NOCTURNO,
          detalle:
            `mes=${mes} v${r.numero} tarea nocturna: borrador del mes siguiente bloques=${r.bloques} ` +
            `horas=${r.planificadoH} duras=${r.avisos.dura} blandas=${r.avisos.blanda} ${Date.now() - t} ms`,
        });
        paso(
          "generar",
          true,
          `Borrador de ${mes} creado (v${r.numero}): ${r.bloques} bloques, ${h2(r.planificadoH)} h, ` +
            `${r.avisos.dura} duras y ${r.avisos.blanda} blandas`,
        );
      }
    } catch (e) {
      paso("generar", false, `Borrador de ${mes}: ${error(e)}`);
    }
  }

  // ---------- 3. Recálculo de las semanas que no han empezado ----------
  if (decision.tocaRecalculo && !agregadosOk) {
    paso("recalcular", false, "Recálculo de la semana: no se hace porque fallaron los agregados");
  } else if (decision.tocaRecalculo) {
    let todosOk = true;
    if (decision.recalcular.length === 0) paso("recalcular", true, "Recálculo de la semana: ningún mes con semanas por empezar");
    for (const { mes, desde: desdeMes } of decision.recalcular) {
      const t = Date.now();
      try {
        const r = await recalcularDesde({
          mes,
          desde: desdeMes,
          autor: AUTOR_NOCTURNO,
          hastaDatos: fechaDatos,
          guardar: !opciones.simular,
        });
        if (r.estado === "sin_plan") {
          paso("recalcular", true, `Recálculo de ${mes}: sin plan`);
        } else if (r.estado === "sin_cambios") {
          paso("recalcular", true, `Recálculo de ${mes} desde el ${dm(desdeMes)}: sin cambios respecto a la v${r.base}`);
        } else {
          const texto =
            `Recálculo de ${mes} desde el ${dm(desdeMes)} sobre la v${r.base} (${r.baseEstado}): ` +
            `${r.cambios.length} tramos cambiados, ${h2(r.planificadoH)} h, ${r.avisos.dura} duras y ${r.avisos.blanda} blandas`;
          if (opciones.simular) {
            paso("recalcular", true, `${texto} (simulación: no se guarda)`);
            for (const linea of resumenCambios(r.cambios, 20).split("; ")) log(`    ${linea}`);
          } else {
            registrarAuditoria({
              accion: "plan_generar",
              username: AUTOR_NOCTURNO,
              detalle:
                `mes=${mes} v${r.numero} tarea nocturna: recálculo desde ${desdeMes} sobre la v${r.base} (${r.baseEstado}) ` +
                `fijados=${r.fijados} horas=${r.planificadoH} duras=${r.avisos.dura} blandas=${r.avisos.blanda} ` +
                `${Date.now() - t} ms; ${resumenCambios(r.cambios)}`,
            });
            paso("recalcular", true, `${texto} → borrador v${r.numero}`);
          }
        }
      } catch (e) {
        todosOk = false;
        paso("recalcular", false, `Recálculo de ${mes}: ${error(e)}`);
      }
    }
    // Si algo falló, la noche siguiente lo vuelve a intentar
    if (todosOk && !opciones.simular) repo.anotarRecalculoNocturno(decision.semana);
  }

  const ejecucion: EjecucionNocturna = {
    inicio: inicio.toISOString(),
    fin: new Date().toISOString(),
    hoy: opciones.hoy,
    ok: pasos.every((x) => x.ok),
    pasos,
  };
  if (!opciones.simular) repo.guardarEjecucionNocturna(ejecucion);
  return { decision, ejecucion };
}
