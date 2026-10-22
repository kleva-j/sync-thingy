UPDATE "outbox" SET "status" = 'synced' WHERE "synced_at" IS NOT NULL;
