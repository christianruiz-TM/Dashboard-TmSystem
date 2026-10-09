CREATE TABLE `agg_daily_agent_campaign` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`agente` text NOT NULL,
	`nombre` text,
	`campaign_shortname` text NOT NULL,
	`sesiones` integer DEFAULT 0 NOT NULL,
	`exitos` integer DEFAULT 0 NOT NULL,
	`sin_exito` integer DEFAULT 0 NOT NULL,
	`atendidas` integer DEFAULT 0 NOT NULL,
	`productivo_seg` real DEFAULT 0 NOT NULL,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agg_ag_camp` ON `agg_daily_agent_campaign` (`fecha`,`agente`,`campaign_shortname`);--> statement-breakpoint
CREATE INDEX `idx_agg_ag_camp_fecha` ON `agg_daily_agent_campaign` (`fecha`);