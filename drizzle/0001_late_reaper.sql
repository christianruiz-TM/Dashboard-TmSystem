PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_billing_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`campaign_shortname` text,
	`service_name` text,
	`unidad` text NOT NULL,
	`precio_unitario` real,
	`notas` text,
	`activo` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_billing_config`("id", "campaign_shortname", "unidad", "precio_unitario", "notas", "activo") SELECT "id", "campaign_shortname", "unidad", "precio_unitario", "notas", "activo" FROM `billing_config`;--> statement-breakpoint
DROP TABLE `billing_config`;--> statement-breakpoint
ALTER TABLE `__new_billing_config` RENAME TO `billing_config`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_billing_campaign` ON `billing_config` (`campaign_shortname`);--> statement-breakpoint
CREATE INDEX `idx_billing_service` ON `billing_config` (`service_name`);