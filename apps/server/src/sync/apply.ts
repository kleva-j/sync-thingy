import type { ServerDatabase } from "@sync-disc/db/postgres";
import type { PgQueryResultHKT } from "drizzle-orm/pg-core";

import { and, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import { ConflictError } from "core";
import { DateTime } from "effect";

import type {
  WorkspaceUpsertChange,
  WorkspaceDeleteChange,
  SyncChangeResult,
  SyncChange,
} from "sync-engine";

import { clients, processedChanges, workspaces } from "../db/schema.ts";

class ChangeNotApplied extends Error {
  constructor(readonly result: SyncChangeResult) {
    super(result.status);
  }
}

const duplicate = (
  change: SyncChange,
  processed: typeof processedChanges.$inferSelect,
): SyncChangeResult => ({
  status: "duplicate",
  changeId: change.changeId,
  workspaceId: change.entityId,
  version: processed.version,
  updatedAt: DateTime.fromDateUnsafe(processed.updatedAt),
});

const rejected = (
  change: SyncChange,
  reason: Extract<SyncChangeResult, { status: "rejected" }>["reason"],
  message: string,
): SyncChangeResult => ({
  status: "rejected",
  changeId: change.changeId,
  workspaceId: change.entityId,
  reason,
  message,
});

const conflict = (change: SyncChange, actualVersion: number): SyncChangeResult => ({
  status: "conflict",
  changeId: change.changeId,
  error: new ConflictError({
    workspaceId: change.entityId,
    expectedVersion: change.baseVersion ?? 0,
    actualVersion,
  }),
});

const applied = (change: SyncChange, row: typeof workspaces.$inferSelect): SyncChangeResult => ({
  status: "applied",
  changeId: change.changeId,
  workspaceId: change.entityId,
  version: row.version,
  updatedAt: DateTime.fromDateUnsafe(row.updatedAt),
});

type WorkspaceRow = typeof workspaces.$inferSelect;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }

  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError("Change contains a value that cannot be serialized");
  }

  return serialized;
}

function fingerprintChange(change: SyncChange): string {
  const fingerprintableChange = Object.fromEntries(
    Object.entries(change).filter(([key]) => key !== "changeId"),
  );

  return createHash("sha256").update(canonicalJson(fingerprintableChange)).digest("hex");
}

function stateRejection(change: SyncChange, row: WorkspaceRow): SyncChangeResult | undefined {
  if (row.deletedAt !== null) {
    return rejected(change, "already_deleted", "Workspace is deleted");
  }

  if (row.ownerClientId !== change.clientId) {
    return rejected(change, "ownership", "Client does not own workspace");
  }

  return undefined;
}

export function classifyExistingWorkspace(
  change: SyncChange,
  existing: WorkspaceRow | undefined,
): SyncChangeResult {
  if (!existing) {
    return rejected(change, "not_found", "Workspace not found");
  }

  return stateRejection(change, existing) ?? conflict(change, existing.version);
}

async function findWorkspace<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  entityId: SyncChange["entityId"],
) {
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.workspaceId, entityId))
    .limit(1);
  return row;
}

type LoadedWorkspace =
  | { readonly ok: true; readonly row: WorkspaceRow }
  | { readonly ok: false; readonly result: SyncChangeResult };

async function loadActiveOwnedWorkspace<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  change: WorkspaceUpsertChange | WorkspaceDeleteChange,
  baseVersion: number,
): Promise<LoadedWorkspace> {
  const existing = await findWorkspace(db, change.entityId);

  if (!existing) {
    return { ok: false, result: rejected(change, "not_found", "Workspace not found") };
  }

  const rejection = stateRejection(change, existing);

  if (rejection) {
    return { ok: false, result: rejection };
  }

  if (existing.version !== baseVersion) {
    return { ok: false, result: conflict(change, existing.version) };
  }

  return { ok: true, row: existing };
}

