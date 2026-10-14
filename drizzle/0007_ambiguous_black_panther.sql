CREATE TABLE `objetivos_resultados` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_shortname` text,
	`service_name` text,
	`bruto_min` real,
	`neto_min` real,
	`max_pct_no_validos` real,
	`desde` text NOT NULL,
	`hasta` text,
	`notas` text
);
--> statement-breakpoint
CREATE INDEX `idx_obj_res_campaign` ON `objetivos_resultados` (`campaign_shortname`);--> statement-breakpoint
CREATE INDEX `idx_obj_res_service` ON `objetivos_resultados` (`service_name`);--> statement-breakpoint
CREATE TABLE `resultados_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_name` text NOT NULL,
	`tabla_ao` text NOT NULL,
	`columnas` text DEFAULT '[]' NOT NULL,
	`codigos_no_validos` text DEFAULT '[]' NOT NULL,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resultados_config_service_name_unique` ON `resultados_config` (`service_name`);