# Manual test: `/api/rewrite`

Start the dev server:

```bash
npm run dev
```

Base URL: `http://localhost:3000`

---

## 1. Unauthenticated → 401

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST http://localhost:3000/api/rewrite \
  -H "Content-Type: application/json" \
  -d '{"text":"hello world","tone":"formal"}'
```

Expected: HTTP `401` and body `{"error":"unauthorized"}`.

---

## 2. Authenticated → 200

This app stores the Supabase session in **HTTP cookies** via `@supabase/ssr` (names like `sb-<project-ref>-auth-token`, sometimes split into `.0`, `.1`, … chunks). The next client phase will also support `Authorization: Bearer <access_token>`.

### Option A — Cookie session (easiest for local curl)

1. Log in at `http://localhost:3000` in your browser.
2. Open DevTools → **Console** and run:

   ```javascript
   copy(document.cookie)
   ```

3. Paste the copied string into the curl below as `PASTE_COOKIES_HERE`:

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST http://localhost:3000/api/rewrite \
  -H "Content-Type: application/json" \
  -H "Cookie: PASTE_COOKIES_HERE" \
  -d '{"text":"hey wanna grab food later my treat lol","tone":"formal"}'
```

Expected: HTTP `200` and body like `{"rewritten":"…"}` with a more formal rewrite.

### Option B — Bearer token (matches the upcoming client)

1. Log in at `http://localhost:3000`.
2. Open DevTools → **Network**, filter by your Supabase project host (`*.supabase.co`).
3. Trigger any authenticated action (e.g. load chats) and open a request to Supabase.
4. Copy the `Authorization` header value (`Bearer eyJ…`), or copy only the JWT after `Bearer `.

```bash
ACCESS_TOKEN="paste_jwt_here"

curl -s -w "\nHTTP %{http_code}\n" \
  -X POST http://localhost:3000/api/rewrite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -d '{"text":"hey wanna grab food later my treat lol","tone":"formal"}'
```

Expected: HTTP `200` and `{"rewritten":"…"}`.

---

## Other quick checks

**Invalid tone → 400**

```bash
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST http://localhost:3000/api/rewrite \
  -H "Content-Type: application/json" \
  -H "Cookie: PASTE_COOKIES_HERE" \
  -d '{"text":"hello","tone":"pirate"}'
```

**Too long → 400 with reason**

```bash
python3 -c "print('{\"text\":\"' + 'x'*1001 + '\",\"tone\":\"formal\"}')" | \
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST http://localhost:3000/api/rewrite \
  -H "Content-Type: application/json" \
  -H "Cookie: PASTE_COOKIES_HERE" \
  -d @-
```

Expected: `{"error":"invalid_input","reason":"too_long"}`.

**Rate limit → 429**

Send 6 authenticated requests within one minute; the 6th should return:

```json
{"error":"rate_limited","retryAfterSeconds":<number>}
```

**Wrong method → 405**

```bash
curl -s -w "\nHTTP %{http_code}\n" http://localhost:3000/api/rewrite
```
