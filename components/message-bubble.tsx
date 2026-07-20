"use client";

import { memo } from "react";
import { InlineSpinner } from "@/components/inline-spinner";
import { PhotoIcon } from "@/components/icons";
import { formatDayDivider, formatMessageTime } from "@/lib/chat";
import type { AttachmentMeta } from "@/lib/fileCrypto";
import {
  attachmentDisplaySize,
  parseMessageBody,
} from "@/lib/messageContent";

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

function AttachmentPlaceholder({
  meta,
  isMine,
}: {
  meta: AttachmentMeta;
  isMine: boolean;
}) {
  const { width, height } = attachmentDisplaySize(meta.w ?? 200, meta.h ?? 200);

  return (
    <div
      className={`flex items-center justify-center gap-[var(--sp-2)] ${
        isMine
          ? "bg-[var(--accent)] text-white"
          : "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
      }`}
      style={{ width, height, minWidth: width, minHeight: height }}
    >
      <PhotoIcon className="h-6 w-6 shrink-0 opacity-80" />
      <span className="text-[length:var(--text-secondary-size)] font-medium">
        Photo
      </span>
    </div>
  );
}

function AttachmentImage({
  src,
  meta,
  isPending,
  failed,
  isMine,
}: {
  src: string;
  meta: AttachmentMeta;
  isPending?: boolean;
  failed?: boolean;
  isMine: boolean;
}) {
  const { width, height } = attachmentDisplaySize(meta.w ?? 200, meta.h ?? 200);

  return (
    <div
      className="relative overflow-hidden"
      style={{ width, height, minWidth: width, minHeight: height }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={width}
        height={height}
        className={`block h-full w-full object-cover ${
          isPending ? "opacity-60" : failed ? "opacity-50" : ""
        }`}
      />
      {isPending ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
          <InlineSpinner
            className={`h-5 w-5 ${isMine ? "text-white" : "text-[var(--text-primary)]"}`}
          />
        </div>
      ) : null}
    </div>
  );
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
              {localPreviewUrl ? (
                <AttachmentImage
                  src={localPreviewUrl}
                  meta={attachmentMeta}
                  isPending={isPending}
                  failed={failed}
                  isMine={isMine}
                />
              ) : (
                <AttachmentPlaceholder meta={attachmentMeta} isMine={isMine} />
              )}
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
