// NOTA: solo servidor. Reúne la entrada del motor desde SQLite (config y
// agregados propios) y RDBv2 solo para lo cacheado 24 h (festivos y
// horarios). El motor y el tablero no consultan RDBv2 en caliente.
import { ayerISO } from "@/lib/fechas";
import { festivosServicio, horariosServicio } from "@/lib/rdb/queries/planificacion";
import {
  ahtMedido,
  asignarCampanias,
  calcularLambda,
  calcularObjetivos,
  calcularRitmo,
  calcularTasaContacto,
  construirDias,
  desplazarMes,
  diasRango,
  esquemaParametrosCliente,
  expandirAusencias,
  expandirTurnos,
  factorEstacional,
  fechasDelMes,
  generarFranjas,
  horarioPorFecha,
  laborablesDelMes,
  semanasDelMes,
  sumarDias,
  ultimoDomingo,
  type AgenteMotor,
  type Aviso,
  type BloqueEntrada,
  type BolsaMotor,
  type ClienteMotor,
  type DemandaMotor,
  type EntradaMotor,
  type ObjetivoSemana,
} from "./motor";
import { resolverBolsas } from "./bolsas";
import { fueraDePlantilla, leerEquipo, prefijosSinCliente, ultimaSesionAgente } from "./equipo";
import { leerParametrosPlan } from "./parametros";
import * as repo from "./repositorio";

