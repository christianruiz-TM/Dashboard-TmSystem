import { sql } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

// ============================================================
// Esquema SQLite — datos PROPIOS del dashboard.
// Los datos de negocio (llamadas, agentes, campañas) viven en
// RDBv2 (SQL Server, solo lectura) y NO se modelan aquí.
// ============================================================

/** Roles disponibles. El scoping de `cliente` se aplica vía client_id. */
export const ROLES = ["admin", "direccion", "operaciones", "supervision", "cliente"] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Unidades de facturación configurables. `horas` son las PRODUCTIVAS (en
 * llamada, por campaña); `horas_logadas` es el tiempo logado (user_log) de
 * los usuarios del cliente y solo existe con ámbito servicio y prefijo.
 * `minutos_fijo`/`minutos_movil`: minutos de línea con el cliente según el
 * número marcado (tarificación, lib/tarificacion.ts); `ddi`: cuota mensual
 * por DDI en producción (tabla `ddis`). Añadidas el 14/10/2026.
 */
export const UNIDADES_FACTURACION = [
  "horas",
  "horas_logadas",
  "interacciones",
  "exitos",
  "leads",
  "minutos_fijo",
  "minutos_movil",
  "ddi",
] as const;
export type UnidadFacturacion = (typeof UNIDADES_FACTURACION)[number];

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    nombre: text("nombre").notNull(),
    rol: text("rol", { enum: ROLES }).notNull(),
    // Solo para rol `cliente`: a qué cliente pertenece el usuario
    clientId: integer("client_id").references(() => clients.id),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
      .notNull()
      .default(true),
    lastLogin: integer("last_login", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_users_rol").on(t.rol)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    // SHA-256 del token (el token en claro solo viaja en la cookie)
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_sessions_user").on(t.userId)],
);

export const clients = sqliteTable("clients", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/** Mapeo cliente ↔ campañas de Altitude (ph_campaign.shortname). */
export const clientCampaigns = sqliteTable(
  "client_campaigns",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    campaignShortname: text("campaign_shortname").notNull(),
  },
  (t) => [uniqueIndex("uq_client_campaign").on(t.clientId, t.campaignShortname)],
);

/**
 * Configuración de facturación. Cada línea aplica a un SERVICIO/cliente
 * (`serviceName`, lo habitual: todas sus campañas igual) o a una CAMPAÑA
 * concreta (`campaignShortname`, excepción que prevalece sobre la del
 * servicio). Exactamente uno de los dos va informado. Puede haber VARIAS
 * líneas por ámbito (modelos mixtos: p. ej. horas + éxitos).
 */
export const billingConfig = sqliteTable(
  "billing_config",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Ámbito CAMPAÑA (excepción): shortname de ph_campaign.
    campaignShortname: text("campaign_shortname"),
    // Ámbito SERVICIO (lo normal): name de ph_service.
    serviceName: text("service_name"),
    unidad: text("unidad", { enum: UNIDADES_FACTURACION }).notNull(),
    // Solo con unidad `horas_logadas`: prefijo de los usuarios de Altitude del
    // cliente (GH → cuentan GH_0851...; no GH_0851_BD ni Angeles).
    prefijoUsuario: text("prefijo_usuario"),
    // Precio por unidad en €. Opcional: si es NULL solo se muestran unidades.
    precioUnitario: real("precio_unitario"),
    notas: text("notas"),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
    // Solo con unidad `ddi`: cobrar la cuota solo los meses en que la campaña
    // tuvo llamadas. Depende del presupuesto del cliente: las bbdd de GH no
    // pagaron sus DDIs en julio y agosto de 2026, sin tanda (15/10/2026).
    soloConActividad: integer("solo_con_actividad", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [
    index("idx_billing_campaign").on(t.campaignShortname),
    index("idx_billing_service").on(t.serviceName),
  ],
);

/** Definición de SLA por servicio (ph_service.name). Default 80/20. */
export const slaConfig = sqliteTable("sla_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceName: text("service_name").notNull().unique(),
  umbralSeg: integer("umbral_seg").notNull().default(20),
  objetivoPct: integer("objetivo_pct").notNull().default(80),
});

