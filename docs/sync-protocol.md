# Sync protocol (mosque server ↔ Jumaah Cloud)

A Community server can optionally connect to Jumaah Cloud. The mosque server is the **client**: its `sync-worker`
pushes local changes, pulls remote ones, and asks for a full snapshot on first run. The cloud is the **server** of this
protocol; the Community repository only contains the client and the contract below (schemas in
`packages/jumaah-core/src/schemas.ts`, apply logic in `packages/db/src/sync.ts`).

## Authentication

Every request carries the mosque's sync key in the `x-sync-key` header and names the mosque with `tenantSlug` in the
body. The key is issued by the cloud when the mosque is created (and can be rotated there); the server stores only its
SHA-256. A suspended mosque is refused with 403.

Client settings: `CLOUD_API_URL`, `EDGE_TENANT_SLUG`, `EDGE_SYNC_KEY`, `EDGE_DEVICE_ID` (generated if empty),
`SYNC_INTERVAL_SECONDS` (default 60). The worker idles when the first three are empty.

## Change log: the outbox

Every local write to a synced entity appends an `Outbox` row `{ id, entity, entityId, op, payload, version, occurredAt }`
(`op` is `UPSERT` or `DELETE`). Synced entities, applied in this order:

`Tenant` (name, timezone, locale, settings only) · `TenantLanguage` · `Khutbah` · `KhutbahSection` · `Paragraph` ·
`Translation` · `GlossaryEntry` · `Display` · `KhutbahVersion`

Applied entries are recorded in `SyncApplied` by entry id, so a retried batch never applies twice. Writes coming from
the other side go straight to the tables, never through the outbox, so they are not echoed back.

## Endpoints (all under `/api`, JSON)

| Method | Path | Body | Answer |
|---|---|---|---|
| POST | `/sync/push` | `syncPushSchema`: `{ tenantSlug, deviceId, entries[≤500] }` | `{ applied, skipped, conflicts, errors: [{ id, error }] }` |
| POST | `/sync/pull` | `syncPullSchema`: `{ tenantSlug, since?: ISO date \| null, limit ≤500 }` | `{ entries, cursor, hasMore }` |
| POST | `/sync/bootstrap` | `{ tenantSlug }` | the full tenant snapshot (same shape as a backup export) |
| POST | `/sync/translate` | `remoteTranslateSchema`: `{ tenantSlug, items[≤200], targetLangs, glossary }` | `{ results: { [lang]: [{ id, text, provider, model? }] }, costUsd }` |
| GET | `/sync/version` | – | `{ imageTag, latestImageTag, mode, serverTime }` |

Rate limits on the server: 120 requests per minute for push/pull/bootstrap/version, 30 for translate.

## One sync round (the worker)

1. **Push** the oldest unsynced outbox rows in batches of 200. Rows in `errors` get `attempts + 1` and the error text;
   after `OUTBOX_MAX_ATTEMPTS` (10) rejections a row is parked and no longer occupies the batch, so one bad row cannot
   stall everything behind it. The admin sees the parked count under Cloud sync and can requeue them (`POST /sync/retry-failed`).
2. **Pull** with the stored cursor (`SyncState.pullCursor`, the `occurredAt` of the last applied remote entry) until
   `hasMore` is false, applying each page with `applySyncEntries`.
3. **Version check**: `GET /sync/version` tells the server which image tag the cloud recommends; the admin shows
   "update available" and `infra/scripts/edge-update.sh` can pull it.
4. Housekeeping: applied-entry records and synced outbox rows older than 30 days are deleted.

The round also runs immediately when the admin presses "Sync now" (the API publishes `jumaah:sync:now` on Redis).

## Conflicts

Last write wins on `updatedAt`. The losing version of a `Translation` is kept as a `TranslationVersion` row and a
losing `Khutbah` title/notes change as a `KhutbahVersion` "conflict copy", so nothing reviewed is lost silently.
Dates travel as ISO strings and are revived on arrival (`createdAt`, `updatedAt`, `gregorianDate`, `lastSeenAt`, `deletedAt`).

## First run

If the mosque does not exist locally, the worker calls `/sync/bootstrap`, creates the tenant row from the snapshot and
replays the rest of the snapshot as `UPSERT` entries through the same apply path. An admin can also upload a snapshot
by hand (`POST /sync/apply-bootstrap`).

## Hosted translation relay

With a cloud connection, the provider list gains a virtual `CLOUD` provider that sends paragraphs to
`/sync/translate`; the cloud translates with its own keys and applies its own allowance rules. A mosque's own keys
are never gated.
