import { differenceInCalendarDays, parseISO } from "date-fns";
import { semanasDelMes } from "./calendario";
import { franjaDentro, generarFranjas, horasTexto, rangoCorto, redondear2, solapan } from "./franjas";
import { calcularMinimos } from "./minimos";
import type {
  AgenteMotor,
  Aviso,
  BloqueMotor,
  ClienteMotor,
  EntradaMotor,
  MinimosDia,
  Regla,
  ResumenMotor,
  SalidaMotor,
} from "./tipos";
import { construirContexto, validarPlan } from "./validaciones";

// ============================================================
// Motor de reparto: generaliza plan.py del prototipo (29/09/2026).
// Función PURA y determinista: misma entrada → misma salida, sin I/O, sin
// Date.now() ni azar. Los empates se deshacen siempre por orden estable
// (fecha, nº de agente).
//
// Orden de las reglas:
//   1. Capacidad: turno A/B − ausencias − festivos del equipo. Fuera los
//      agentes sin sesión en plan.diasInactividad días (salvo forzados).
//   2. Base: todo el turno queda en el cliente `resto` (GH).
//   3. Mínimos: Erlang C por franja, solo dentro del horario del servicio.
//   4. Fijados: los bloques congelados se aplican tal cual.
//   5. Clientes `objetivo`, por prioridad: se coloca el (día, bloque) de mayor
//      puntuación = holguraMin − horasDía/k + w·contacto + bonus, sin bajar
//      la base de su mínimo. Lo que no cabe en una semana pasa a la siguiente.
//   6. Clientes `a_demanda` (Ávolo): sin bloques; solo resumen y alertas.
//   7. Fusión de franjas contiguas en bloques.
//   8. Comprobación: validarPlan + avisos de la entrada.
// ============================================================

interface Celda {
  cliente: string;
  regla: Regla;
  datos: Record<string, unknown>;
  fijado: boolean;
}

type Fila = (Celda | null)[];

const EPS = 1e-9;

function ordenPrioridad(a: ClienteMotor, b: ClienteMotor): number {
  return a.prioridad - b.prioridad || a.codigo.localeCompare(b.codigo);
}

