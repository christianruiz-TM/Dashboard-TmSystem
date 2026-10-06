CREATE TABLE `agg_logado_usuario` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`usr_name` text NOT NULL,
	`inicio_seg` integer NOT NULL,
	`fin_seg` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_agg_logado_fecha` ON `agg_logado_usuario` (`fecha`);--> statement-breakpoint
CREATE INDEX `idx_agg_logado_usr` ON `agg_logado_usuario` (`usr_name`,`fecha`);--> statement-breakpoint
CREATE TABLE `plan_saldo_ajustes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agente_numero` text NOT NULL,
	`fecha` text NOT NULL,
	`horas` real NOT NULL,
	`motivo` text NOT NULL,
	`autor` text NOT NULL,
	`creado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_plan_saldo_ajustes` ON `plan_saldo_ajustes` (`agente_numero`,`fecha`);