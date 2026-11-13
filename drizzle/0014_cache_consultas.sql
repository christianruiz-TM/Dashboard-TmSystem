CREATE TABLE `cache_consultas` (
	`clave` text PRIMARY KEY NOT NULL,
	`version` text NOT NULL,
	`valor` text NOT NULL,
	`caduca` integer NOT NULL,
	`calculado_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cache_consultas_caduca` ON `cache_consultas` (`caduca`);