CREATE TABLE `agg_cierres_campania` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`campania` text NOT NULL,
	`cierres` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agg_cierres` ON `agg_cierres_campania` (`fecha`,`campania`);--> statement-breakpoint
CREATE TABLE `agg_hora_servicio` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`servicio` text NOT NULL,
	`inicio_min` integer NOT NULL,
	`entrantes` integer DEFAULT 0 NOT NULL,
	`entrantes_atendidas` integer DEFAULT 0 NOT NULL,
	`entrantes_abandonadas` integer DEFAULT 0 NOT NULL,
	`entrantes_rechazadas` integer DEFAULT 0 NOT NULL,
	`salientes` integer DEFAULT 0 NOT NULL,
	`salientes_atendidas` integer DEFAULT 0 NOT NULL,
	`seg_gestion_entrantes` real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agg_hora_servicio` ON `agg_hora_servicio` (`fecha`,`servicio`,`inicio_min`);--> statement-breakpoint
CREATE INDEX `idx_agg_hora_fecha` ON `agg_hora_servicio` (`fecha`);--> statement-breakpoint
CREATE TABLE `agg_sesion_usuario` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`usr_name` text NOT NULL,
	`inicio_seg` integer NOT NULL,
	`fin_seg` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agg_sesion_fecha` ON `agg_sesion_usuario` (`fecha`);--> statement-breakpoint
CREATE INDEX `idx_agg_sesion_usr` ON `agg_sesion_usuario` (`usr_name`,`fecha`);--> statement-breakpoint
CREATE TABLE `plan_agente_turnos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agente_numero` text NOT NULL,
	`patron_a_id` integer,
	`patron_b_id` integer,
	`desde` text NOT NULL,
	`hasta` text,
	FOREIGN KEY (`patron_a_id`) REFERENCES `plan_patrones`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`patron_b_id`) REFERENCES `plan_patrones`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_plan_turnos_agente` ON `plan_agente_turnos` (`agente_numero`);--> statement-breakpoint
CREATE TABLE `plan_agente_usuarios` (
	`usr_name` text PRIMARY KEY NOT NULL,
	`agente_numero` text NOT NULL,
	`altitude_code` integer,
	`prefijo` text NOT NULL,
	`sufijo` text DEFAULT '' NOT NULL,
	`cliente_codigo` text,
	`fullname` text,
	`ultima_sesion` text,
	`sincronizado_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_usr_agente` ON `plan_agente_usuarios` (`agente_numero`);--> statement-breakpoint
CREATE TABLE `plan_agentes` (
	`numero` text PRIMARY KEY NOT NULL,
	`alias` text,
	`contrato_semanal_h` real,
	`en_plantilla` integer DEFAULT false NOT NULL,
	`equipo` text,
	`forzar_activo` integer DEFAULT false NOT NULL,
	`notas` text,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_ausencias` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agente_numero` text NOT NULL,
	`tipo_codigo` text NOT NULL,
	`desde` text NOT NULL,
	`hasta` text NOT NULL,
	`inicio_min` integer,
	`fin_min` integer,
	`notas` text,
	`creado_por` text,
	`creado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_ausencias_agente` ON `plan_ausencias` (`agente_numero`);--> statement-breakpoint
CREATE INDEX `idx_plan_ausencias_fechas` ON `plan_ausencias` (`desde`,`hasta`);--> statement-breakpoint
CREATE TABLE `plan_bloques` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`agente_numero` text NOT NULL,
	`fecha` text NOT NULL,
	`inicio_min` integer NOT NULL,
	`fin_min` integer NOT NULL,
	`cliente_codigo` text NOT NULL,
	`origen` text NOT NULL,
	`fijado` integer DEFAULT false NOT NULL,
	`regla` text NOT NULL,
	`datos` text,
	`editado_por` text,
	`editado_at` integer,
	FOREIGN KEY (`version_id`) REFERENCES `plan_versiones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plan_bloques_fecha` ON `plan_bloques` (`version_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `idx_plan_bloques_agente` ON `plan_bloques` (`version_id`,`agente_numero`);--> statement-breakpoint
CREATE TABLE `plan_bolsas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mes` text NOT NULL,
	`cliente_codigo` text NOT NULL,
	`horas` real NOT NULL,
	`origen` text NOT NULL,
	`confirmada_por` text,
	`confirmada_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_bolsa` ON `plan_bolsas` (`mes`,`cliente_codigo`);--> statement-breakpoint
CREATE TABLE `plan_clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`codigo` text NOT NULL,
	`nombre` text NOT NULL,
	`color` text NOT NULL,
	`equipo` text DEFAULT 'multicliente' NOT NULL,
	`servicio_altitude` text,
	`cuenta_como` text,
	`modo` text NOT NULL,
	`prioridad` integer DEFAULT 100 NOT NULL,
	`campanias` text DEFAULT '[]' NOT NULL,
	`parametros` text DEFAULT '{}' NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_clientes_codigo_unique` ON `plan_clientes` (`codigo`);--> statement-breakpoint
CREATE TABLE `plan_listas_estado` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`campania` text NOT NULL,
	`total` integer NOT NULL,
	`vivos` integer NOT NULL,
	`vivos_sin_tocar` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_listas` ON `plan_listas_estado` (`fecha`,`campania`);--> statement-breakpoint
CREATE TABLE `plan_objetivos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mes` text NOT NULL,
	`cliente_codigo` text NOT NULL,
	`semana_lunes` text NOT NULL,
	`horas` real NOT NULL,
	`origen` text NOT NULL,
	`detalle` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_objetivo` ON `plan_objetivos` (`mes`,`cliente_codigo`,`semana_lunes`);--> statement-breakpoint
CREATE TABLE `plan_patron_tramos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`patron_id` integer NOT NULL,
	`dia_semana` integer NOT NULL,
	`inicio_min` integer NOT NULL,
	`fin_min` integer NOT NULL,
	FOREIGN KEY (`patron_id`) REFERENCES `plan_patrones`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_plan_tramos_patron` ON `plan_patron_tramos` (`patron_id`);--> statement-breakpoint
CREATE TABLE `plan_patrones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plan_patrones_nombre_unique` ON `plan_patrones` (`nombre`);--> statement-breakpoint
CREATE TABLE `plan_prefijos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prefijo` text NOT NULL,
	`sufijo` text DEFAULT '' NOT NULL,
	`cliente_codigo` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_prefijo` ON `plan_prefijos` (`prefijo`,`sufijo`);--> statement-breakpoint
CREATE TABLE `plan_tipos_ausencia` (
	`codigo` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`color` text NOT NULL,
	`computa_como_trabajada` integer DEFAULT false NOT NULL,
	`activo` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_versiones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mes` text NOT NULL,
	`numero` integer NOT NULL,
	`estado` text NOT NULL,
	`origen` text NOT NULL,
	`basada_en_id` integer,
	`revision` integer DEFAULT 0 NOT NULL,
	`entradas` text,
	`avisos` text,
	`resumen` text,
	`creada_por` text,
	`creada_at` integer DEFAULT (unixepoch()) NOT NULL,
	`publicada_por` text,
	`publicada_at` integer,
	`motivo_publicacion` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_version_numero` ON `plan_versiones` (`mes`,`numero`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_version_borrador` ON `plan_versiones` (`mes`) WHERE estado = 'borrador';