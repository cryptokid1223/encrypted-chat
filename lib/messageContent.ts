import type { AttachmentMeta } from "@/lib/fileCrypto";

export type ParsedMessageBody =
  | { type: "text"; text: string }
  | { type: "attachment"; meta: AttachmentMeta }
  | { type: "edit"; text: string; editOf: string }
  | { type: "delete"; deleteOf: string };

export const DELETED_MESSAGE_PLACEHOLDER = "🚫 This message was deleted";
export const DELETED_PREVIEW_TEXT = "Message deleted";

const CELESTH_PREFIX = '{"_celesth"';

export function buildAttachmentBody(meta: AttachmentMeta): string {
  return JSON.stringify({ _celesth: "attachment", v: 1, meta });
}

export function buildDeleteBody(deleteOf: string): string {
  return JSON.stringify({ _celesth: "delete", v: 1, deleteOf });
}

export function parseMessageBody(plaintext: string): ParsedMessageBody {
  if (!plaintext.startsWith(CELESTH_PREFIX)) {
    return { type: "text", text: plaintext };
  }

  try {
    const parsed = JSON.parse(plaintext) as {
      _celesth?: string;
      v?: number;
      meta?: AttachmentMeta;
      text?: string;
      editOf?: string;
      deleteOf?: string;
    };
    if (parsed?._celesth === "attachment" && parsed.meta?.v === 1) {
      return { type: "attachment", meta: parsed.meta };
    }
    if (
      parsed?._celesth === "delete" &&
      parsed.v === 1 &&
      typeof parsed.deleteOf === "string"
    ) {
      return { type: "delete", deleteOf: parsed.deleteOf };
    }
    if (
      parsed?._celesth === "edit" &&
      parsed.v === 1 &&
      typeof parsed.text === "string" &&
      typeof parsed.editOf === "string"
    ) {
      return {
        type: "edit",
        text: parsed.text,
        editOf: parsed.editOf,
      };
    }
  } catch {
    // Malformed JSON — treat as plain text.
  }

  return { type: "text", text: plaintext };
}

/** Sidebar / list preview line for a decrypted message body. */
export function messagePreviewText(plaintext: string): string {
  const parsed = parseMessageBody(plaintext);
  if (parsed.type === "delete") {
    return DELETED_PREVIEW_TEXT;
  }
  if (parsed.type === "edit") {
    const trimmed = parsed.text.trim();
    if (!trimmed) return "Encrypted message";
    return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
  }
  if (parsed.type === "attachment") {
    return attachmentPreviewLabel(parsed.meta);
  }
  const trimmed = parsed.text.trim();
  if (!trimmed) {
    return "Encrypted message";
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
}

/** Conversation list preview for attachment messages. */
export function attachmentPreviewLabel(meta: AttachmentMeta): string {
  if (meta.kind === "video") {
    return "🎥 Video";
  }
  if (meta.kind === "audio") {
    return "🎤 Voice message";
  }
  return "📷 Photo";
}

/** Format milliseconds as m:ss for video duration badges. */
export function formatDurationMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Display dimensions for attachment bubbles (max 75% width handled by CSS). */
export function attachmentDisplaySize(
  w: number,
  h: number,
  maxWidth = 280,
  maxHeight = 320,
): { width: number; height: number } {
  if (w <= 0 || h <= 0) {
    return { width: 200, height: 200 };
  }
  const scale = Math.min(maxWidth / w, maxHeight / h, 1);
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}
