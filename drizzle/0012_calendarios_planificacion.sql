CREATE TABLE `plan_calendario_excepciones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendario` text NOT NULL,
	`fecha` text NOT NULL,
	`tipo` text NOT NULL,
	`tramos` text,
	`motivo` text,
	`autor` text NOT NULL,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_cal_excepciones` ON `plan_calendario_excepciones` (`calendario`,`fecha`);--> statement-breakpoint
CREATE TABLE `plan_calendario_festivos_rdb` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendario` text NOT NULL,
	`fecha` text NOT NULL,
	`tipo` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_plan_cal_festivos_rdb` ON `plan_calendario_festivos_rdb` (`calendario`,`fecha`);--> statement-breakpoint
CREATE TABLE `plan_calendario_horarios_rdb` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`calendario` text NOT NULL,
	`dias` text NOT NULL,
	`entrada_min` integer NOT NULL,
	`salida_min` integer NOT NULL,
	`desde` text NOT NULL,
	`hasta` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_calendario_laboral` (
	`fecha` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`nombre` text,
	`autor` text NOT NULL,
	`actualizado_at` integer DEFAULT (unixepoch()) NOT NULL
);
