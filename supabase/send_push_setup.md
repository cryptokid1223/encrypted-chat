# Send-push: APNs via Supabase Edge Function

Content-free push notifications when DMs or group messages are inserted.
Payload is always **"Celesth: New message"** plus routing metadata only.

## Architecture

```
INSERT messages / group_messages
        │
        ▼
Database Webhook (Dashboard)
        │
        ▼
Edge Function: send-push
        │
        ├── resolve recipient (skip edit/delete/self-copy)
        ├── lookup device_tokens (enabled, ios)
        └── POST APNs (HTTP/2, JWT auth)
```

**Why Database Webhooks (not SQL + pg_net):** Webhooks need no `pg_net` extension,
keep all push logic in one Deno function, and are easy to inspect in the Dashboard.
Filtering (`edit_of`, `delete_of`, sender self-copies) happens in the function with
early returns — negligible cost vs. one APNs round-trip.

**Dedupe:** No cross-row dedupe is needed. DMs insert one row → one recipient.
Groups insert N rows with distinct `recipient_id` values → each member gets exactly
one push per `message_uuid`.

**Edit/delete:** Rows with `edit_of` or `delete_of` set are skipped at the DB column
level (E1/E2). Envelope-only edits/deletes without DB columns would still push — not
fixable without schema changes.

**Foreground / active user:** v1 pushes even when the app is open. iOS suppresses
banners for foreground apps; our client `pushNotificationReceived` handler is a no-op.

**Badge count:** Omitted in v1. `get_my_unread_counts()` is auth-scoped and mirrors
complex read/clear/join logic — calling it per push would add latency. No badge-clear
client code needed while badges are unset.

---

## 1. APNs key values (Apple Developer)

| Secret | Where to find it |
|--------|------------------|
| **APNS_KEY_ID** | [Certificates, Identifiers & Profiles → Keys](https://developer.apple.com/account/resources/authkeys/list) → your APNs key → **Key ID** (10 chars, e.g. `AB12CD34EF`) |
| **APNS_TEAM_ID** | [Membership details](https://developer.apple.com/account#MembershipDetailsCard) → **Team ID** |
| **APNS_KEY** | Download the `.p8` file when the key is created (only once). Open in a text editor — full PEM including `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` |
| **APNS_TOPIC** | App bundle ID: `com.celesth.app` |
| **APNS_ENDPOINT** | Production (TestFlight + App Store): `api.push.apple.com`. Xcode dev builds on device: `api.sandbox.push.apple.com` |

---

## 2. Set Supabase secrets

Link the project (once):

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Set secrets (run from repo root):

```bash
# Paste the entire .p8 file contents (PEM format)
supabase secrets set APNS_KEY="$(cat /path/to/AuthKey_XXXXXXXXXX.p8)"

supabase secrets set APNS_KEY_ID="YOUR_KEY_ID"
supabase secrets set APNS_TEAM_ID="YOUR_TEAM_ID"
supabase secrets set APNS_TOPIC="com.celesth.app"

# Production (default for TestFlight). Use sandbox only for Xcode ⌘R dev builds:
supabase secrets set APNS_ENDPOINT="api.push.apple.com"
# supabase secrets set APNS_ENDPOINT="api.sandbox.push.apple.com"
```

Verify:

```bash
supabase secrets list
```

---

## 3. Deploy the Edge Function

```bash
supabase functions deploy send-push
```

Function URL:

```
https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push
```

---

## 4. Database Webhooks (Dashboard)

**Dashboard → Database → Webhooks → Enable Webhooks → Create a new hook**

Create **two** hooks with these settings:

### Hook A — DM messages

| Field | Value |
|-------|-------|
| **Name** | `send-push-dm` |
| **Table** | `messages` |
| **Events** | ☑ Insert |
| **Type** | HTTP Request |
| **Method** | POST |
| **URL** | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push` |
| **HTTP Headers** | `Content-Type`: `application/json` |
| | `Authorization`: `Bearer YOUR_SERVICE_ROLE_KEY` |
| **Timeout** | 5000 ms (default is fine) |

### Hook B — Group messages

| Field | Value |
|-------|-------|
| **Name** | `send-push-group` |
| **Table** | `group_messages` |
| **Events** | ☑ Insert |
| **Type** | HTTP Request |
| **Method** | POST |
| **URL** | `https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push` |
| **HTTP Headers** | Same as Hook A |

**Service role key:** Dashboard → Project Settings → API → `service_role` (secret).

The function verifies the JWT in `Authorization` (`verify_jwt = true` in `config.toml`).

---

## 5. Manual test (optional)

Direct invoke (bypasses webhook parsing):

```bash
curl -s -X POST \
  "https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push" \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "RECIPIENT_UUID",
    "conversation_id": "CONVERSATION_OR_GROUP_UUID",
    "conversation_type": "dm"
  }'
```

Expected response when tokens exist:

```json
{ "ok": true, "sent": 1, "disabled": 0, "skipped": null, ... }
```

---

## 6. Acceptance checklist

1. Phone A (app closed) ← B sends DM → banner **"Celesth: New message"** within seconds; tap opens conversation.
2. Group: sender gets **no** push; other members do.
3. Lock screen shows no plaintext, usernames, or media info.
4. Settings toggle OFF → no pushes; ON → resume.
5. Stale token → APNs 410/400 → `device_tokens.enabled = false`.
6. App foreground in chat → no disruptive banner (iOS + client no-op handler).

---

## 7. Sandbox vs production tokens

- **Xcode ⌘R dev builds** register **sandbox** tokens → set `APNS_ENDPOINT=api.sandbox.push.apple.com`.
- **TestFlight / App Store** use **production** tokens → set `APNS_ENDPOINT=api.push.apple.com`.

A sandbox token sent to production APNs (or vice versa) returns `BadDeviceToken`; the function disables that row.
