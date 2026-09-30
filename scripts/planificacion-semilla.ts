/**
 * Semilla del módulo de planificación: clientes, prefijos, colores, tipos de
 * ausencia, patrones de turno A/B y contratos (de temp/prototipo-planificacion/
 * modelo.py), parámetros y las bolsas de septiembre de 2026.
 *
 * Uso: npm run planificacion:semilla
 *
 * IDEMPOTENTE y respetuosa con lo que ya haya: solo inserta lo que falta. Un
 * agente se configura con la semilla mientras no tenga contrato (así sirve
 * aunque la sincronización de usuarios lo haya creado antes), y un patrón o
 * un turno solo se crean si no existen. Nunca pisa cambios de supervisión.
 *
 * Solo números de agente: los nombres salen de ph_e_user al sincronizar.
 */
export {};

type Tramo = [number, number];
const M: Tramo = [540, 840]; // 9-14
const PM: Tramo = [960, 1200]; // 16-20
const M10: Tramo = [600, 840]; // 10-14
const M11: Tramo = [660, 840]; // 11-14

/** Patrones por día de la semana (0 = lunes … 4 = viernes). */
const PATRONES: Record<string, Tramo[][]> = {
  "Partido L-X · J 10-14 y tarde · V tarde (39 h)": [[M, PM], [M, PM], [M, PM], [M10, PM], [PM]],
  "Partido L-X · mañanas J-V (37 h)": [[M, PM], [M, PM], [M, PM], [M], [M]],
  "Partido L · mañanas M-V (29 h)": [[M, PM], [M], [M], [M], [M]],
  "Partido L-M · tardes X-V (30 h)": [[M, PM], [M, PM], [PM], [PM], [PM]],
  "Mañanas L-V (25 h)": [[M], [M], [M], [M], [M]],
  "Partido L y X · mañanas M, J y V (33 h)": [[M, PM], [M], [M, PM], [M], [M]],
  "Partido L · M 10-14, X 11-14, J 10-14 con tarde · V tarde (36 h)": [[M, PM], [M10, PM], [M11, PM], [M10, PM], [PM]],
  "Partido L-M · mañanas X-V (33 h)": [[M, PM], [M, PM], [M], [M], [M]],
  "Partido L · M-X 10-14, J 11-14 con tarde · V tarde (36 h)": [[M, PM], [M10, PM], [M10, PM], [M11, PM], [PM]],
  "Partido L · tardes M-V (25 h)": [[M, PM], [PM], [PM], [PM], [PM]],
};
const T38 = "Partido L-X · J 10-14 y tarde · V tarde (39 h)";
const M38 = "Partido L-X · mañanas J-V (37 h)";

/** nº → [contrato semanal, patrón semana A, patrón semana B]. Rotación de septiembre de 2026. */
const AGENTES: Record<string, [number, string | null, string | null]> = {
  "0851": [30, "Partido L · mañanas M-V (29 h)", "Partido L-M · tardes X-V (30 h)"],
  "0892": [38, T38, M38],
  "0925": [38, T38, M38],
  "0940": [38, T38, M38],
  "0950": [25, null, null], // sin sesiones desde junio: sin turno hasta que supervisión lo confirme
  "0973": [38, M38, T38],
  "0985": [38, T38, M38],
  "1008": [25, "Partido L-M · tardes X-V (30 h)", "Partido L · mañanas M-V (29 h)"],
  "1045": [25, "Mañanas L-V (25 h)", "Mañanas L-V (25 h)"],
  "1048": [35, "Partido L y X · mañanas M, J y V (33 h)", "Partido L · M 10-14, X 11-14, J 10-14 con tarde · V tarde (36 h)"],
  "1067": [35, "Partido L-M · mañanas X-V (33 h)", "Partido L · M-X 10-14, J 11-14 con tarde · V tarde (36 h)"],
  "1086": [25, "Partido L · tardes M-V (25 h)", "Mañanas L-V (25 h)"],
  "1118": [25, "Mañanas L-V (25 h)", "Mañanas L-V (25 h)"],
};

const EQUIPO = "multicliente";

/**
 * Clientes del equipo multicliente. prioridad: orden en que el motor coloca
 * los clientes `objetivo` (menor primero). Bloques en minutos desde las 00:00.
 */
