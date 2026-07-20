"use client";

import { memo } from "react";
import { formatDayDivider, formatMessageTime } from "@/lib/chat";

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
  onRetry,
}: MessageBubbleProps) {
  const radiusClass = bubbleRadiusClass(isMine, isFirstInGroup, isLastInGroup);
  const groupGap = isFirstInGroup ? "var(--sp-3)" : "2px";

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
          <div
            className={`px-3 py-2 text-[length:var(--text-body)] leading-[1.35] break-words whitespace-pre-wrap ${radiusClass} ${
              isMine
                ? failed
                  ? "bg-[var(--accent)]/60 text-white"
                  : "bg-[var(--accent)] text-white"
                : "bg-[var(--surface-elevated)] text-[var(--text-primary)]"
            } ${isPending ? "opacity-70" : ""}`}
          >
            {body}
          </div>
          {failed && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(id)}
              className="pressable text-[length:var(--text-caption)] font-medium text-[var(--destructive)]"
            >
              Tap to retry
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
