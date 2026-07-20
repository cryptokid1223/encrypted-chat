import type { AttachmentMeta } from "@/lib/fileCrypto";

export type ParsedMessageBody =
  | { type: "text"; text: string }
  | { type: "attachment"; meta: AttachmentMeta };

const ATTACHMENT_PREFIX = '{"_celesth"';

export function buildAttachmentBody(meta: AttachmentMeta): string {
  return JSON.stringify({ _celesth: "attachment", v: 1, meta });
}

export function parseMessageBody(plaintext: string): ParsedMessageBody {
  if (!plaintext.startsWith(ATTACHMENT_PREFIX)) {
    return { type: "text", text: plaintext };
  }

  try {
    const parsed = JSON.parse(plaintext) as {
      _celesth?: string;
      meta?: AttachmentMeta;
    };
    if (parsed?._celesth === "attachment" && parsed.meta?.v === 1) {
      return { type: "attachment", meta: parsed.meta };
    }
  } catch {
    // Malformed JSON — treat as plain text.
  }

  return { type: "text", text: plaintext };
}

/** Sidebar / list preview line for a decrypted message body. */
export function messagePreviewText(plaintext: string): string {
  const parsed = parseMessageBody(plaintext);
  if (parsed.type === "attachment") {
    return "📷 Photo";
  }
  const trimmed = parsed.text.trim();
  if (!trimmed) {
    return "Encrypted message";
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
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
