CREATE TABLE `campanias_gs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_shortname` text NOT NULL,
	`codigo_gs` text NOT NULL,
	`denominacion` text,
	`cliente_gs` text,
	`presupuesto_gs` text,
	`fecha_inicio` text,
	`fecha_fin` text,
	`notas` text,
	`actualizado_por` text,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campanias_gs_campaign_shortname_unique` ON `campanias_gs` (`campaign_shortname`);--> statement-breakpoint
CREATE TABLE `ddis` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` text NOT NULL,
	`campaign_shortname` text,
	`estado` text NOT NULL,
	`fecha_alta` text,
	`fecha_baja` text,
	`fecha_solicitud` text,
	`version_altitude` text,
	`hunt_group` text,
	`account_code` text,
	`linea_intermedia` text,
	`departamento` text,
	`tipo_uso` text,
	`uso` text,
	`cliente_gs` text,
	`empresa` text,
	`nombre_campania` text,
	`centro` text,
	`campania_gs` text,
	`sentido` text,
	`unidad_negocio` text,
	`marca` text,
	`notas` text,
	`actualizado_por` text,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ddis_campania` ON `ddis` (`campaign_shortname`);--> statement-breakpoint
CREATE INDEX `idx_ddis_numero` ON `ddis` (`numero`);--> statement-breakpoint
CREATE TABLE `facturacion_cierre_lineas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cierre_id` integer NOT NULL,
	`campania` text NOT NULL,
	`codigo_gs` text,
	`unidad` text NOT NULL,
	`cantidad` real NOT NULL,
	`precio_unitario` real,
	`importe` real,
	FOREIGN KEY (`cierre_id`) REFERENCES `facturacion_cierres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_fact_cierre_lineas` ON `facturacion_cierre_lineas` (`cierre_id`);--> statement-breakpoint
CREATE TABLE `facturacion_cierres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`mes` text NOT NULL,
	`servicio` text NOT NULL,
	`estado` text NOT NULL,
	`origen` text NOT NULL,
	`importe_total` real,
	`cerrado_por` text,
	`cerrado_at` integer DEFAULT (unixepoch()) NOT NULL,
	`reabierto_por` text,
	`reabierto_at` integer,
	`notas` text
);
--> statement-breakpoint
CREATE INDEX `idx_fact_cierres_mes` ON `facturacion_cierres` (`mes`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fact_cierre_cerrado` ON `facturacion_cierres` (`mes`,`servicio`) WHERE estado = 'cerrado';