export function generarPlan(entrada: EntradaMotor): SalidaMotor {
  const paso = entrada.pasoMin;
  const horasFranja = paso / 60;
  const franjas = generarFranjas(entrada.inicioDiaMin, entrada.finDiaMin, paso);
  const nF = franjas.length;
  const base = entrada.clienteBase;
  const clientes = new Map(entrada.clientes.map((c) => [c.codigo, c]));
  if (!clientes.has(base)) throw new Error(`El cliente base ${base} no está en la entrada`);
  const dias = entrada.dias;
  const diaPorFecha = new Map(dias.map((d) => [d.fecha, d]));
  const semanas = semanasDelMes(dias);
  const avisos: Aviso[] = [...entrada.meta.avisosCarga];
  const enBase = (c: string) => c === base || clientes.get(c)?.cuentaComo === base;

  // ---------- 1. Capacidad ----------
  const agentes = [...entrada.agentes].sort((a, b) => a.numero.localeCompare(b.numero));
  const activos: AgenteMotor[] = [];
  for (const a of agentes) {
    const diasSinSesion =
      a.ultimaSesion == null
        ? null
        : differenceInCalendarDays(parseISO(entrada.fechaDatos), parseISO(a.ultimaSesion));
    if (!a.forzarActivo && (diasSinSesion == null || diasSinSesion > entrada.diasInactividad)) {
      avisos.push({
        codigo: "agente_inactivo",
        gravedad: "info",
        agente: a.numero,
        mensaje:
          a.ultimaSesion == null
            ? `${a.numero}: sin ninguna sesión registrada; no se planifica (se puede forzar en configuración)`
            : `${a.numero}: sin sesiones desde el ${a.ultimaSesion} (${diasSinSesion} días); no se planifica`,
        datos: { ultimaSesion: a.ultimaSesion },
      });
      continue;
    }
    if (!a.habilidades.includes(base)) {
      avisos.push({
        codigo: "agente_sin_cliente_base",
        gravedad: "blanda",
        agente: a.numero,
        mensaje: `${a.numero}: no tiene usuario de ${base}; su turno no se puede usar como base`,
      });
      continue;
    }
    if (Object.keys(a.turnos).length === 0) {
      avisos.push({
        codigo: "agente_sin_turno",
        gravedad: "info",
        agente: a.numero,
        mensaje: `${a.numero}: sin patrón de turno este mes`,
      });
    }
    activos.push(a);
  }

  const plan = new Map<string, Fila>(); // `${fecha}|${agente}`
  const clave = (fecha: string, agente: string) => `${fecha}|${agente}`;
  const filasPorFecha = new Map<string, string[]>(); // fecha → agentes con fila
  const contador = new Map<string, number>(); // `${cliente}|${agente}|${fecha}` → franjas
  const contadorDia = new Map<string, number>(); // `${cliente}|${fecha}` → franjas

  const sumar = (cliente: string, agente: string, fecha: string, delta: number) => {
    const k = `${cliente}|${agente}|${fecha}`;
    contador.set(k, (contador.get(k) ?? 0) + delta);
    const kd = `${cliente}|${fecha}`;
    contadorDia.set(kd, (contadorDia.get(kd) ?? 0) + delta);
  };
  const obtenerFila = (fecha: string, agente: string): Fila => {
    const k = clave(fecha, agente);
    let fila = plan.get(k);
    if (!fila) {
      fila = new Array(nF).fill(null);
      plan.set(k, fila);
      const lista = filasPorFecha.get(fecha) ?? [];
      lista.push(agente);
      lista.sort();
      filasPorFecha.set(fecha, lista);
    }
    return fila;
  };
  const poner = (fecha: string, agente: string, i: number, celda: Celda) => {
    const fila = obtenerFila(fecha, agente);
    const anterior = fila[i];
    if (anterior) sumar(anterior.cliente, agente, fecha, -1);
    fila[i] = celda;
    sumar(celda.cliente, agente, fecha, 1);
  };

  const festivoEquipo = (fecha: string) =>
    diaPorFecha.get(fecha)?.festivos.includes(entrada.servicioCalendario) ?? false;
  const capacidadAgente = new Map<string, number>(); // franjas

  // ---------- 2. Base ----------
  for (const a of activos) {
    let total = 0;
    for (const d of dias) {
      const tramos = a.turnos[d.fecha] ?? [];
      if (tramos.length === 0 || festivoEquipo(d.fecha)) continue;
      const ausencias = a.ausencias.filter((x) => x.fecha === d.fecha);
      franjas.forEach((f, i) => {
        if (!franjaDentro(f, paso, tramos)) return;
        if (ausencias.some((x) => solapan(x, { inicioMin: f, finMin: f + paso }))) return;
        poner(d.fecha, a.numero, i, {
          cliente: base,
          regla: "base_turno",
          datos: { rotacion: d.rotacion },
          fijado: false,
        });
        total++;
      });
    }
    capacidadAgente.set(a.numero, total);
  }

  // ---------- 4. Fijados (antes de repartir: cuentan en cobertura y objetivos) ----------
  const fijados = [...entrada.fijados].sort(
    (a, b) =>
      a.fecha.localeCompare(b.fecha) || a.agenteNumero.localeCompare(b.agenteNumero) || a.inicioMin - b.inicioMin,
  );
  for (const fj of fijados) {
    if (!diaPorFecha.has(fj.fecha)) continue;
    franjas.forEach((f, i) => {
      if (fj.inicioMin <= f && f + paso <= fj.finMin) {
        poner(fj.fecha, fj.agenteNumero, i, {
          cliente: fj.clienteCodigo,
          regla: (fj.regla as Regla | undefined) ?? "fijado",
          datos: fj.datos ?? {},
          fijado: true,
        });
      }
    });
  }

  // ---------- 3. Mínimos (Erlang C) ----------
  const minimos: MinimosDia[] = calcularMinimos(entrada);
  const minimosCliente = new Map<string, Map<string, number[]>>();
  for (const m of minimos) {
    const porFecha = minimosCliente.get(m.cliente) ?? new Map<string, number[]>();
    porFecha.set(m.fecha, m.porFranja);
    minimosCliente.set(m.cliente, porFecha);
  }

  /** Agentes en el grupo de `cliente` (él o los que cuentan como él) en una franja. */
  const cobertura = (cliente: string, fecha: string, i: number): number => {
    let n = 0;
    for (const agente of filasPorFecha.get(fecha) ?? []) {
      const celda = plan.get(clave(fecha, agente))![i];
      if (celda && (celda.cliente === cliente || clientes.get(celda.cliente)?.cuentaComo === cliente)) n++;
    }
    return n;
  };
  const minimoBase = (fecha: string, i: number) => minimosCliente.get(base)?.get(fecha)?.[i] ?? 0;
  const holgura = (fecha: string, i: number) => cobertura(base, fecha, i) - minimoBase(fecha, i);

  const experiencia = new Map(entrada.experiencia.map((e) => [`${e.agente}|${e.cliente}`, e.horas]));
  const tasa = new Map(entrada.tasaContacto.map((t) => [`${t.cliente}|${t.inicioMin}`, t.tasa]));
  const conHabilidad = (cliente: string) => activos.filter((a) => a.habilidades.includes(cliente));
  const esBaseLibre = (fecha: string, agente: string, i: number) => {
    const celda = plan.get(clave(fecha, agente))?.[i];
    return celda != null && celda.cliente === base && !celda.fijado;
  };

  // ---------- 3b. Clientes `erlang` que no son la base: cubrir su mínimo ----------
  for (const c of [...clientes.values()].filter((x) => x.modo === "erlang" && x.codigo !== base).sort(ordenPrioridad)) {
    const mins = minimosCliente.get(c.codigo);
    if (!mins) continue;
    const candidatos = conHabilidad(c.codigo);
    for (const d of dias) {
      franjas.forEach((_, i) => {
        const minimo = mins.get(d.fecha)?.[i] ?? 0;
        while (cobertura(c.codigo, d.fecha, i) < minimo) {
          const libres = candidatos.filter(
            (a) => esBaseLibre(d.fecha, a.numero, i) && (enBase(c.codigo) || holgura(d.fecha, i) >= 1),
          );
          if (libres.length === 0) break;
          libres.sort(
            (a, b) =>
              (contador.get(`${c.codigo}|${a.numero}|${d.fecha}`) ?? 0) -
                (contador.get(`${c.codigo}|${b.numero}|${d.fecha}`) ?? 0) ||
              (experiencia.get(`${b.numero}|${c.codigo}`) ?? 0) - (experiencia.get(`${a.numero}|${c.codigo}`) ?? 0) ||
              a.numero.localeCompare(b.numero),
          );
          poner(d.fecha, libres[0].numero, i, {
            cliente: c.codigo,
            regla: "minimo_erlang",
            datos: { minimo },
            fijado: false,
          });
        }
      });
    }
  }

  // ---------- 5. Clientes `objetivo`, por prioridad ----------
  const objetivos = new Map<string, Map<string, number>>();
  for (const o of entrada.objetivos) {
    const m = objetivos.get(o.cliente) ?? new Map<string, number>();
    m.set(o.semanaLunes, (m.get(o.semanaLunes) ?? 0) + o.horas);
    objetivos.set(o.cliente, m);
  }
  const horasClienteFechas = (cliente: string, fechas: readonly string[]) =>
    fechas.reduce((acc, f) => acc + (contadorDia.get(`${cliente}|${f}`) ?? 0), 0) * horasFranja;
  const horasAgente = (cliente: string, agente: string, fechas: readonly string[]) =>
    fechas.reduce((acc, f) => acc + (contador.get(`${cliente}|${agente}|${f}`) ?? 0), 0) * horasFranja;

  for (const c of [...clientes.values()].filter((x) => x.modo === "objetivo").sort(ordenPrioridad)) {
    const p = c.parametros;
    const objetivosCliente = objetivos.get(c.codigo);
    const totalObjetivo = semanas.reduce((acc, s) => acc + (objetivosCliente?.get(s.lunes) ?? 0), 0);
    if (totalObjetivo <= 0) continue;
    const candidatosBloque = [...p.bloques].sort((a, b) => a.inicioMin - b.inicioMin || a.finMin - b.finMin);
    if (candidatosBloque.length === 0) {
      avisos.push({
        codigo: "cliente_sin_bloques",
        gravedad: "blanda",
        cliente: c.codigo,
        mensaje: `${c.codigo}: tiene objetivo (${horasTexto(totalObjetivo)}) pero ningún bloque candidato configurado`,
      });
      continue;
    }
    const agentesCliente = conHabilidad(c.codigo);
    const restaHolgura = !enBase(c.codigo);
    let arrastre = 0;
    const detalleSemanas: { semana: string; objetivo: number; asignado: number }[] = [];

    for (const s of semanas) {
      const objetivo = (objetivosCliente?.get(s.lunes) ?? 0) + arrastre;
      let asignado = horasClienteFechas(c.codigo, s.fechas);

      while (asignado + EPS < objetivo) {
        const maxFranjas = Math.ceil((objetivo - asignado) / horasFranja - EPS);
        let mejor: {
          puntuacion: number;
          fecha: string;
          idx: number[];
          agente: string;
          holgura: number;
          contacto: number | null;
          bonus: number;
        } | null = null;

        for (const fecha of s.fechas) {
          const d = diaPorFecha.get(fecha)!;
          if (!d.laborable) continue;
          if (p.fechaFin && fecha > p.fechaFin) continue;
          const horasDia = horasClienteFechas(c.codigo, [fecha]);
          for (const cand of candidatosBloque) {
            let idx = franjas.flatMap((f, i) => (cand.inicioMin <= f && f + paso <= cand.finMin ? [i] : []));
            if (idx.length === 0) continue;
            if (idx.length > maxFranjas) idx = idx.slice(0, maxFranjas);
            if (idx.some((i) => p.evitar.some((e) => solapan(e, { inicioMin: franjas[i], finMin: franjas[i] + paso }))))
              continue;
            if (c.horario && idx.some((i) => !franjaDentro(franjas[i], paso, c.horario![fecha] ?? []))) continue;
            const hol = Math.min(...idx.map((i) => holgura(fecha, i)));
            if (restaHolgura && hol < 1) continue;

            const libres = agentesCliente.filter((a) => {
              if (!idx.every((i) => esBaseLibre(fecha, a.numero, i))) return false;
              return respetaTopes(plan.get(clave(fecha, a.numero))!, idx, c, horasFranja);
            });
            if (libres.length === 0) continue;

            const tasas = idx.map((i) => tasa.get(`${c.codigo}|${franjas[i]}`));
            const conDato = tasas.filter((t): t is number => t != null);
            const contacto = conDato.length > 0 ? conDato.reduce((a, b) => a + b, 0) / conDato.length : null;
            const puntuacion = hol - horasDia / p.kDia + p.pesoContacto * (contacto ?? 0) + cand.bonus;
            if (mejor && puntuacion <= mejor.puntuacion + EPS) continue;

            // Quién: menos horas del cliente en la semana → menos ese día → sin
            // otro cliente ese día → más experiencia → nº
            const otroCliente = (a: AgenteMotor) =>
              plan.get(clave(fecha, a.numero))!.some((x) => x != null && !enBase(x.cliente) && x.cliente !== c.codigo)
                ? 1
                : 0;
            const elegido = [...libres].sort(
              (a, b) =>
                horasAgente(c.codigo, a.numero, s.fechas) - horasAgente(c.codigo, b.numero, s.fechas) ||
                horasAgente(c.codigo, a.numero, [fecha]) - horasAgente(c.codigo, b.numero, [fecha]) ||
                otroCliente(a) - otroCliente(b) ||
                (experiencia.get(`${b.numero}|${c.codigo}`) ?? 0) - (experiencia.get(`${a.numero}|${c.codigo}`) ?? 0) ||
                a.numero.localeCompare(b.numero),
            )[0];
            mejor = { puntuacion, fecha, idx, agente: elegido.numero, holgura: hol, contacto, bonus: cand.bonus };
          }
        }
        if (!mejor) break;

        const datos = {
          semana: s.lunes,
          holguraMin: mejor.holgura,
          contacto: mejor.contacto != null ? redondear2(mejor.contacto) : null,
          objetivoSemana: objetivo,
          asignadasSemana: asignado,
          arrastre,
          bonus: mejor.bonus,
          puntuacion: redondear2(mejor.puntuacion),
        };
        for (const i of mejor.idx) {
          poner(mejor.fecha, mejor.agente, i, { cliente: c.codigo, regla: "objetivo", datos, fijado: false });
        }
        asignado += mejor.idx.length * horasFranja;
      }
      arrastre = Math.max(0, objetivo - asignado);
      detalleSemanas.push({ semana: s.lunes, objetivo, asignado });
    }

    if (arrastre > EPS) {
      const total = horasClienteFechas(c.codigo, dias.map((d) => d.fecha));
      avisos.push({
        codigo: "objetivo_no_alcanzado",
        gravedad: "blanda",
        cliente: c.codigo,
        mensaje: `${c.codigo}: ${horasTexto(total)} planificadas de ${horasTexto(totalObjetivo)} (faltan ${horasTexto(arrastre)}); no hay más holgura sobre el mínimo de ${base} con agentes que tengan usuario`,
        datos: { planificadas: total, objetivo: totalObjetivo, faltan: arrastre, semanas: detalleSemanas },
      });
    }
  }

  // ---------- 6. Clientes `a_demanda`: sin bloques (solo resumen y alertas) ----------

  // ---------- 7. Fusión de franjas contiguas ----------
  const bloques: BloqueMotor[] = [];
  const claves = [...plan.keys()].sort();
  for (const k of claves) {
    const [fecha, agente] = k.split("|");
    const fila = plan.get(k)!;
    let actual: BloqueMotor | null = null;
    fila.forEach((celda, i) => {
      if (!celda) {
        actual = null;
        return;
      }
      const ini = franjas[i];
      if (
        actual &&
        actual.clienteCodigo === celda.cliente &&
        actual.regla === celda.regla &&
        actual.fijado === celda.fijado &&
        actual.finMin === ini
      ) {
        actual.finMin = ini + paso;
        return;
      }
      actual = {
        agenteNumero: agente,
        fecha,
        inicioMin: ini,
        finMin: ini + paso,
        clienteCodigo: celda.cliente,
        regla: celda.regla,
        datos: celda.datos,
        fijado: celda.fijado,
      };
      bloques.push(actual);
    });
  }

  // ---------- 8. Comprobación ----------
  avisos.push(...avisosEntrada(entrada));
  avisos.push(...validarPlan(bloques, construirContexto(entrada, minimos)));

  const resumen = construirResumen(entrada, bloques, capacidadAgente, activos, horasFranja);
  return { franjas, bloques, avisos, resumen, minimos };
}