export interface OpcionesCarga {
  /** Último día cerrado con datos (por defecto, ayer). */
  hastaDatos?: string;
  /** Bloques que el motor debe respetar tal cual (regenerar «respetando mis cambios»). */
  fijados?: BloqueEntrada[];
  /**
   * Primer día que se planifica (recálculo de los lunes): las semanas
   * anteriores no reciben objetivo, porque sus bloques se conservan de la
   * versión de partida. Por defecto, el día 1 del mes.
   */
  desde?: string;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export async function cargarEntradaMotor(mes: string, opciones: OpcionesCarga = {}): Promise<EntradaMotor> {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error(`Mes no válido: ${mes} (YYYY-MM)`);
  const p = leerParametrosPlan();
  const fechaDatos = opciones.hastaDatos ?? ayerISO();
  const avisosCarga: Aviso[] = [];
  const fechasMes = fechasDelMes(mes);
  const inicioMes = fechasMes[0];
  const finMes = fechasMes[fechasMes.length - 1];
  const mesAnterior = desplazarMes(mes, -1);
  if (opciones.desde != null && (opciones.desde < inicioMes || opciones.desde > finMes)) {
    throw new Error(`El primer día a planificar (${opciones.desde}) no es de ${mes}`);
  }
  const inicioPlan = opciones.desde ?? inicioMes;

  // Ventanas de datos: semanas COMPLETAS que acaban en el último domingo
  const finVentana = ultimoDomingo(fechaDatos);
  const inicioDemanda = sumarDias(finVentana, -7 * p.semanasDemanda + 1);
  const desdeFestivos = [inicioDemanda, sumarDias(`${mesAnterior}-01`, -1)].sort()[0];
  const [festivos, horarios] = await Promise.all([festivosServicio(desdeFestivos, finMes), horariosServicio()]);

  const dias = construirDias({
    mes,
    semanaA: p.semanaA,
    servicioCalendario: p.servicioCalendario,
    festivos: festivos.festivos,
  });
  const semanas = semanasDelMes(dias);
  const franjas = generarFranjas(p.inicioDiaMin, p.finDiaMin, p.pasoMin);

  // ---------- Clientes ----------
  const filasClientes = repo.leerClientes(p.equipo);
  const clientes: ClienteMotor[] = filasClientes.map((c) => {
    const r = esquemaParametrosCliente.safeParse(c.parametros ?? {});
    if (!r.success) {
      throw new Error(`Parámetros del cliente ${c.codigo} no válidos: ${r.error.issues[0]?.message}`);
    }
    return {
      codigo: c.codigo,
      nombre: c.nombre,
      color: c.color,
      modo: c.modo,
      prioridad: c.prioridad,
      cuentaComo: c.cuentaComo,
      parametros: r.data,
      horario: horarioPorFecha(horarios, r.data.calendario, dias),
    };
  });
  const bases = clientes.filter((c) => c.modo === "resto");
  if (bases.length !== 1) {
    throw new Error(`Tiene que haber exactamente un cliente de modo «resto» en el equipo ${p.equipo} (hay ${bases.length})`);
  }
  const codigos = new Set(clientes.map((c) => c.codigo));
  const servicioDe = new Map(filasClientes.map((c) => [c.codigo, c.servicioAltitude]));

  // ---------- Usuarios y agentes ----------
  const eq = leerEquipo(p.equipo, fechaDatos);
  const { usuarios, clienteDeUsuario, agenteDeUsuario, plantilla, numerosPlantilla } = eq;
  const turnos = expandirTurnos(repo.leerAsignacionesTurno(), repo.leerPatrones(), dias);
  const ausencias = expandirAusencias(repo.leerAusencias(inicioMes, finMes), dias);

  const agentes: AgenteMotor[] = plantilla.map((a) => {
    const suyos = usuarios.filter((u) => u.agenteNumero === a.numero);
    const habilidades = [...new Set(suyos.map((u) => u.cliente).filter((c): c is string => !!c && codigos.has(c)))].sort();
    return {
      numero: a.numero,
      contratoSemanalH: a.contratoSemanalH,
      habilidades,
      turnos: turnos[a.numero] ?? {},
      ausencias: ausencias[a.numero] ?? [],
      // La persona está activa si ha usado CUALQUIERA de sus usuarios
      ultimaSesion: ultimaSesionAgente(eq, a.numero),
      forzarActivo: a.forzarActivo,
    };
  });

  // Horas de sesión por cliente (usuario → cliente) en un rango
  const horasPorCliente = (desde: string, hasta: string): Map<string, number> => {
    const m = new Map<string, number>();
    for (const f of repo.segundosSesionPorUsuarioDia(desde, hasta)) {
      const c = clienteDeUsuario.get(f.usrName);
      if (c) m.set(c, (m.get(c) ?? 0) + f.segundos / 3600);
    }
    return m;
  };

  // ---------- Demanda (Erlang) y tasa de contacto ----------
  const ventanaDemanda = diasRango(inicioDemanda, finVentana, p.servicioCalendario, festivos.festivos);
  const demanda: DemandaMotor[] = [];
  const tasaContacto: EntradaMotor["tasaContacto"] = [];
  for (const c of clientes) {
    const servicio = servicioDe.get(c.codigo);
    if (!servicio) continue;
    const filas = repo.demandaServicio(servicio, inicioDemanda, finVentana);
    if (c.modo === "objetivo") {
      for (const t of calcularTasaContacto(filas, franjas, p.pasoMin)) {
        tasaContacto.push({ cliente: c.codigo, inicioMin: t.inicioMin, tasa: r4(t.tasa) });
      }
    }
    const erlang = c.parametros.erlang;
    if (!erlang) continue;
    const aht = erlang.ahtSeg ?? ahtMedido(filas);
    if (aht == null) {
      avisosCarga.push({
        codigo: "demanda_sin_datos",
        gravedad: "info",
        cliente: c.codigo,
        mensaje: `${c.codigo}: sin entrantes atendidas de ${servicio} entre el ${inicioDemanda} y el ${finVentana}; no se calcula su mínimo`,
      });
      continue;
    }
    const mesAA = desplazarMes(mes, -12);
    const mesPrevioAA = desplazarMes(mes, -13);
    const factor =
      repo.hayDemandaMes(mesAA) && repo.hayDemandaMes(mesPrevioAA)
        ? factorEstacional(repo.entrantesServicioMes(servicio, mesAA), repo.entrantesServicioMes(servicio, mesPrevioAA))
        : null;
    demanda.push({
      cliente: c.codigo,
      lambda: calcularLambda(filas, ventanaDemanda, franjas, p.pasoMin).map((l) => ({ ...l, llamadasHora: r4(l.llamadasHora) })),
      ahtSeg: Math.round(aht * 100) / 100,
      slaPct: erlang.slaPct,
      umbralSeg: erlang.umbralSeg,
      margen: erlang.margen,
      factorEstacional: factor != null ? r4(factor) : null,
      aplicarEstacionalidad: p.estacionalidadAplicar,
    });
  }

  // ---------- Objetivos de los clientes salientes ----------
  const reparto = asignarCampanias(
    repo.campaniasConocidas(),
    filasClientes.map((c) => ({ codigo: c.codigo, campanias: c.campanias ?? [] })),
  );
  const diaSiguiente = sumarDias(fechaDatos, 1);
  const foto = repo.fotoListas(diaSiguiente);
  // Cierres posteriores a fechaDatos y anteriores a la foto: se suman a los
  // vivos para reconstruir cómo estaba la lista al cierre de fechaDatos.
  const cierresPosteriores =
    foto && foto.fecha > diaSiguiente ? repo.cierresRango(diaSiguiente, sumarDias(foto.fecha, -1)) : [];
  if (foto && foto.fecha > diaSiguiente) {
    avisosCarga.push({
      codigo: "listas_reconstruidas",
      gravedad: "info",
      mensaje: `No hay foto de listas del ${diaSiguiente}: se usa la del ${foto.fecha} sumando a los vivos los cierres posteriores al ${fechaDatos}`,
    });
  }

  const objetivos: ObjetivoSemana[] = [];
  const manuales = repo.leerObjetivosManuales(mes);
  for (const c of clientes.filter((x) => x.modo === "objetivo")) {
    const campanias = new Set(reparto.get(c.codigo) ?? []);
    const pc = c.parametros;

    // Estado de la lista (suma de sus campañas)
    let total: number | null = null;
    let vivos: number | null = null;
    if (foto) {
      const suyas = foto.filas.filter((f) => campanias.has(f.campania));
      if (suyas.length > 0) {
        total = suyas.reduce((a, f) => a + f.total, 0);
        vivos =
          suyas.reduce((a, f) => a + f.vivos, 0) +
          cierresPosteriores.filter((x) => campanias.has(x.campania)).reduce((a, x) => a + x.cierres, 0);
      }
    }
    if (total == null && pc.horasSemanaFijas == null) {
      avisosCarga.push({
        codigo: "lista_sin_datos",
        gravedad: "info",
        cliente: c.codigo,
        mensaje: `${c.codigo}: ninguna campaña de la foto de listas casa con ${JSON.stringify(filasClientes.find((f) => f.codigo === c.codigo)?.campanias)}; sin objetivo`,
      });
    }

    // Ritmo: cierres ÷ horas de sesión de sus usuarios, en las últimas semanas completas
    let ritmo: number | null = null;
    let ritmoOrigen: "medido" | "manual" | null = null;
    if (pc.ritmoManual != null) {
      ritmo = pc.ritmoManual;
      ritmoOrigen = "manual";
    } else {
      for (let n = p.semanasRitmo; n <= Math.max(p.semanasRitmo, p.semanasRitmoMax); n++) {
        const desde = sumarDias(finVentana, -7 * n + 1);
        const horas = horasPorCliente(desde, finVentana).get(c.codigo) ?? 0;
        if (horas < p.horasMinRitmo) continue;
        const cierres = repo
          .cierresRango(desde, finVentana)
          .filter((x) => campanias.has(x.campania))
          .reduce((a, x) => a + x.cierres, 0);
        ritmo = calcularRitmo(cierres, horas);
        if (ritmo != null && ritmo > 0) ritmoOrigen = "medido";
        else ritmo = null;
        break;
      }
      if (ritmo == null && pc.horasSemanaFijas == null) {
        avisosCarga.push({
          codigo: "ritmo_desconocido",
          gravedad: "info",
          cliente: c.codigo,
          mensaje: `${c.codigo}: sin horas o sin cierres en las últimas ${p.semanasRitmoMax} semanas; pon un «Ritmo fijo» en Configuración → Clientes`,
        });
      }
    }

    // Curva del mismo periodo del año anterior (misma semana, 52 semanas antes)
    let curvaAnterior: Record<string, number> | null = null;
    if (pc.curva === "anio_anterior") {
      const curva: Record<string, number> = {};
      for (const s of semanas) {
        const lunesAA = sumarDias(s.lunes, -364);
        curva[s.lunes] = Math.round((horasPorCliente(lunesAA, sumarDias(lunesAA, 6)).get(c.codigo) ?? 0) * 100) / 100;
      }
      if (Object.values(curva).some((h) => h > 0)) curvaAnterior = curva;
    }

    const semanasObjetivo = semanas.map((s) => {
      const validas = dias.filter(
        (d) => d.lunes === s.lunes && d.fecha >= inicioPlan && (pc.fechaFin == null || d.fecha <= pc.fechaFin),
      );
      return {
        lunes: s.lunes,
        laborables: validas.filter((d) => d.laborable).length,
        diasEntreSemana: validas.filter((d) => d.diaSemana < 5).length,
      };
    });
    // Lo planificado (versión vigente) entre el día siguiente a los datos y el
    // primer día de este plan: el resto del mes anterior al generar el
    // siguiente, o el resto de la semana en el recálculo. Ya trabaja la lista
    // y ya gasta contrato.
    const comprometidas = [
      ...repo.horasPlanificadasCliente(c.codigo, sumarDias(fechaDatos, 1), sumarDias(inicioPlan, -1)).values(),
    ].reduce((a, h) => a + h, 0);

    // Horas contratadas: el mes no pasa de lo que queda (contratadas − trabajadas
    // desde el inicio del contrato − lo ya planificado antes de este plan)
    let topeHoras: number | null = null;
    let consumo: { consumidas: number; comprometidas: number } | null = null;
    if (pc.horasContratadas != null) {
      if (pc.inicioContrato == null) {
        avisosCarga.push({
          codigo: "contrato_sin_inicio",
          gravedad: "info",
          cliente: c.codigo,
          mensaje: `${c.codigo}: tiene horas contratadas pero no «Contrato desde» (Configuración → Clientes); no se aplica el tope de contrato`,
        });
      } else {
        const consumidas =
          pc.inicioContrato <= fechaDatos ? (horasPorCliente(pc.inicioContrato, fechaDatos).get(c.codigo) ?? 0) : 0;
        consumo = { consumidas, comprometidas };
        topeHoras = Math.max(0, pc.horasContratadas - consumidas - comprometidas);
      }
    }

    const calculados = calcularObjetivos(
      {
        cliente: c.codigo,
        parametros: pc,
        total,
        vivos,
        ritmo,
        ritmoOrigen,
        curvaAnterior,
        topeHoras,
        horasYaPlanificadas: comprometidas,
      },
      semanasObjetivo,
      p.pasoMin,
    );
    const sinTope = calculados[0]?.detalle?.horasSinTope;
    if (topeHoras != null && consumo && typeof sinTope === "number" && sinTope > topeHoras) {
      const h = (x: number) => x.toLocaleString("es-ES", { maximumFractionDigits: 2 });
      avisosCarga.push({
        codigo: "contrato_limita",
        gravedad: "info",
        cliente: c.codigo,
        mensaje:
          `${c.codigo}: quedan ${h(topeHoras)} h de contrato (${h(pc.horasContratadas!)} h desde el ${pc.inicioContrato}; ` +
          `${h(consumo.consumidas)} trabajadas y ${h(consumo.comprometidas)} ya planificadas): el objetivo del mes se queda ahí en vez de ${h(sinTope)} h`,
        datos: { topeHoras, ...consumo, horasSinTope: sinTope },
      });
    }
    for (const o of calculados) {
      const manual = manuales.find((m) => m.clienteCodigo === c.codigo && m.semanaLunes === o.semanaLunes);
      objetivos.push(
        manual
          ? { cliente: c.codigo, semanaLunes: o.semanaLunes, horas: manual.horas, origen: "manual", detalle: { ...o.detalle, calculado: o.horas } }
          : o,
      );
    }
  }

  // ---------- Bolsas: la confirmada o la última anterior prorrateada ----------
  // Por laborables: 1.324 h de septiembre (22) → octubre (21) = 1.263,82 h
  const detalleBolsas = await resolverBolsas({
    mes,
    clientes: clientes.map((c) => c.codigo),
    laborablesMes: laborablesDelMes(dias),
    laborablesDe: async (otro) => {
      const fechas = fechasDelMes(otro);
      // Los festivos ya leídos valen si cubren ese mes entero (y su víspera)
      const fest =
        sumarDias(fechas[0], -1) >= desdeFestivos
          ? festivos.festivos
          : (await festivosServicio(sumarDias(fechas[0], -1), fechas[fechas.length - 1])).festivos;
      return laborablesDelMes(
        construirDias({ mes: otro, semanaA: p.semanaA, servicioCalendario: p.servicioCalendario, festivos: fest }),
      );
    },
  });
  const bolsas: BolsaMotor[] = detalleBolsas.flatMap((d) => (d.bolsa ? [d.bolsa] : []));

  // ---------- Experiencia: horas reales recientes por agente y cliente ----------
  const experiencia = new Map<string, number>();
  for (const f of repo.segundosSesionPorUsuarioDia(sumarDias(fechaDatos, -p.diasExperiencia + 1), fechaDatos)) {
    const c = clienteDeUsuario.get(f.usrName);
    const a = agenteDeUsuario.get(f.usrName);
    if (!c || !a || !numerosPlantilla.has(a)) continue;
    const k = `${a}|${c}`;
    experiencia.set(k, (experiencia.get(k) ?? 0) + f.segundos / 3600);
  }

  // ---------- Meta: avisos de la entrada ----------
  const vigenciaHorarios: Record<string, string> = {};
  for (const h of horarios) {
    if (!vigenciaHorarios[h.servicio] || h.hasta > vigenciaHorarios[h.servicio]) vigenciaHorarios[h.servicio] = h.hasta;
  }

  return {
    version: 1,
    mes,
    pasoMin: p.pasoMin,
    inicioDiaMin: p.inicioDiaMin,
    finDiaMin: p.finDiaMin,
    fechaDatos,
    clienteBase: bases[0].codigo,
    servicioCalendario: p.servicioCalendario,
    diasInactividad: p.diasInactividad,
    dias,
    agentes: agentes.sort((a, b) => a.numero.localeCompare(b.numero)),
    clientes,
    demanda,
    objetivos,
    bolsas,
    experiencia: [...experiencia.entries()]
      .map(([k, horas]) => {
        const [agente, cliente] = k.split("|");
        return { agente, cliente, horas: Math.round(horas * 100) / 100 };
      })
      .sort((a, b) => a.agente.localeCompare(b.agente) || a.cliente.localeCompare(b.cliente)),
    tasaContacto,
    fijados: opciones.fijados ?? [],
    meta: {
      prefijosSinCliente: prefijosSinCliente(eq, p.diasInactividad),
      fueraDePlantilla: fueraDePlantilla(eq, p.diasInactividad, codigos),
      ultimoAgregado: repo.ultimoAgregado(),
      vigenciaFestivos: festivos.ultimaFechaPorServicio,
      vigenciaHorarios,
      avisosCarga,
    },
  };
}
