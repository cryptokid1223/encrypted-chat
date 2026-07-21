"use client";

import { memo, useMemo, useState } from "react";
import { AttachmentBubble } from "@/components/attachment-bubble";
import {
  MessageActionSheet,
  useMessageLongPress,
} from "@/components/message-actions";
import { formatDayDivider, formatMessageTime } from "@/lib/chat";
import type { AttachmentMeta } from "@/lib/fileCrypto";
import { DELETED_MESSAGE_PLACEHOLDER, parseMessageBody } from "@/lib/messageContent";

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
  pendingAttachment?: Pick<
    AttachmentMeta,
    "kind" | "w" | "h" | "durationMs"
  >;
  senderLabel?: string;
  senderId?: string;
  decryptFailed?: boolean;
  attachmentCacheScope?: string;
  edited?: boolean;
  deleted?: boolean;
  onEditRequest?: () => void;
  onDeleteForEveryoneRequest?: () => void;
  onDeleteForMeRequest?: () => void;
  onRetry?: (id: string) => void;
};

const SENDER_COLOR_VARS = [
  "var(--sender-1)",
  "var(--sender-2)",
  "var(--sender-3)",
  "var(--sender-4)",
  "var(--sender-5)",
  "var(--sender-6)",
] as const;

function senderColorFromId(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return SENDER_COLOR_VARS[hash % SENDER_COLOR_VARS.length];
}

function bubbleRadiusClass(isMine: boolean, isLastInGroup: boolean): string {
  if (!isLastInGroup) return "rounded-[18px]";
  return isMine
    ? "rounded-[18px] rounded-br-[6px]"
    : "rounded-[18px] rounded-bl-[6px]";
}

function DatePill({ label }: { label: string }) {
  return (
    <div className="flex justify-center" style={{ margin: "16px 0" }}>
      <span className="rounded-[12px] bg-[var(--surface)] px-3 py-1 text-[12px] leading-none text-[var(--text-secondary)]">
        {label}
      </span>
    </div>
  );
}

