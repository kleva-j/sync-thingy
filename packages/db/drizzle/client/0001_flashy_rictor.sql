ALTER TABLE "outbox" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
CREATE INDEX "outbox_status_created_at_idx" ON "outbox" USING btree ("status","created_at");