CREATE TABLE "processed_changes" (
	"change_id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"owner_client_id" uuid NOT NULL,
	"last_modified_by_client_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_client_id_clients_id_fk" FOREIGN KEY ("owner_client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_last_modified_by_client_id_clients_id_fk" FOREIGN KEY ("last_modified_by_client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspaces_owner_client_id_idx" ON "workspaces" USING btree ("owner_client_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_user_id_idx" ON "workspaces" USING btree ("owner_user_id") WHERE "workspaces"."owner_user_id" is not null;--> statement-breakpoint
CREATE INDEX "workspaces_updated_at_idx" ON "workspaces" USING btree ("updated_at");
--> statement-breakpoint
ALTER TABLE "clients" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "workspaces" REPLICA IDENTITY FULL;
