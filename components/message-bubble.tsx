"use client";

import { memo } from "react";
import { AttachmentBubble } from "@/components/attachment-bubble";
import { formatDayDivider, formatMessageTime } from "@/lib/chat";
import type { AttachmentMeta } from "@/lib/fileCrypto";
import { parseMessageBody } from "@/lib/messageContent";

export type MessageBubbleProps = {
  id: string;
  body: string;
  isMine: boolean;
  timestamp: string;
  showDayDivider: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isPending?: boolean;
  animateIn?: boolean;
  failed?: boolean;
  localPreviewUrl?: string;
  onRetry?: (id: string) => void;
};

function bubbleRadiusClass(
  isMine: boolean,
  isFirstInGroup: boolean,
  isLastInGroup: boolean,
): string {
  if (isMine) {
    if (isFirstInGroup && isLastInGroup) {
      return "rounded-[18px] rounded-br-[6px]";
    }
    if (isFirstInGroup) {
      return "rounded-[18px] rounded-br-[6px]";
    }
    if (isLastInGroup) {
      return "rounded-[18px] rounded-tr-[6px] rounded-br-[6px]";
    }
    return "rounded-[18px] rounded-tr-[6px] rounded-br-[6px]";
  }

  if (isFirstInGroup && isLastInGroup) {
    return "rounded-[18px] rounded-bl-[6px]";
  }
  if (isFirstInGroup) {
    return "rounded-[18px] rounded-bl-[6px]";
  }
  if (isLastInGroup) {
    return "rounded-[18px] rounded-tl-[6px] rounded-bl-[6px]";
  }
  return "rounded-[18px] rounded-tl-[6px] rounded-bl-[6px]";
}

export const MessageBubble = memo(function MessageBubble({
  id,
  body,
  isMine,
  timestamp,
  showDayDivider,
  isFirstInGroup,
  isLastInGroup,
  isPending,
  animateIn,
  failed,
  localPreviewUrl,
  onRetry,
}: MessageBubbleProps) {
  const radiusClass = bubbleRadiusClass(isMine, isFirstInGroup, isLastInGroup);
  const groupGap = isFirstInGroup ? "var(--sp-3)" : "2px";
  const parsed = parseMessageBody(body);
  const isAttachment =
    parsed.type === "attachment" || Boolean(localPreviewUrl && !body);

  const attachmentMeta: AttachmentMeta | null =
    parsed.type === "attachment"
      ? parsed.meta
      : localPreviewUrl
        ? {
            v: 1,
            kind: "image",
            path: "",
            key: "",
            nonce: "",
            mime: "image/jpeg",
            size: 0,
            w: 200,
            h: 200,
          }
        : null;

  const bubbleClass = isMine
    ? failed
      ? "bg-[var(--accent)]/60 text-white"
      : "bg-[var(--accent)] text-white"
    : "bg-[var(--surface-elevated)] text-[var(--text-primary)]";

  return (
    <>
      {showDayDivider ? (
        <div
          className="flex justify-center"
          style={{ margin: "var(--sp-4) 0" }}
        >
          <span className="rounded-[10px] bg-[var(--surface)] px-[10px] py-1 text-[length:var(--text-caption)] text-[var(--text-secondary)]">
            {formatDayDivider(timestamp)}
          </span>
        </div>
      ) : null}
      <div
        className={`flex flex-col ${isMine ? "items-end" : "items-start"}${animateIn ? " msg-enter" : ""}`}
        style={{ marginTop: showDayDivider ? 0 : groupGap }}
      >
        <div
          className={`flex max-w-[75%] flex-col gap-[var(--sp-1)] ${
            isMine ? "items-end" : "items-start"
          }`}
        >
          {isAttachment && attachmentMeta ? (
            <div
              className={`overflow-hidden ${radiusClass} ${bubbleClass} ${
                isPending && !localPreviewUrl ? "opacity-70" : ""
              }`}
              style={{ maxHeight: 320 }}
            >
              <AttachmentBubble
                meta={attachmentMeta}
                isMine={isMine}
                localPreviewUrl={localPreviewUrl}
                isPending={isPending}
                failed={failed}
              />
            </div>
          ) : (
            <div
              className={`px-3 py-2 text-[length:var(--text-body)] leading-[1.35] break-words whitespace-pre-wrap ${radiusClass} ${bubbleClass} ${
                isPending ? "opacity-70" : ""
              }`}
            >
              {parsed.type === "text" ? parsed.text : body}
            </div>
          )}
          {failed && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(id)}
              className="pressable text-[length:var(--text-caption)] font-medium text-[var(--destructive)]"
            >
              Failed — tap to retry
            </button>
          ) : null}
        </div>
        {isLastInGroup ? (
          <span
            className={`mt-[var(--sp-1)] px-[var(--sp-1)] text-[length:var(--text-caption)] text-[var(--text-secondary)] ${
              isMine ? "text-right" : "text-left"
            }`}
          >
            {formatMessageTime(timestamp)}
          </span>
        ) : null}
      </div>
    </>
  );
});
