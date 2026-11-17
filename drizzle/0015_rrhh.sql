CREATE TABLE `rrhh_horarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agente_numero` text NOT NULL,
	`dia_semana` integer NOT NULL,
	`tramo` integer DEFAULT 1 NOT NULL,
	`inicio_min` integer NOT NULL,
	`fin_min` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rrhh_horarios` ON `rrhh_horarios` (`agente_numero`,`dia_semana`,`tramo`);--> statement-breakpoint
CREATE TABLE `rrhh_notas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agente_numero` text NOT NULL,
	`fecha` text NOT NULL,
	`inicio_min` integer,
	`texto` text NOT NULL,
	`creado_por` text,
	`creado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rrhh_notas_fecha` ON `rrhh_notas` (`fecha`,`agente_numero`);--> statement-breakpoint
CREATE TABLE `rrhh_personas` (
	`agente_numero` text PRIMARY KEY NOT NULL,
	`contrato_semanal_h` real,
	`horario_confirmado` integer DEFAULT false NOT NULL,
	`excluida` integer DEFAULT false NOT NULL,
	`notas` text,
	`actualizado_por` text,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
-- Panel de RRHH (16/11/2026): tipos de ausencia nuevos. RRHH marca después en
-- su configuración si cuentan como trabajados (el mismo dato que usa el saldo
-- de Planificación). No pisa un tipo que ya exista con ese código.
INSERT OR IGNORE INTO `plan_tipos_ausencia` (`codigo`, `nombre`, `color`, `computa_como_trabajada`, `activo`) VALUES
	('IT', 'Baja médica (IT)', '#7030A0', 1, 1),
	('PER', 'Permiso retribuido', '#00B050', 1, 1),
	('AP', 'Asuntos propios', '#00B0F0', 0, 1);
--> statement-breakpoint
-- Supervisoras con nº de agente: fuera del panel (decidido con Christian).
INSERT OR IGNORE INTO `rrhh_personas` (`agente_numero`, `excluida`, `notas`, `actualizado_por`) VALUES
	('1010', 1, 'Supervisora', 'migración 0015'),
	('1071', 1, 'Supervisora', 'migración 0015');
