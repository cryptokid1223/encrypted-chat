"use client";

import { useCallback, useRef } from "react";
import { CloseIcon } from "@/components/icons";

const LONG_PRESS_MS = 500;

export function useMessageLongPress(onLongPress: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: () => {
      clear();
      timerRef.current = setTimeout(onLongPress, LONG_PRESS_MS);
    },
    onTouchEnd: clear,
    onTouchMove: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress();
    },
  };
}

export function MessageActionSheet({
  actions,
  onClose,
}: {
  actions: { label: string; onSelect: () => void }[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/25 p-[var(--sp-4)] sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-[14px] bg-[var(--surface-elevated)] shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="menu"
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            role="menuitem"
            className="pressable block w-full border-b border-[var(--row-separator)] px-[var(--sp-4)] py-[var(--sp-3)] text-left text-[length:var(--text-body)] text-[var(--text-primary)] last:border-b-0"
            onClick={() => {
              action.onSelect();
              onClose();
            }}
          >
            {action.label}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          className="pressable block w-full px-[var(--sp-4)] py-[var(--sp-3)] text-center text-[length:var(--text-body)] font-medium text-[var(--text-secondary)]"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function MessageEditBanner({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="mb-[var(--sp-1)] flex items-center justify-between gap-[var(--sp-2)] border-b border-[var(--row-separator)] pb-[var(--sp-1)]">
      <span className="text-[length:var(--text-caption)] text-[var(--text-secondary)]">
        Editing message
      </span>
      <button
        type="button"
        aria-label="Cancel edit"
        onClick={onCancel}
        className="pressable flex h-8 w-8 items-center justify-center text-[var(--text-secondary)]"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