/** ¿Colocar `cliente` en las franjas idx respeta sus topes por agente y día? */
function respetaTopes(fila: readonly (Celda | null)[], idx: readonly number[], cliente: ClienteMotor, horasFranja: number): boolean {
  const p = cliente.parametros;
  const simulada = fila.map((c, i) => (idx.includes(i) ? cliente.codigo : (c?.cliente ?? null)));
  const franjasCliente = simulada.filter((x) => x === cliente.codigo).length;
  if (p.maxHorasDiaAgente != null && franjasCliente * horasFranja > p.maxHorasDiaAgente + EPS) return false;
  let rachas = 0;
  let racha = 0;
  let maxRacha = 0;
  for (const x of simulada) {
    if (x === cliente.codigo) {
      if (racha === 0) rachas++;
      racha++;
      maxRacha = Math.max(maxRacha, racha);
    } else racha = 0;
  }
  if (p.maxBloquesDiaAgente != null && rachas > p.maxBloquesDiaAgente) return false;
  if (p.maxHorasSeguidas != null && maxRacha * horasFranja > p.maxHorasSeguidas + EPS) return false;
  return true;
}

/** Avisos que dependen solo de la entrada (datos caducados, prefijos, vigencias...). */
function avisosEntrada(entrada: EntradaMotor): Aviso[] {
  const avisos: Aviso[] = [];
  const meta = entrada.meta;
  if (meta.ultimoAgregado == null || meta.ultimoAgregado < entrada.fechaDatos) {
    avisos.push({
      codigo: "datos_caducados",
      gravedad: "info",
      mensaje:
        meta.ultimoAgregado == null
          ? "No hay agregados de planificación: ejecutar npm run planificacion:agregados"
          : `Los agregados llegan al ${meta.ultimoAgregado} y el plan se calcula con datos hasta el ${entrada.fechaDatos}`,
      datos: { ultimoAgregado: meta.ultimoAgregado, fechaDatos: entrada.fechaDatos },
    });
  }
  for (const u of meta.prefijosSinCliente) {
    avisos.push({
      codigo: "prefijo_sin_cliente",
      gravedad: "info",
      agente: u.agenteNumero,
      mensaje: `${u.usrName}: el prefijo ${u.prefijo}${u.sufijo} no corresponde a ningún cliente (¿cliente nuevo?)`,
      datos: { ...u },
    });
  }
  for (const f of meta.fueraDePlantilla) {
    avisos.push({
      codigo: "fuera_de_plantilla",
      gravedad: "info",
      agente: f.agenteNumero,
      mensaje: `${f.agenteNumero}: ${horasTexto(f.horas)} recientes en ${f.clientes.join(", ")} y no está en la plantilla del equipo`,
      datos: { ...f },
    });
  }
  const ultimoDia = entrada.dias[entrada.dias.length - 1]?.fecha;
  const calendarios = new Set([
    entrada.servicioCalendario,
    ...entrada.clientes.map((c) => c.parametros.calendario).filter((x): x is string => !!x),
  ]);
  for (const cal of [...calendarios].sort()) {
    const fest = meta.vigenciaFestivos[cal];
    const hor = meta.vigenciaHorarios[cal];
    const problemas: string[] = [];
    if (fest !== undefined && ultimoDia && fest < ultimoDia) problemas.push(`festivos hasta el ${fest}`);
    if (hor !== undefined && ultimoDia && hor < ultimoDia) problemas.push(`horarios hasta el ${hor}`);
    if (problemas.length > 0) {
      avisos.push({
        codigo: "festivos_sin_vigencia",
        gravedad: "info",
        mensaje: `${cal}: ${problemas.join(" y ")}; el mes se sale de la vigencia de las tablas de supervisión`,
        datos: { calendario: cal, festivosHasta: fest, horariosHasta: hor },
      });
    }
  }
  for (const d of entrada.demanda) {
    if (d.factorEstacional == null) continue;
    const pct = Math.round((d.factorEstacional - 1) * 100);
    avisos.push({
      codigo: "estacionalidad",
      gravedad: "info",
      cliente: d.cliente,
      mensaje: `${d.cliente}: el año pasado este mes tuvo un ${Math.abs(pct)} % ${pct < 0 ? "menos" : "más"} de entrantes que el anterior (factor ${d.factorEstacional.toFixed(2).replace(".", ",")}); ${d.aplicarEstacionalidad ? "se aplica" : "no se aplica"} al mínimo`,
      datos: { factor: d.factorEstacional, aplicada: d.aplicarEstacionalidad },
    });
  }
  return avisos;
}