const CLIENTES = [
  {
    codigo: "GH", nombre: "Grupo Huertas", color: "#FFCCFF", servicioAltitude: "GrupoHuertas", cuentaComo: null,
    modo: "resto" as const, prioridad: 100, orden: 1, campanias: [] as string[],
    parametros: { calendario: "GrupoHuertas", erlang: { ahtSeg: null, slaPct: 80, umbralSeg: 20, margen: 1 } },
  },
  {
    codigo: "BD", nombre: "GH BBDD", color: "#FF99FF", servicioAltitude: "GrupoHuertas", cuentaComo: "GH",
    modo: "objetivo" as const, prioridad: 50, orden: 2, campanias: ["gh[_]bbdd[_]%"],
    // Restos sin contactos nuevos, solo rellamadas: ~88 cierres/semana a 6,9/h
    // ≈ 13 h; se fija un tope de 10 h/semana en las franjas valle de GH.
    parametros: {
      bloques: [{ inicioMin: 540, finMin: 660 }, { inicioMin: 1080, finMin: 1200 }],
      maxBloquesDiaAgente: 1, horasSemanaFijas: 10, kDia: 4, pesoContacto: 0,
    },
  },
  {
    codigo: "LX", nombre: "GH BBDD Lexus", color: "#CDA4E8", servicioAltitude: "GrupoHuertas", cuentaComo: "GH",
    modo: "objetivo" as const, prioridad: 40, orden: 3, campanias: ["gh[_]bbdd[_]lexus%"],
    // Lista nueva del 28/09/2026, sin historia: el ritmo de las BBDD de septiembre
    parametros: {
      bloques: [{ inicioMin: 540, finMin: 660 }, { inicioMin: 1080, finMin: 1200 }],
      maxBloquesDiaAgente: 1, ritmoManual: 6.9, kDia: 4, pesoContacto: 0,
    },
  },
  {
    codigo: "AV", nombre: "Ávolo", color: "#4E95D9", servicioAltitude: "Avolo", cuentaComo: null,
    modo: "a_demanda" as const, prioridad: 60, orden: 4, campanias: [] as string[],
    parametros: { calendario: "GrupoAvolo" },
  },
  {
    codigo: "UGR", nombre: "UGR · encuesta de egresados", color: "#C1E5F5", servicioAltitude: "UGR", cuentaComo: null,
    modo: "objetivo" as const, prioridad: 30, orden: 5, campanias: ["UGR[_]EGRE26"],
    // 28,32 % = 1.562 vivos de 5.516 con que acabó la lista de 2025 (UGR_EGRE).
    // Ritmo medido y reparto uniforme (decidido 30/09/2026): la curva de 2025
    // acababa a mediados de octubre y dejaba vacías las últimas semanas.
    parametros: {
      bloques: [{ inicioMin: 660, finMin: 840, bonus: 0.3 }, { inicioMin: 960, finMin: 1080, bonus: 0 }],
      evitar: [{ inicioMin: 1080, finMin: 1140 }],
      maxHorasDiaAgente: 5, pctVivosObjetivo: 28.32, curva: "uniforme", kDia: 6,
    },
  },
  {
    codigo: "CR", nombre: "Caja Rural", color: "#B4E5A2", servicioAltitude: "CajaRural", cuentaComo: null,
    // Solo la campaña EN CURSO: las anteriores (CajaR_Banca_26, acabada en
    // junio) conservan vivos que ya nadie va a llamar. Al empezar otra, se
    // cambia aquí el patrón (igual que UGR_EGRE26 frente a UGR_EGRE).
    modo: "objetivo" as const, prioridad: 10, orden: 6, campanias: ["CajaR[_]Autonomos[_]26"],
    parametros: {
      bloques: [{ inicioMin: 600, finMin: 720, bonus: 0.3 }, { inicioMin: 960, finMin: 1080 }],
      maxBloquesDiaAgente: 1, curva: "inicio",
    },
  },
  {
    codigo: "CEFF", nombre: "CEFF Zaragoza", color: "#F8CBAD", servicioAltitude: "CEFF", cuentaComo: null,
    modo: "objetivo" as const, prioridad: 20, orden: 7, campanias: ["CEFF%"],
    // Se mantiene el ritmo de septiembre: 4 h/semana en 18-20 h
    parametros: {
      bloques: [{ inicioMin: 1080, finMin: 1200 }],
      maxBloquesDiaAgente: 1, horasSemanaFijas: 4, curva: "uniforme",
    },
  },
];

const PREFIJOS: [string, string, string][] = [
  ["GH", "", "GH"],
  ["GH", "_BD", "BD"],
  ["GH", "_BD_LX", "LX"],
  ["Av", "", "AV"],
  ["UGR", "", "UGR"],
  ["CR", "", "CR"],
  ["CEFF", "", "CEFF"],
];

// computaComoTrabajada: pendiente de confirmar qué es RTO y qué ausencias
// justifican horas en el saldo (F4). De momento solo VAC y FEST.
const TIPOS_AUSENCIA: [string, string, string, boolean][] = [
  ["VAC", "Vacaciones", "#FF00FF", true],
  ["FEST", "Libranza por festivo", "#FF0000", true],
  ["AUS", "Ausencia", "#BFBFBF", false],
  ["RTO", "RTO", "#FFC000", false],
];

