ALTER TABLE `clients` ADD `service_name` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uq_clients_service` ON `clients` (`service_name`);