async function applyVersionedUpdate<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  change: WorkspaceUpsertChange | WorkspaceDeleteChange,
  existing: WorkspaceRow,
  now: Date,
  set: Partial<typeof workspaces.$inferInsert>,
): Promise<SyncChangeResult> {
  const [row] = await db
    .update(workspaces)
    .set({
      ...set,
      lastModifiedByClientId: change.clientId,
      version: existing.version + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(workspaces.workspaceId, change.entityId),
        eq(workspaces.version, existing.version),
        isNull(workspaces.deletedAt),
      ),
    )
    .returning();

  if (row) {
    return applied(change, row);
  }

  return classifyExistingWorkspace(change, await findWorkspace(db, change.entityId));
}

async function applyUpsert<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  change: WorkspaceUpsertChange,
  now: Date,
): Promise<SyncChangeResult> {
  const payload = change.payload.workspace;

  if (payload.workspaceId !== change.entityId) {
    return rejected(change, "invalid_payload", "Workspace ID mismatch");
  }

  if (
    payload.ownerClientId !== change.clientId ||
    payload.lastModifiedByClientId !== change.clientId
  ) {
    return rejected(change, "ownership", "Client does not own workspace");
  }

  if (change.baseVersion === null) {
    const [row] = await db
      .insert(workspaces)
      .values({
        workspaceId: change.entityId,
        snapshotId: payload.snapshotId,
        ownerClientId: change.clientId,
        lastModifiedByClientId: change.clientId,
        version: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) {
      return rejected(change, "already_exists", "Workspace already exists");
    }

    return applied(change, row);
  }

  const loaded = await loadActiveOwnedWorkspace(db, change, change.baseVersion);

  if (!loaded.ok) {
    return loaded.result;
  }

  return applyVersionedUpdate(db, change, loaded.row, now, {
    snapshotId: payload.snapshotId,
  });
}

async function applyDelete<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  change: WorkspaceDeleteChange,
  now: Date,
): Promise<SyncChangeResult> {
  if (change.payload.workspaceId !== change.entityId) {
    return rejected(change, "invalid_payload", "Workspace ID mismatch");
  }

  const loaded = await loadActiveOwnedWorkspace(db, change, change.baseVersion);

  if (!loaded.ok) {
    return loaded.result;
  }

  return applyVersionedUpdate(db, change, loaded.row, now, { deletedAt: now });
}

export async function applyChange<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  change: SyncChange,
  now: Date,
): Promise<SyncChangeResult> {
  const fingerprint = fingerprintChange(change);

  try {
    return await db.transaction(async (tx) => {
      const [processed] = await tx
        .insert(processedChanges)
        .values({
          changeId: change.changeId,
          clientId: change.clientId,
          entityId: change.entityId,
          operation: change.operation,
          processedAt: now,
          version: 0,
          updatedAt: now,
          fingerprint,
        })
        .onConflictDoNothing()
        .returning({ changeId: processedChanges.changeId });

      if (!processed) {
        const [existing] = await tx
          .select()
          .from(processedChanges)
          .where(eq(processedChanges.changeId, change.changeId))
          .limit(1);

        if (!existing) {
          throw new Error("Processed change conflict but no row was found");
        }

        if (existing.fingerprint !== fingerprint) {
          return rejected(
            change,
            "invalid_payload",
            "Change ID was already used for a different change",
          );
        }

        return duplicate(change, existing);
      }

      await tx
        .insert(clients)
        .values({
          id: change.clientId,
          createdAt: now,
          lastSeenAt: now,
        })
        .onConflictDoUpdate({
          target: clients.id,
          set: { lastSeenAt: now },
        });

      const result =
        change.operation === "upsert"
          ? await applyUpsert(tx, change, now)
          : await applyDelete(tx, change, now);

      if (result.status !== "applied") {
        throw new ChangeNotApplied(result);
      }

      await tx
        .update(processedChanges)
        .set({ version: result.version, updatedAt: now })
        .where(eq(processedChanges.changeId, change.changeId));

      return result;
    });
  } catch (error) {
    if (error instanceof ChangeNotApplied) {
      return error.result;
    }
    throw error;
  }
}

export async function applyChanges<TResult extends PgQueryResultHKT>(
  db: ServerDatabase<TResult>,
  changes: ReadonlyArray<SyncChange>,
  now: Date,
): Promise<ReadonlyArray<SyncChangeResult>> {
  const results: Array<SyncChangeResult> = [];

  for (const change of changes) {
    results.push(await applyChange(db, change, now));
  }

  return results;
}
