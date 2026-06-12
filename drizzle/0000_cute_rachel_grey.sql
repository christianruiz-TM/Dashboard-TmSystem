CREATE TABLE `agg_daily_campaign` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fecha` text NOT NULL,
	`campaign_shortname` text NOT NULL,
	`tipo_campania` text,
	`interacciones` integer DEFAULT 0 NOT NULL,
	`inbound` integer DEFAULT 0 NOT NULL,
	`outbound` integer DEFAULT 0 NOT NULL,
	`atendidas` integer DEFAULT 0 NOT NULL,
	`abandonadas` integer DEFAULT 0 NOT NULL,
	`aht_seg` real,
	`acw_seg` real,
	`talk_seg` real,
	`horas_logadas` real,
	`horas_ready` real,
	`exitos` integer DEFAULT 0 NOT NULL,
	`leads_finalizados` integer DEFAULT 0 NOT NULL,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agg_fecha_campania` ON `agg_daily_campaign` (`fecha`,`campaign_shortname`);--> statement-breakpoint
CREATE INDEX `idx_agg_fecha` ON `agg_daily_campaign` (`fecha`);--> statement-breakpoint
CREATE TABLE `app_settings` (
	`clave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ts` integer DEFAULT (unixepoch()) NOT NULL,
	`user_id` integer,
	`username` text,
	`accion` text NOT NULL,
	`detalle` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `idx_audit_ts` ON `audit_log` (`ts`);--> statement-breakpoint
CREATE TABLE `billing_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_shortname` text NOT NULL,
	`unidad` text NOT NULL,
	`precio_unitario` real,
	`notas` text,
	`activo` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_billing_campaign` ON `billing_config` (`campaign_shortname`);--> statement-breakpoint
CREATE TABLE `client_campaigns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`campaign_shortname` text NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_client_campaign` ON `client_campaigns` (`client_id`,`campaign_shortname`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nombre` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_nombre_unique` ON `clients` (`nombre`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `sla_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`service_name` text NOT NULL,
	`umbral_seg` integer DEFAULT 20 NOT NULL,
	`objetivo_pct` integer DEFAULT 80 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sla_config_service_name_unique` ON `sla_config` (`service_name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`nombre` text NOT NULL,
	`rol` text NOT NULL,
	`client_id` integer,
	`activo` integer DEFAULT true NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`last_login` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_users_rol` ON `users` (`rol`);