/**
 * Resultados de actividad (regla 18): de la tabla ao_<servicio> de RDBv2,
 * qué columnas se analizan (niveles del desglose, en orden: resultado,
 * subresultado...) y qué valores cuentan como «no válido» para el ratio
 * neto. Una fila por servicio. Los nombres de tabla y columna se vuelven a
 * comprobar contra RDBv2 en cada consulta (lista blanca): van en el SQL
 * como identificadores, no como parámetros.
 */
export const resultadosConfig = sqliteTable("resultados_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  serviceName: text("service_name").notNull().unique(),
  tablaAo: text("tabla_ao").notNull(),
  columnas: text("columnas", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  // ph_table_schema_enum_value.code: únicos en toda la instalación
  codigosNoValidos: text("codigos_no_validos", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'`),
  actualizadoAt: integer("actualizado_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Objetivos de los resultados de actividad (semáforo de Supervisión →
 * Resultados). Mismo ámbito que billing_config: servicio (lo normal) o
 * campaña (excepción que prevalece). Los tres umbrales son opcionales;
 * vigencia de `desde` a `hasta` (sin `hasta`, indefinida).
 */
export const objetivosResultados = sqliteTable(
  "objetivos_resultados",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignShortname: text("campaign_shortname"),
    serviceName: text("service_name"),
    brutoMin: real("bruto_min"),
    netoMin: real("neto_min"),
    maxPctNoValidos: real("max_pct_no_validos"),
    desde: text("desde").notNull(), // 'YYYY-MM-DD'
    hasta: text("hasta"),
    notas: text("notas"),
  },
  (t) => [
    index("idx_obj_res_campaign").on(t.campaignShortname),
    index("idx_obj_res_service").on(t.serviceName),
  ],
);

/**
 * Agregados diarios por campaña, rellenados por scripts/aggregate-daily.ts.
 * Alimentan las tendencias de /direccion sin castigar itr_thread.
 * Todas las duraciones YA convertidas a segundos u horas (no décimas).
 */
export const aggDailyCampaign = sqliteTable(
  "agg_daily_campaign",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(), // 'YYYY-MM-DD'
    campaignShortname: text("campaign_shortname").notNull(),
    tipoCampania: text("tipo_campania"), // Inbound | Outbound | Blended...
    interacciones: integer("interacciones").notNull().default(0),
    inbound: integer("inbound").notNull().default(0),
    outbound: integer("outbound").notNull().default(0),
    atendidas: integer("atendidas").notNull().default(0),
    abandonadas: integer("abandonadas").notNull().default(0), // todos los orígenes
    // Abandonadas de ENTRADA (origin = 1): las que usa la tendencia de Dirección
    // (regla 6.b). NULL = fila agregada antes de existir la columna (29/09/2026):
    // se rellena al re-ejecutar `npm run agregados` sobre ese rango.
    abandonadasInbound: integer("abandonadas_inbound"),
    ahtSeg: real("aht_seg"),
    acwSeg: real("acw_seg"),
    talkSeg: real("talk_seg"),
    // OBSOLETAS: sumaban ag_in_cp_log por campaña, que duplica el tiempo
    // (~×13,8). Ya no se escriben. No usarlas: la hora logada real es global
    // (queries/agentes.ts::horasAgenteReales). Se mantienen para no romper las
    // filas históricas ya guardadas.
    horasLogadas: real("horas_logadas"),
    horasReady: real("horas_ready"),
    exitos: integer("exitos").notNull().default(0),
    leadsFinalizados: integer("leads_finalizados").notNull().default(0),
    actualizadoAt: integer("actualizado_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("uq_agg_fecha_campania").on(t.fecha, t.campaignShortname),
    index("idx_agg_fecha").on(t.fecha),
  ],
);

/**
 * Agregados diarios de los RATIOS DE ÉXITO por usuario de agente y campaña
 * (regla 17), rellenados por scripts/aggregate-daily.ts junto a
 * agg_daily_campaign. Alimentan la tendencia de conversión de /direccion.
 * Los éxitos y contactos salen de script_session (nunca uniendo con hilos);
 * las atendidas y la gestión, de los hilos de agentes humanos, sin contar
 * como gestión los de 2 h o más. Solo SUMAS: los ratios se calculan al leer.
 */
export const aggDailyAgentCampaign = sqliteTable(
  "agg_daily_agent_campaign",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(), // 'YYYY-MM-DD'
    agente: text("agente").notNull(), // usr_name
    nombre: text("nombre"),
    campaignShortname: text("campaign_shortname").notNull(),
    sesiones: integer("sesiones").notNull().default(0), // contactos gestionados
    exitos: integer("exitos").notNull().default(0),
    sinExito: integer("sin_exito").notNull().default(0),
    atendidas: integer("atendidas").notNull().default(0),
    productivoSeg: real("productivo_seg").notNull().default(0),
    actualizadoAt: integer("actualizado_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    uniqueIndex("uq_agg_ag_camp").on(t.fecha, t.agente, t.campaignShortname),
    index("idx_agg_ag_camp_fecha").on(t.fecha),
  ],
);

/** Auditoría de accesos y acciones sensibles. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ts: integer("ts", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    userId: integer("user_id"),
    username: text("username"),
    accion: text("accion").notNull(), // login_ok | login_fail | login_bloqueado | logout | crear_usuario | ...
    detalle: text("detalle"),
    ip: text("ip"),
  },
  (t) => [index("idx_audit_ts").on(t.ts)],
);

/** Ajustes clave/valor (frescura de flats, última agregación, etc.). */
export const appSettings = sqliteTable("app_settings", {
  clave: text("clave").primaryKey(),
  valor: text("valor").notNull(),
});

// ============================================================
// Maestros y cierres de facturación (14/10/2026): sustituyen a las hojas
// «LISTADO DDI DETALLE», «CAMP GS» y «facturacion cerrada» del Excel de
// facturación de operaciones. Los mantiene el rol operaciones.
// ============================================================

export const ESTADOS_DDI = ["en_produccion", "baja", "deshabilitado"] as const;
export type EstadoDdi = (typeof ESTADOS_DDI)[number];

/**
 * Inventario de DDIs (números de TmSystem). Cada fila es una ASIGNACIÓN de un
 * número a una campaña durante un período: el mismo número se reasigna (en
 * el Excel de operaciones, 354 de 482 números tienen 2 o 3 filas, p. ej. la
 * campaña de Altitude v7 y luego la de v8), así que `numero` no es único; lo
 * que no puede haber es el mismo número activo dos veces a la vez.
 * Se factura la cuota del MES ENTERO por cada asignación activa algún día del
 * mes: `fecha_alta` ≤ fin de mes y sin `fecha_baja` o con ella ≥ inicio de mes
 * (lib/ddis.ts). El estado es descriptivo; mandan las fechas. Nunca se borra:
 * se da de baja.
 */
export const ddis = sqliteTable(
  "ddis",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    numero: text("numero").notNull(),
    // ph_campaign.shortname; null = sin campaña (no se factura)
    campaignShortname: text("campaign_shortname"),
    estado: text("estado", { enum: ESTADOS_DDI }).notNull(),
    fechaAlta: text("fecha_alta"), // YYYY-MM-DD, puesta en producción
    fechaBaja: text("fecha_baja"), // YYYY-MM-DD; null = sigue activo
    fechaSolicitud: text("fecha_solicitud"),
    versionAltitude: text("version_altitude"), // «Alt V8»
    huntGroup: text("hunt_group"),
    accountCode: text("account_code"),
    lineaIntermedia: text("linea_intermedia"),
    departamento: text("departamento"),
    tipoUso: text("tipo_uso"),
    uso: text("uso"),
    clienteGs: text("cliente_gs"),
    empresa: text("empresa"),
    nombreCampania: text("nombre_campania"),
    centro: text("centro"),
    campaniaGs: text("campania_gs"),
    sentido: text("sentido"),
    unidadNegocio: text("unidad_negocio"),
    marca: text("marca"),
    notas: text("notas"),
    actualizadoPor: text("actualizado_por"),
    actualizadoAt: integer("actualizado_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_ddis_campania").on(t.campaignShortname), index("idx_ddis_numero").on(t.numero)],
);

/** Código de cada campaña de Altitude en GS (albaranes). */
export const campaniasGs = sqliteTable("campanias_gs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignShortname: text("campaign_shortname").notNull().unique(),
  // Texto: lleva ceros a la izquierda (0002330)
  codigoGs: text("codigo_gs").notNull(),
  denominacion: text("denominacion"),
  clienteGs: text("cliente_gs"),
  presupuestoGs: text("presupuesto_gs"),
  fechaInicio: text("fecha_inicio"), // YYYY-MM-DD
  fechaFin: text("fecha_fin"),
  notas: text("notas"),
  actualizadoPor: text("actualizado_por"),
  actualizadoAt: integer("actualizado_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const ESTADOS_CIERRE = ["cerrado", "reabierto"] as const;
export const ORIGENES_CIERRE = ["dashboard", "importado"] as const;

/**
 * Cierre de la facturación de un mes y servicio: foto fija de lo que se
 * facturó, con los precios de entonces. Como mucho uno «cerrado» por mes y
 * servicio; reabrirlo (solo admin) lo deja «reabierto» como histórico.
 */
export const facturacionCierres = sqliteTable(
  "facturacion_cierres",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mes: text("mes").notNull(), // YYYY-MM
    servicio: text("servicio").notNull(),
    estado: text("estado", { enum: ESTADOS_CIERRE }).notNull(),
    origen: text("origen", { enum: ORIGENES_CIERRE }).notNull(),
    importeTotal: real("importe_total"),
    cerradoPor: text("cerrado_por"),
    cerradoAt: integer("cerrado_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    reabiertoPor: text("reabierto_por"),
    reabiertoAt: integer("reabierto_at", { mode: "timestamp" }),
    notas: text("notas"),
  },
  (t) => [
    index("idx_fact_cierres_mes").on(t.mes),
    uniqueIndex("uq_fact_cierre_cerrado").on(t.mes, t.servicio).where(sql`estado = 'cerrado'`),
  ],
);

export const TIPOS_AJUSTE_CIERRE = ["quitar", "precio"] as const;
export type TipoAjusteCierre = (typeof TIPOS_AJUSTE_CIERRE)[number];

/**
 * Ajuste manual de una línea de un mes cerrado (15/10/2026): decisiones
 * puntuales de dirección que ninguna regla deduce (julio de 2026: las bbdd a
 * precios distintos; agosto: no facturarlas). La línea original no se toca:
 * el ajuste la quita o le cambia el precio, siempre con motivo, y se puede
 * deshacer. Como mucho uno por línea.
 */
export const facturacionCierreAjustes = sqliteTable(
  "facturacion_cierre_ajustes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cierreId: integer("cierre_id")
      .notNull()
      .references(() => facturacionCierres.id, { onDelete: "cascade" }),
    lineaId: integer("linea_id")
      .notNull()
      .references(() => facturacionCierreLineas.id, { onDelete: "cascade" }),
    tipo: text("tipo", { enum: TIPOS_AJUSTE_CIERRE }).notNull(),
    // Solo con tipo «precio»
    precioNuevo: real("precio_nuevo"),
    motivo: text("motivo").notNull(),
    autor: text("autor").notNull(),
    creadoAt: integer("creado_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_fact_ajustes_cierre").on(t.cierreId), uniqueIndex("uq_fact_ajuste_linea").on(t.lineaId)],
);

/** Líneas de un cierre: una por campaña y unidad. */
export const facturacionCierreLineas = sqliteTable(
  "facturacion_cierre_lineas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cierreId: integer("cierre_id")
      .notNull()
      .references(() => facturacionCierres.id, { onDelete: "cascade" }),
    // shortname; en el histórico importado, el nombre que traía el Excel
    campania: text("campania").notNull(),
    codigoGs: text("codigo_gs"),
    unidad: text("unidad", { enum: UNIDADES_FACTURACION }).notNull(),
    cantidad: real("cantidad").notNull(),
    precioUnitario: real("precio_unitario"),
    importe: real("importe"),
  },
  (t) => [index("idx_fact_cierre_lineas").on(t.cierreId)],
);

// ============================================================
// Módulo «Planificación de turnos» (docs/plan-planificacion.md).
// Configuración, plan versionado y agregados propios. Todo en MINUTOS
// desde las 00:00 (inicioMin/finMin) para que pasar de franjas de 1 h a
// 30 min sea cambiar el parámetro plan.pasoMin, no el modelo.
// Los parámetros globales NO tienen tabla: van en app_settings con claves
// plan.* (src/lib/planificacion/parametros.ts).
// ============================================================

/** Cómo decide el motor las horas de un cliente de planificación. */
export const MODOS_CLIENTE_PLAN = ["erlang", "objetivo", "a_demanda", "resto"] as const;
export type ModoClientePlan = (typeof MODOS_CLIENTE_PLAN)[number];

export const ESTADOS_VERSION_PLAN = [
  "borrador",
  "publicada",
  "sustituida",
  "descartada",
  "simulacion",
] as const;
export type EstadoVersionPlan = (typeof ESTADOS_VERSION_PLAN)[number];

export const ORIGENES_VERSION_PLAN = ["motor", "copia", "recalculo", "importada"] as const;
export const ORIGENES_BLOQUE_PLAN = ["motor", "manual"] as const;
export const ORIGENES_BOLSA_PLAN = ["prorrateo", "manual"] as const;
export const ORIGENES_OBJETIVO_PLAN = ["calculado", "manual"] as const;

/**
 * Cliente de planificación. NO es lo mismo que un servicio de Altitude: GH,
 * su BBDD (BD) y Lexus (LX) son tres clientes del mismo servicio GrupoHuertas,
 * porque se trabajan con usuarios distintos (GH_0851, GH_0851_BD,
 * GH_1067_BD_LX). `cuentaComo` = código del cliente en cuya cobertura cuenta
 * (BD y LX → GH).
 */
export const planClientes = sqliteTable("plan_clientes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  codigo: text("codigo").notNull().unique(),
  nombre: text("nombre").notNull(),
  color: text("color").notNull(), // hex #RRGGBB
  equipo: text("equipo").notNull().default("multicliente"),
  servicioAltitude: text("servicio_altitude"), // ph_service.name
  cuentaComo: text("cuenta_como"),
  modo: text("modo", { enum: MODOS_CLIENTE_PLAN }).notNull(),
  prioridad: integer("prioridad").notNull().default(100),
  // Patrones LIKE de ph_campaign.shortname (p. ej. 'gh_bbdd_%'). Si una
  // campaña casa con varios clientes gana el patrón más específico.
  campanias: text("campanias", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  // JSON validado con zod (motor/tipos.ts → esquemaParametrosCliente)
  parametros: text("parametros", { mode: "json" }).$type<Record<string, unknown>>().notNull().default(sql`'{}'`),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

/** Prefijo (+ sufijo) de usr_name → cliente de planificación. */
export const planPrefijos = sqliteTable(
  "plan_prefijos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    prefijo: text("prefijo").notNull(), // 'GH', 'UGR', 'Av', 'Soc_Fed'...
    sufijo: text("sufijo").notNull().default(""), // '' | '_BD' | '_BD_LX' | '_RE'...
    clienteCodigo: text("cliente_codigo").notNull(),
  },
  (t) => [uniqueIndex("uq_plan_prefijo").on(t.prefijo, t.sufijo)],
);

export const planTiposAusencia = sqliteTable("plan_tipos_ausencia", {
  codigo: text("codigo").primaryKey(), // VAC, AUS, RTO, FEST...
  nombre: text("nombre").notNull(),
  color: text("color").notNull(),
  // Para el saldo (F4): la ausencia cuenta como hora trabajada
  computaComoTrabajada: integer("computa_como_trabajada", { mode: "boolean" }).notNull().default(false),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});

/**
 * Agente = persona, identificada por su nº de 4 dígitos ('0851'). Los nombres
 * NO se guardan aquí salvo el alias que ponga supervisión: salen de
 * ph_e_user.fullname al sincronizar (plan_agente_usuarios).
 */
export const planAgentes = sqliteTable("plan_agentes", {
  numero: text("numero").primaryKey(),
  alias: text("alias"),
  contratoSemanalH: real("contrato_semanal_h"),
  enPlantilla: integer("en_plantilla", { mode: "boolean" }).notNull().default(false),
  equipo: text("equipo"),
  // Se planifica aunque lleve más de plan.diasInactividad días sin sesión
  forzarActivo: integer("forzar_activo", { mode: "boolean" }).notNull().default(false),
  notas: text("notas"),
  actualizadoAt: integer("actualizado_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Usuarios de Altitude de cada agente: uno por cliente
 * (<PREFIJO>_<nº>[_SUFIJO]). Las habilidades del agente son los clientes de
 * sus usuarios. clienteCodigo NULL = prefijo sin mapear (aviso «cliente nuevo»).
 */
export const planAgenteUsuarios = sqliteTable(
  "plan_agente_usuarios",
  {
    usrName: text("usr_name").primaryKey(),
    agenteNumero: text("agente_numero").notNull(),
    altitudeCode: integer("altitude_code"),
    prefijo: text("prefijo").notNull(),
    sufijo: text("sufijo").notNull().default(""),
    clienteCodigo: text("cliente_codigo"),
    fullname: text("fullname"),
    ultimaSesion: text("ultima_sesion"), // YYYY-MM-DD (de agg_sesion_usuario)
    sincronizadoAt: integer("sincronizado_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_plan_usr_agente").on(t.agenteNumero)],
);

export const planPatrones = sqliteTable("plan_patrones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});

export const planPatronTramos = sqliteTable(
  "plan_patron_tramos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    patronId: integer("patron_id")
      .notNull()
      .references(() => planPatrones.id, { onDelete: "cascade" }),
    diaSemana: integer("dia_semana").notNull(), // 0 = lunes … 6 = domingo
    inicioMin: integer("inicio_min").notNull(),
    finMin: integer("fin_min").notNull(),
  },
  (t) => [index("idx_plan_tramos_patron").on(t.patronId)],
);

/**
 * Patrón de turno de un agente en un periodo, con rotación A/B semanal. La
 * semana es A si las semanas transcurridas desde plan.semanaA son pares.
 */
export const planAgenteTurnos = sqliteTable(
  "plan_agente_turnos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agenteNumero: text("agente_numero").notNull(),
    patronAId: integer("patron_a_id").references(() => planPatrones.id),
    patronBId: integer("patron_b_id").references(() => planPatrones.id),
    desde: text("desde").notNull(), // YYYY-MM-DD
    hasta: text("hasta"), // null = sin fin
  },
  (t) => [index("idx_plan_turnos_agente").on(t.agenteNumero)],
);

/** Versión del plan de un mes. Como mucho un borrador por mes. */
export const planVersiones = sqliteTable(
  "plan_versiones",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mes: text("mes").notNull(), // YYYY-MM
    numero: integer("numero").notNull(),
    estado: text("estado", { enum: ESTADOS_VERSION_PLAN }).notNull(),
    origen: text("origen", { enum: ORIGENES_VERSION_PLAN }).notNull(),
    basadaEnId: integer("basada_en_id"),
    // Concurrencia optimista: cada guardado exige la revisión leída
    revision: integer("revision").notNull().default(0),
    // Foto de mínimos, objetivos, bolsas y parámetros usados: el plan se
    // explica aunque luego cambien los datos
    entradas: text("entradas", { mode: "json" }),
    avisos: text("avisos", { mode: "json" }),
    resumen: text("resumen", { mode: "json" }),
    creadaPor: text("creada_por"),
    creadaAt: integer("creada_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    publicadaPor: text("publicada_por"),
    publicadaAt: integer("publicada_at", { mode: "timestamp" }),
    motivoPublicacion: text("motivo_publicacion"),
  },
  (t) => [
    uniqueIndex("uq_plan_version_numero").on(t.mes, t.numero),
    // Refuerzo en la BBDD de «un solo borrador por mes»
    uniqueIndex("uq_plan_version_borrador").on(t.mes).where(sql`estado = 'borrador'`),
  ],
);

export const planBloques = sqliteTable(
  "plan_bloques",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    versionId: integer("version_id")
      .notNull()
      .references(() => planVersiones.id, { onDelete: "cascade" }),
    agenteNumero: text("agente_numero").notNull(),
    fecha: text("fecha").notNull(), // YYYY-MM-DD
    inicioMin: integer("inicio_min").notNull(),
    finMin: integer("fin_min").notNull(),
    clienteCodigo: text("cliente_codigo").notNull(),
    origen: text("origen", { enum: ORIGENES_BLOQUE_PLAN }).notNull(),
    // El motor no lo toca al regenerar
    fijado: integer("fijado", { mode: "boolean" }).notNull().default(false),
    regla: text("regla").notNull(),
    datos: text("datos", { mode: "json" }).$type<Record<string, unknown>>(),
    editadoPor: text("editado_por"),
    editadoAt: integer("editado_at", { mode: "timestamp" }),
  },
  (t) => [
    index("idx_plan_bloques_fecha").on(t.versionId, t.fecha),
    index("idx_plan_bloques_agente").on(t.versionId, t.agenteNumero),
  ],
);

/** Ausencias: son hechos, sin versiones. inicio/fin null = jornada completa. */
export const planAusencias = sqliteTable(
  "plan_ausencias",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agenteNumero: text("agente_numero").notNull(),
    tipoCodigo: text("tipo_codigo").notNull(),
    desde: text("desde").notNull(), // YYYY-MM-DD
    hasta: text("hasta").notNull(),
    inicioMin: integer("inicio_min"),
    finMin: integer("fin_min"),
    notas: text("notas"),
    creadoPor: text("creado_por"),
    creadoAt: integer("creado_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [
    index("idx_plan_ausencias_agente").on(t.agenteNumero),
    index("idx_plan_ausencias_fechas").on(t.desde, t.hasta),
  ],
);

/** Bolsa de horas por mes y cliente (confirmada por supervisión). */
export const planBolsas = sqliteTable(
  "plan_bolsas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mes: text("mes").notNull(),
    clienteCodigo: text("cliente_codigo").notNull(),
    horas: real("horas").notNull(),
    origen: text("origen", { enum: ORIGENES_BOLSA_PLAN }).notNull(),
    confirmadaPor: text("confirmada_por"),
    confirmadaAt: integer("confirmada_at", { mode: "timestamp" }),
  },
  (t) => [uniqueIndex("uq_plan_bolsa").on(t.mes, t.clienteCodigo)],
);

/** Horas objetivo por semana de los clientes `objetivo`. Manual prevalece. */
export const planObjetivos = sqliteTable(
  "plan_objetivos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    mes: text("mes").notNull(),
    clienteCodigo: text("cliente_codigo").notNull(),
    semanaLunes: text("semana_lunes").notNull(),
    horas: real("horas").notNull(),
    origen: text("origen", { enum: ORIGENES_OBJETIVO_PLAN }).notNull(),
    detalle: text("detalle", { mode: "json" }),
  },
  (t) => [uniqueIndex("uq_plan_objetivo").on(t.mes, t.clienteCodigo, t.semanaLunes)],
);

/**
 * Demanda por servicio y franja de 30 min (días cerrados), rellenada por
 * scripts/planificacion-agregados.ts. Guarda SUMAS, nunca medias. Sin IVR_ ni
 * Test_. Franjas de 30 min aunque el plan vaya por horas: así pasar a 30 min
 * no obliga a recalcular el histórico.
 */
export const aggHoraServicio = sqliteTable(
  "agg_hora_servicio",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(),
    servicio: text("servicio").notNull(), // ph_service.name
    inicioMin: integer("inicio_min").notNull(),
    entrantes: integer("entrantes").notNull().default(0),
    entrantesAtendidas: integer("entrantes_atendidas").notNull().default(0),
    entrantesAbandonadas: integer("entrantes_abandonadas").notNull().default(0),
    entrantesRechazadas: integer("entrantes_rechazadas").notNull().default(0), // ts = 7
    salientes: integer("salientes").notNull().default(0),
    salientesAtendidas: integer("salientes_atendidas").notNull().default(0),
    // Gestión de entrantes atendidas por humanos, en SEGUNDOS, sin hilos de
    // más de plan.maxSegHilo (CEFF tiene duraciones imposibles)
    segGestionEntrantes: real("seg_gestion_entrantes").notNull().default(0),
  },
  (t) => [
    uniqueIndex("uq_agg_hora_servicio").on(t.fecha, t.servicio, t.inicioMin),
    index("idx_agg_hora_fecha").on(t.fecha),
  ],
);

