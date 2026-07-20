"use client";

import { memo } from "react";
import { formatDayDivider, formatMessageTime } from "@/lib/chat";

export type MessageBubbleProps = {
  id: string;
  body: string;
  isMine: boolean;
  timestamp: string;
  showDayDivider: boolean;
  showTimestamp: boolean;
  bubbleRadius: string;
  marginTop: number;
  failed?: boolean;
  onRetry?: (id: string) => void;
};

export const MessageBubble = memo(function MessageBubble({
  id,
  body,
  isMine,
  timestamp,
  showDayDivider,
  showTimestamp,
  bubbleRadius,
  marginTop,
  failed,
  onRetry,
}: MessageBubbleProps) {
  return (
    <>
      {showDayDivider ? (
        <div className="my-4 flex justify-center">
          <span className="text-[12px] text-[#6E6963]">
            {formatDayDivider(timestamp)}
          </span>
        </div>
      ) : null}
      <div
        className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
        style={{ marginTop }}
      >
        <div
          className={`flex max-w-[65%] flex-col gap-1 ${
            isMine ? "items-end" : "items-start"
          }`}
        >
          <div
            className={`px-[14px] py-[10px] text-[15px] leading-[1.4] ${bubbleRadius} ${
              isMine
                ? failed
                  ? "bg-[#EA580C]/60 text-white"
                  : "bg-[#EA580C] text-white"
                : "bg-[#242220] text-[#FAFAF9]"
            }`}
          >
            {body}
          </div>
          {failed && onRetry ? (
            <button
              type="button"
              onClick={() => onRetry(id)}
              className="text-[11px] font-medium text-red-400 transition-colors duration-150 ease-in-out hover:text-red-300"
            >
              Tap to retry
            </button>
          ) : null}
        </div>
        {showTimestamp ? (
          <span className="mt-1 px-1 text-[11px] text-[#6E6963]">
            {formatMessageTime(timestamp)}
          </span>
        ) : null}
      </div>
    </>
  );
});