function construirResumen(
  entrada: EntradaMotor,
  bloques: readonly BloqueMotor[],
  capacidadAgente: ReadonlyMap<string, number>,
  activos: readonly AgenteMotor[],
  horasFranja: number,
): ResumenMotor {
  const semanas = semanasDelMes(entrada.dias);
  const semanaDe = new Map(entrada.dias.map((d) => [d.fecha, d.lunes]));
  const entreSemana = entrada.dias.filter((d) => d.diaSemana < 5).length;
  const festivosEquipo = new Set(entrada.dias.filter((d) => d.festivos.includes(entrada.servicioCalendario)).map((d) => d.fecha));
  const turnoFestivosH = (a: AgenteMotor) =>
    [...festivosEquipo].reduce((h, f) => h + (a.turnos[f] ?? []).reduce((x, t) => x + (t.finMin - t.inicioMin) / 60, 0), 0);
  const horas = (b: BloqueMotor) => (b.finMin - b.inicioMin) / 60;
  const vacioSemanas = () => Object.fromEntries(semanas.map((s) => [s.lunes, 0])) as Record<string, number>;

  const clientesOrden = [...entrada.clientes].sort(ordenPrioridad);
  const clientes = clientesOrden.map((c) => {
    const porSemana = vacioSemanas();
    let total = 0;
    for (const b of bloques) {
      if (b.clienteCodigo !== c.codigo) continue;
      porSemana[semanaDe.get(b.fecha)!] += horas(b);
      total += horas(b);
    }
    const objetivo =
      c.modo === "objetivo"
        ? entrada.objetivos.filter((o) => o.cliente === c.codigo).reduce((a, o) => a + o.horas, 0)
        : null;
    return {
      codigo: c.codigo,
      horas: total,
      porSemana,
      objetivo,
      bolsa: entrada.bolsas.find((x) => x.cliente === c.codigo)?.horas ?? null,
    };
  });

  const idsActivos = new Set(activos.map((a) => a.numero));
  const agentes = [...entrada.agentes]
    .sort((a, b) => a.numero.localeCompare(b.numero))
    .map((a) => {
      const porCliente: Record<string, number> = {};
      const porSemana = vacioSemanas();
      let total = 0;
      for (const b of bloques) {
        if (b.agenteNumero !== a.numero) continue;
        porCliente[b.clienteCodigo] = (porCliente[b.clienteCodigo] ?? 0) + horas(b);
        porSemana[semanaDe.get(b.fecha)!] += horas(b);
        total += horas(b);
      }
      return {
        numero: a.numero,
        activo: idsActivos.has(a.numero),
        capacidadH: (capacidadAgente.get(a.numero) ?? 0) * horasFranja,
        horas: total,
        // Horas a cubrir en el mes: contrato ÷ 5 cada día de lunes a viernes menos el
        // turno de los festivos (que cuentan como trabajados, como en el saldo)
        contratoMesH:
          a.contratoSemanalH != null
            ? redondear2((a.contratoSemanalH * entreSemana) / 5 - turnoFestivosH(a))
            : null,
        porCliente,
        porSemana,
      };
    });

  return {
    capacidadH: [...capacidadAgente.values()].reduce((a, b) => a + b, 0) * horasFranja,
    planificadoH: bloques.reduce((a, b) => a + horas(b), 0),
    semanas,
    clientes,
    agentes,
  };
}

/** Texto corto de un bloque para logs y avisos: «0851 2026-10-05 UGR 11-14». */
export function textoBloque(b: Pick<BloqueMotor, "agenteNumero" | "fecha" | "clienteCodigo" | "inicioMin" | "finMin">): string {
  return `${b.agenteNumero} ${b.fecha} ${b.clienteCodigo} ${rangoCorto(b.inicioMin, b.finMin)}`;
}