/**
 * Islas de sesión (op_type 0) por USUARIO de Altitude y día cerrado: la unión
 * de sus intervalos, sin el ×13 de sumar por campaña (regla 11). Recortadas
 * al día. inicioSeg/finSeg = segundos desde las 00:00 de `fecha` (0..86400).
 */
export const aggSesionUsuario = sqliteTable(
  "agg_sesion_usuario",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(),
    usrName: text("usr_name").notNull(),
    inicioSeg: integer("inicio_seg").notNull(),
    finSeg: integer("fin_seg").notNull(),
  },
  (t) => [
    index("idx_agg_sesion_fecha").on(t.fecha),
    index("idx_agg_sesion_usr").on(t.usrName, t.fecha),
  ],
);

/**
 * Tiempo LOGADO por usuario de Altitude y día cerrado: unión de sus sesiones
 * de `user_log` (login → logout, haya o no campaña abierta), recortadas al
 * día. Es la fuente del seguimiento (adherencia, saldo, cierre de mes): la
 * misma que factura operaciones (regla 16). agg_sesion_usuario (ag_in_cp_log,
 * con campaña abierta) sigue siendo la del motor. inicioSeg/finSeg = segundos
 * desde las 00:00 de `fecha`.
 */
export const aggLogadoUsuario = sqliteTable(
  "agg_logado_usuario",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(),
    usrName: text("usr_name").notNull(),
    inicioSeg: integer("inicio_seg").notNull(),
    finSeg: integer("fin_seg").notNull(),
  },
  (t) => [
    index("idx_agg_logado_fecha").on(t.fecha),
    index("idx_agg_logado_usr").on(t.usrName, t.fecha),
  ],
);

