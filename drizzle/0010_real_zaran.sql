CREATE TABLE `facturacion_cierre_ajustes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cierre_id` integer NOT NULL,
	`linea_id` integer NOT NULL,
	`tipo` text NOT NULL,
	`precio_nuevo` real,
	`motivo` text NOT NULL,
	`autor` text NOT NULL,
	`creado_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`cierre_id`) REFERENCES `facturacion_cierres`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linea_id`) REFERENCES `facturacion_cierre_lineas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_fact_ajustes_cierre` ON `facturacion_cierre_ajustes` (`cierre_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fact_ajuste_linea` ON `facturacion_cierre_ajustes` (`linea_id`);