function BubbleTimestamp({
  timestamp,
  isMine,
  overlay,
  edited,
}: {
  timestamp: string;
  isMine: boolean;
  overlay?: boolean;
  edited?: boolean;
}) {
  const time = formatMessageTime(timestamp);
  const editedLabel = edited ? (
    <span className="opacity-[0.65]">Edited · </span>
  ) : null;
  if (overlay) {
    return (
      <span
        className="pointer-events-none absolute bottom-[6px] right-[8px] rounded-[6px] bg-black/45 px-[5px] py-[2px] text-[11px] leading-none text-white/90"
        aria-hidden
      >
        {edited ? "Edited · " : null}
        {time}
      </span>
    );
  }
  return (
    <span
      className={`relative top-[3px] float-right ml-2 whitespace-nowrap text-[11px] leading-[1.35] opacity-[0.65] ${
        isMine ? "text-white" : "text-[var(--text-primary)]"
      }`}
    >
      {editedLabel}
      {time}
    </span>
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
  pendingAttachment,
  senderLabel,
  senderId,
  decryptFailed,
  attachmentCacheScope,
  edited,
  deleted,
  onEditRequest,
  onDeleteForEveryoneRequest,
  onDeleteForMeRequest,
  onRetry,
}: MessageBubbleProps) {
  const [actionOpen, setActionOpen] = useState(false);
  const hasContextMenu = Boolean(
    onEditRequest || onDeleteForEveryoneRequest || onDeleteForMeRequest,
  );
  const longPress = useMessageLongPress(() => {
    if (hasContextMenu) setActionOpen(true);
  });

  const menuActions = useMemo(() => {
    const actions: {
      label: string;
      onSelect: () => void;
      destructive?: boolean;
    }[] = [];
    if (onEditRequest) {
      actions.push({ label: "Edit", onSelect: onEditRequest });
    }
    if (onDeleteForEveryoneRequest) {
      actions.push({
        label: "Delete for Everyone",
        onSelect: onDeleteForEveryoneRequest,
        destructive: true,
      });
    }
    if (onDeleteForMeRequest) {
      actions.push({ label: "Delete for Me", onSelect: onDeleteForMeRequest });
    }
    return actions;
  }, [onEditRequest, onDeleteForEveryoneRequest, onDeleteForMeRequest]);

  const radiusClass = bubbleRadiusClass(isMine, isLastInGroup);
  const groupGap = isFirstInGroup ? "10px" : "2px";
  const parsed = parseMessageBody(body);
  const isAttachment =
    !deleted &&
    (parsed.type === "attachment" ||
      Boolean((localPreviewUrl || pendingAttachment) && !body));

  const attachmentMeta: AttachmentMeta | null =
    parsed.type === "attachment"
      ? parsed.meta
      : localPreviewUrl || pendingAttachment
        ? {
            v: 1,
            kind: pendingAttachment?.kind ?? "image",
            path: "",
            key: "",
            nonce: "",
            mime:
              pendingAttachment?.kind === "video"
                ? "video/mp4"
                : pendingAttachment?.kind === "audio"
                  ? "audio/mp4"
                  : "image/jpeg",
            size: 0,
            w:
              pendingAttachment?.kind === "audio"
                ? undefined
                : (pendingAttachment?.w ?? 200),
            h:
              pendingAttachment?.kind === "audio"
                ? undefined
                : (pendingAttachment?.h ?? 200),
            durationMs: pendingAttachment?.durationMs,
          }
        : null;

  const bubbleClass = isMine
    ? failed
      ? "bg-[var(--bubble-out-failed)] text-white"
      : "bg-[var(--bubble-out)] text-white"
    : "bg-[var(--surface)] text-[var(--text-primary)]";

  const showTime = isLastInGroup && !failed;
  const isVisualMedia =
    attachmentMeta?.kind === "image" || attachmentMeta?.kind === "video";

  return (
    <>
      {showDayDivider ? (
        <DatePill label={formatDayDivider(timestamp)} />
      ) : null}
      <div
        className={`flex flex-col ${isMine ? "items-end" : "items-start"}${animateIn ? " msg-enter" : ""}`}
        style={{ marginTop: showDayDivider ? 0 : groupGap }}
      >
        <div
          className={`flex max-w-[75%] flex-col ${
            isMine ? "items-end" : "items-start"
          }`}
        >
          {senderLabel && !isMine && isFirstInGroup ? (
            <span
              className="mb-0.5 px-[2px] text-[13px] font-semibold leading-tight"
              style={{
                color: senderId
                  ? senderColorFromId(senderId)
                  : "var(--text-secondary)",
              }}
            >
              {senderLabel}
            </span>
          ) : null}
          {deleted ? (
            <div
              className={`px-[14px] py-[10px] text-[15px] leading-[1.35] italic text-[var(--text-secondary)] ${radiusClass} bg-[var(--surface)]`}
              {...(hasContextMenu ? longPress : {})}
            >
              {DELETED_MESSAGE_PLACEHOLDER}
              {showTime ? (
                <BubbleTimestamp timestamp={timestamp} isMine={isMine} />
              ) : null}
            </div>
          ) : decryptFailed ? (
            <div
              className={`px-[14px] py-[10px] text-[15px] leading-[1.35] ${radiusClass} bg-[var(--surface)] text-[var(--text-secondary)]`}
              {...(hasContextMenu ? longPress : {})}
            >
              Couldn&apos;t decrypt message
            </div>
          ) : isAttachment && attachmentMeta ? (
            <div
              className={`relative overflow-hidden ${radiusClass} ${bubbleClass} ${
                isPending && !localPreviewUrl && attachmentMeta.kind !== "audio"
                  ? "opacity-70"
                  : ""
              }`}
              style={
                attachmentMeta.kind === "audio" ? undefined : { maxHeight: 320 }
              }
              {...(hasContextMenu ? longPress : {})}
            >
              <AttachmentBubble
                meta={attachmentMeta}
                isMine={isMine}
                localPreviewUrl={localPreviewUrl}
                isPending={isPending}
                failed={failed}
                cacheScope={attachmentCacheScope}
              />
              {showTime && isVisualMedia ? (
                <BubbleTimestamp
                  timestamp={timestamp}
                  isMine={isMine}
                  overlay
                />
              ) : null}
              {showTime && attachmentMeta.kind === "audio" ? (
                <div className="flex justify-end px-[14px] pb-[8px]">
                  <span
                    className={`text-[11px] leading-none opacity-[0.65] ${
                      isMine ? "text-white" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {formatMessageTime(timestamp)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className={`px-[14px] py-[10px] text-[15px] leading-[1.35] break-words whitespace-pre-wrap ${radiusClass} ${bubbleClass} ${
                isPending ? "opacity-70" : ""
              }`}
              {...(hasContextMenu ? longPress : {})}
            >
              {parsed.type === "text" ? parsed.text : body}
              {showTime ? (
                <BubbleTimestamp
                  timestamp={timestamp}
                  isMine={isMine}
                  edited={edited}
                />
              ) : null}
            </div>
          )}
          {failed && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(id)}
              className="pressable mt-1 text-[12px] font-medium text-[var(--destructive)]"
            >
              Failed — tap to retry
            </button>
          ) : null}
        </div>
      </div>
      {actionOpen && menuActions.length > 0 ? (
        <MessageActionSheet
          actions={menuActions}
          onClose={() => setActionOpen(false)}
        />
      ) : null}
    </>
  );
});

export function SystemPill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-center" style={{ margin: "16px 0" }}>
      <span className="rounded-[12px] bg-[var(--surface)] px-3 py-1 text-[12px] leading-none text-[var(--text-secondary)]">
        {children}
      </span>
    </div>
  );
}