/** Ajustes manuales del saldo de horas de un agente (con motivo; F4). */
export const planSaldoAjustes = sqliteTable(
  "plan_saldo_ajustes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agenteNumero: text("agente_numero").notNull(),
    fecha: text("fecha").notNull(), // YYYY-MM-DD: el día al que se imputa
    horas: real("horas").notNull(), // ± horas
    motivo: text("motivo").notNull(),
    autor: text("autor").notNull(),
    creadoAt: integer("creado_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => [index("idx_plan_saldo_ajustes").on(t.agenteNumero, t.fecha)],
);

/** Contactos que dejan de estar vivos, fechados por su último event_moment. */
export const aggCierresCampania = sqliteTable(
  "agg_cierres_campania",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(),
    campania: text("campania").notNull(),
    cierres: integer("cierres").notNull(),
  },
  (t) => [uniqueIndex("uq_agg_cierres").on(t.fecha, t.campania)],
);

/** Foto nocturna del estado de las listas salientes (tabla activity). */
export const planListasEstado = sqliteTable(
  "plan_listas_estado",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(), // día en que se tomó la foto
    campania: text("campania").notNull(),
    total: integer("total").notNull(),
    vivos: integer("vivos").notNull(), // status 0/1/2
    vivosSinTocar: integer("vivos_sin_tocar").notNull(), // y business_status 1
  },
  (t) => [uniqueIndex("uq_plan_listas").on(t.fecha, t.campania)],
);

// Tipos inferidos de uso frecuente
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BillingConfigRow = typeof billingConfig.$inferSelect;
export type AggDailyRow = typeof aggDailyCampaign.$inferSelect;
export type PlanClienteRow = typeof planClientes.$inferSelect;
export type PlanAgenteRow = typeof planAgentes.$inferSelect;
export type PlanAgenteUsuarioRow = typeof planAgenteUsuarios.$inferSelect;
export type PlanVersionRow = typeof planVersiones.$inferSelect;
export type PlanBloqueRow = typeof planBloques.$inferSelect;
export type PlanAusenciaRow = typeof planAusencias.$inferSelect;
export type ResultadosConfigRow = typeof resultadosConfig.$inferSelect;
export type ObjetivoResultadosRow = typeof objetivosResultados.$inferSelect;
