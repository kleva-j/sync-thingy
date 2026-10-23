ALTER TABLE "processed_changes" ADD COLUMN "entity_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "processed_changes" ADD COLUMN "operation" text NOT NULL;