/** «Horas iniciales» de la plantilla de septiembre (Septiembre V1.xlsx, CZ168 y DB168). */
const BOLSAS_SEPTIEMBRE: [string, number][] = [
  ["GH", 1324],
  ["AV", 154],
];

async function main() {
  try {
    process.loadEnvFile();
  } catch {
    /* sin .env */
  }
  const { db } = await import("../src/lib/db/sqlite");
  const t = await import("../src/lib/db/schema");
  const { eq, isNull, and } = await import("drizzle-orm");
  const { CLAVES_PARAMETROS, esquemaParametrosPlan } = await import("../src/lib/planificacion/parametros");
  const { esquemaParametrosCliente } = await import("../src/lib/planificacion/motor/tipos");

  const cuenta = { clientes: 0, prefijos: 0, tipos: 0, patrones: 0, agentes: 0, turnos: 0, bolsas: 0, parametros: 0 };

  db.transaction((tx) => {
    for (const c of CLIENTES) {
      esquemaParametrosCliente.parse(c.parametros); // que la semilla sea válida
      const r = tx.insert(t.planClientes).values({ ...c, equipo: EQUIPO }).onConflictDoNothing().run();
      cuenta.clientes += r.changes;
    }
    for (const [prefijo, sufijo, clienteCodigo] of PREFIJOS) {
      cuenta.prefijos += tx.insert(t.planPrefijos).values({ prefijo, sufijo, clienteCodigo }).onConflictDoNothing().run().changes;
    }
    for (const [codigo, nombre, color, computaComoTrabajada] of TIPOS_AUSENCIA) {
      cuenta.tipos += tx
        .insert(t.planTiposAusencia)
        .values({ codigo, nombre, color, computaComoTrabajada })
        .onConflictDoNothing()
        .run().changes;
    }

    const idPatron = new Map<string, number>();
    for (const [nombre, dias] of Object.entries(PATRONES)) {
      const existente = tx.select().from(t.planPatrones).where(eq(t.planPatrones.nombre, nombre)).get();
      if (existente) {
        idPatron.set(nombre, existente.id);
        continue;
      }
      const { id } = tx.insert(t.planPatrones).values({ nombre }).returning({ id: t.planPatrones.id }).get();
      idPatron.set(nombre, id);
      dias.forEach((tramos, diaSemana) => {
        for (const [inicioMin, finMin] of tramos) {
          tx.insert(t.planPatronTramos).values({ patronId: id, diaSemana, inicioMin, finMin }).run();
        }
      });
      cuenta.patrones++;
    }

    for (const [numero, [contrato, a, b]] of Object.entries(AGENTES)) {
      const existente = tx.select().from(t.planAgentes).where(eq(t.planAgentes.numero, numero)).get();
      const valores = { contratoSemanalH: contrato, enPlantilla: true, equipo: EQUIPO, actualizadoAt: new Date() };
      if (!existente) {
        tx.insert(t.planAgentes).values({ numero, ...valores }).run();
        cuenta.agentes++;
      } else if (existente.contratoSemanalH == null) {
        // Creado por la sincronización de usuarios pero aún sin configurar
        tx.update(t.planAgentes).set(valores).where(and(eq(t.planAgentes.numero, numero), isNull(t.planAgentes.contratoSemanalH))).run();
        cuenta.agentes++;
      }
      const tieneTurno = tx.select().from(t.planAgenteTurnos).where(eq(t.planAgenteTurnos.agenteNumero, numero)).get();
      if (!tieneTurno && a && b) {
        tx.insert(t.planAgenteTurnos)
          .values({ agenteNumero: numero, patronAId: idPatron.get(a)!, patronBId: idPatron.get(b)!, desde: "2026-08-31" })
          .run();
        cuenta.turnos++;
      }
    }

    for (const [clienteCodigo, horas] of BOLSAS_SEPTIEMBRE) {
      cuenta.bolsas += tx
        .insert(t.planBolsas)
        .values({ mes: "2026-09", clienteCodigo, horas, origen: "manual", confirmadaPor: "semilla", confirmadaAt: new Date() })
        .onConflictDoNothing()
        .run().changes;
    }

    // Parámetros globales: se escriben los valores por defecto que falten, para
    // que se vean (y se puedan cambiar) en app_settings
    const porDefecto = esquemaParametrosPlan.parse({});
    for (const [prop, clave] of Object.entries(CLAVES_PARAMETROS) as [keyof typeof porDefecto, string][]) {
      cuenta.parametros += tx
        .insert(t.appSettings)
        .values({ clave, valor: JSON.stringify(porDefecto[prop]) })
        .onConflictDoNothing()
        .run().changes;
    }
  });

  console.log("✔ Semilla de planificación aplicada (solo lo que faltaba):");
  console.table(cuenta);
  process.exit(0);
}

main().catch((err) => {
  console.error("Error en la semilla:", err);
  process.exit(1);
});
