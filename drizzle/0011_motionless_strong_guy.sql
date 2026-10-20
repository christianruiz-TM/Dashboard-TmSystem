CREATE TABLE `facturacion_cargos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mes` text NOT NULL,
	`servicio` text NOT NULL,
	`campaign_shortname` text NOT NULL,
	`unidad` text NOT NULL,
	`cantidad` real NOT NULL,
	`precio_unitario` real,
	`concepto` text NOT NULL,
	`creado_por` text NOT NULL,
	`creado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_fact_cargos_mes` ON `facturacion_cargos` (`mes`,`servicio`);