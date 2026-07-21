import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose";

/** Content-free push payload — never add message text or usernames here. */
type ApnsPayload = {
  aps: {
    alert: { title: string; body: string };
    sound: "default";
  };
  conversationId: string;
  conversationType: "dm" | "group";
};

type PushJob = {
  userId: string;
  conversationId: string;
  conversationType: "dm" | "group";
  messageUuid?: string;
};

type WebhookBody = {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown>;
};

type DirectBody = {
  user_id?: string;
  conversation_id?: string;
  conversation_type?: string;
  message_uuid?: string;
};

const JWT_TTL_MS = 45 * 60 * 1000;

let cachedJwt: { token: string; expiresAt: number } | null = null;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function normalizeP8Key(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("BEGIN PRIVATE KEY")) {
    return trimmed.replace(/\\n/g, "\n");
  }
  return `-----BEGIN PRIVATE KEY-----\n${trimmed.replace(/\\n/g, "\n")}\n-----END PRIVATE KEY-----`;
}

function apnsHost(): string {
  const endpoint = Deno.env.get("APNS_ENDPOINT")?.trim();
  if (!endpoint) return "api.push.apple.com";
  return endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function getApnsJwt(): Promise<string> {
  const now = Date.now();
  if (cachedJwt && cachedJwt.expiresAt > now) {
    return cachedJwt.token;
  }

  const keyRaw = Deno.env.get("APNS_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!keyRaw || !keyId || !teamId) {
    throw new Error("Missing APNS_KEY, APNS_KEY_ID, or APNS_TEAM_ID");
  }

  const privateKey = await importPKCS8(normalizeP8Key(keyRaw), "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(Math.floor(now / 1000))
    .sign(privateKey);

  cachedJwt = { token, expiresAt: now + JWT_TTL_MS };
  return token;
}

function buildApnsPayload(job: PushJob): ApnsPayload {
  return {
    aps: {
      alert: { title: "Celesth", body: "New message" },
      sound: "default",
    },
    conversationId: job.conversationId,
    conversationType: job.conversationType,
  };
}

async function sendApns(
  deviceToken: string,
  payload: ApnsPayload,
): Promise<{ status: number; reason?: string }> {
  const topic = Deno.env.get("APNS_TOPIC") ?? "com.celesth.app";
  const jwt = await getApnsJwt();
  const host = apnsHost();

  const response = await fetch(`https://${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return { status: response.status };
  }

  let reason: string | undefined;
  try {
    const body = (await response.json()) as { reason?: string };
    reason = body.reason;
  } catch {
    // Ignore parse failures.
  }

  return { status: response.status, reason };
}

function shouldDisableToken(status: number, reason?: string): boolean {
  if (status === 410) return true;
  if (status !== 400 || !reason) return false;
  return reason === "BadDeviceToken" || reason === "Unregistered" ||
    reason === "ExpiredToken";
}

function isEditOrDelete(record: Record<string, unknown>): boolean {
  return record.edit_of != null || record.delete_of != null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function resolveDmJob(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown>,
): Promise<PushJob | null> {
  if (isEditOrDelete(record)) {
    return null;
  }

  const conversationId = asString(record.conversation_id);
  const senderId = asString(record.sender_id);
  const messageId = asString(record.id);
  if (!conversationId || !senderId) return null;

  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("participant_a, participant_b")
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !conversation) {
    console.error("[send-push] conversation lookup failed:", error?.message);
    return null;
  }

  const recipientId = conversation.participant_a === senderId
    ? conversation.participant_b
    : conversation.participant_a;

  if (!recipientId || recipientId === senderId) {
    return null;
  }

  return {
    userId: recipientId,
    conversationId,
    conversationType: "dm",
    messageUuid: messageId ?? undefined,
  };
}

function resolveGroupJob(record: Record<string, unknown>): PushJob | null {
  if (isEditOrDelete(record)) {
    return null;
  }

  const groupId = asString(record.group_id);
  const senderId = asString(record.sender_id);
  const recipientId = asString(record.recipient_id);
  const messageUuid = asString(record.message_uuid) ?? undefined;

  if (!groupId || !senderId || !recipientId) return null;
  if (recipientId === senderId) return null;

  return {
    userId: recipientId,
    conversationId: groupId,
    conversationType: "group",
    messageUuid,
  };
}

async function parseRequestBody(
  supabase: ReturnType<typeof createClient>,
  body: unknown,
): Promise<PushJob | null> {
  if (!body || typeof body !== "object") return null;

  const direct = body as DirectBody;
  if (direct.user_id && direct.conversation_id && direct.conversation_type) {
    const conversationType = direct.conversation_type === "group" ? "group" : "dm";
    return {
      userId: direct.user_id,
      conversationId: direct.conversation_id,
      conversationType,
      messageUuid: direct.message_uuid,
    };
  }

  const webhook = body as WebhookBody;
  if (webhook.type !== "INSERT" || !webhook.record) {
    return null;
  }

  if (webhook.table === "messages") {
    return resolveDmJob(supabase, webhook.record);
  }

  if (webhook.table === "group_messages") {
    return resolveGroupJob(webhook.record);
  }

  return null;
}

async function sendPushForJob(
  supabase: ReturnType<typeof createClient>,
  job: PushJob,
): Promise<{ sent: number; disabled: number; skipped: string | null }> {
  const { data: tokens, error } = await supabase
    .from("device_tokens")
    .select("token")
    .eq("user_id", job.userId)
    .eq("enabled", true)
    .eq("platform", "ios");

  if (error) {
    console.error("[send-push] token lookup failed:", error.message);
    throw error;
  }

  if (!tokens?.length) {
    return { sent: 0, disabled: 0, skipped: "no_enabled_tokens" };
  }

  const payload = buildApnsPayload(job);
  let sent = 0;
  let disabled = 0;

  const results = await Promise.all(
    tokens.map(async ({ token }: { token: string }) => {
      const result = await sendApns(token, payload);
      if (result.status === 200) {
        sent += 1;
        return;
      }

      console.error(
        "[send-push] APNs error:",
        result.status,
        result.reason ?? "unknown",
        "user",
        job.userId,
      );

      if (shouldDisableToken(result.status, result.reason)) {
        const { error: updateError } = await supabase
          .from("device_tokens")
          .update({
            enabled: false,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", job.userId)
          .eq("token", token);

        if (updateError) {
          console.error(
            "[send-push] token disable failed:",
            updateError.message,
          );
        } else {
          disabled += 1;
        }
      }
    }),
  );

  void results;
  return { sent, disabled, skipped: null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Missing Supabase env" }, 500);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const job = await parseRequestBody(supabase, body);
  if (!job) {
    return jsonResponse({ ok: true, skipped: "no_push_needed" });
  }

  try {
    const result = await sendPushForJob(supabase, job);
    return jsonResponse({
      ok: true,
      user_id: job.userId,
      conversation_id: job.conversationId,
      conversation_type: job.conversationType,
      message_uuid: job.messageUuid ?? null,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    console.error("[send-push] failed:", message);
    return jsonResponse({ error: message }, 500);
  }
});
