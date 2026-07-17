CREATE TABLE `audio_blobs` (
	`object_id` text PRIMARY KEY NOT NULL,
	`mp3_bytes_b64` text NOT NULL,
	`voice_id` text NOT NULL,
	`model_id` text NOT NULL,
	`char_count` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `fcos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`object_id` text NOT NULL,
	`object_type` text NOT NULL,
	`content_leaf` text NOT NULL,
	`op_leaf` text NOT NULL,
	`parents_json` text NOT NULL,
	`envelope_json` text NOT NULL,
	`payload_preview` text NOT NULL,
	`claim_ceiling` text NOT NULL,
	`created_at_utc` text NOT NULL
);

--> statement-breakpoint
CREATE UNIQUE INDEX `fcos_object_id_unique` ON `fcos` (`object_id`);
--> statement-breakpoint
CREATE INDEX `fcos_created_idx` ON `fcos` (`created_at_utc`);
