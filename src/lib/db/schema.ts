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

/** Unidades de facturación configurables por campaña. */
export const UNIDADES_FACTURACION = ["horas", "interacciones", "exitos", "leads"] as const;
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
    // Precio por unidad en €. Opcional: si es NULL solo se muestran unidades.
    precioUnitario: real("precio_unitario"),
    notas: text("notas"),
    activo: integer("activo", { mode: "boolean" }).notNull().default(true),
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
    abandonadas: integer("abandonadas").notNull().default(0),
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

// Tipos inferidos de uso frecuente
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type BillingConfigRow = typeof billingConfig.$inferSelect;
export type AggDailyRow = typeof aggDailyCampaign.$inferSelect;
