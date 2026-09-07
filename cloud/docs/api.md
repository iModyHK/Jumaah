# Jumaah API and webhooks

Available on Jumaah Cloud plans that include the API feature (Pro and Organisation). Self-hosted servers expose the
same REST API to signed-in users, but API keys and webhooks are part of the paid edition.

## Authentication

Create a key in **Admin → API**. Keys start with `jk_` and are shown once. Send them as a bearer token:

```
GET https://<mosque address>/api/khutbahs
Authorization: Bearer jk_...
```

A key acts for one mosque. It is either **read-only** (only `GET` requests are accepted) or **read-write**. Keys can
never manage users, other keys, webhooks, the subscription, the custom domain or the organisation, whatever their
scope. Revoking a key takes effect within a minute.

Requests are rate limited per key like any signed-in user. Errors come back as `{ "error": { "code", "message" } }`.

## Useful endpoints

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/tenant` | The mosque, its languages and settings |
| GET | `/api/khutbahs?from=YYYY-MM-DD&status=READY` | Paginated list (`page`, `pageSize`) |
| GET | `/api/khutbahs/:id` | Sections, paragraphs and translations with their status |
| POST | `/api/khutbahs` | `{ title, gregorianDate, targetLanguages, sections: [{ type, rawText }] }` |
| PUT | `/api/khutbahs/:id/sections/:type` | Replace the Arabic text of one section |
| POST | `/api/khutbahs/:id/translate` | Start a translation job (`{ languages, force }`) |
| GET | `/api/translation-jobs/:id` | Job progress |
| POST | `/api/khutbahs/:id/approve-all` | Approve every reviewed or machine translation |
| GET | `/api/session` | Live session snapshot and connected viewers |
| POST | `/api/session/start` | `{ khutbahId, deviceId }` |
| POST | `/api/session/command` | `{ command: { type: "next" | "prev" | "goto" | "section" | "improv" | "pause" | "resume" | "end", ... } }` |
| GET | `/api/displays` | Screens with their links |
| GET | `/api/insight` | Attendance per past session |

Every endpoint the admin app uses is available; the list above is the common subset.

## Webhooks

Register HTTPS endpoints in **Admin → API → Webhooks** and pick the events you want. Each delivery is a `POST` with a
JSON body and these headers:

```
Content-Type: application/json
X-Jumaah-Event: khutbah.created
X-Jumaah-Delivery: <uuid, unique per event>
X-Jumaah-Signature: sha256=<HMAC-SHA256 of the raw body with your webhook secret>
```

Body:

```json
{ "id": "<uuid>", "event": "khutbah.created", "createdAt": "2026-09-11T09:00:00.000Z", "tenantId": "…", "data": { … } }
```

Verify the signature by computing HMAC-SHA256 over the exact raw body with the secret shown when the webhook was
created, and compare it to the header in constant time. Answer with any `2xx` within 8 seconds; on a timeout, a network
error or a `5xx` the delivery is retried once after two seconds. The last result is shown next to the webhook, and the
**Test** button sends a `ping`.

| Event | `data` |
| --- | --- |
| `khutbah.created` | `{ khutbahId, title, gregorianDate, targetLanguages }` |
| `khutbah.updated` | `{ khutbahId, title, status, targetLanguages }` |
| `translations.approved` | `{ khutbahId, count, lang }` (lang is null when all languages were approved) |
| `session.started` | `{ sessionId, khutbahId }` |
| `session.ended` | `{ sessionId, khutbahId, peakDisplays, peakPhones, uniquePhones }` |
| `ping` | `{ message, webhookId }` |

Endpoints must be public `https://` addresses; loopback, private and link-local hosts are refused.
