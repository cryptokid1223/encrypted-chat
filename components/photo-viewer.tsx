"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";
import { usePhotoViewerHost } from "@/components/photo-viewer-host";

const MIN_SCALE = 1;
const MAX_SCALE = 3;

function pinchDistance(t0: React.Touch, t1: React.Touch): number {
  const dx = t0.clientX - t1.clientX;
  const dy = t0.clientY - t1.clientY;
  return Math.hypot(dx, dy);
}

export function PhotoViewer({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  const hostRef = usePhotoViewerHost();
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );
  const lastTapRef = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleImagePointerDown = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (scaleRef.current <= 1) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
      };
    },
    [],
  );

  const handleImagePointerMove = useCallback(
    (e: React.PointerEvent<HTMLImageElement>) => {
      if (!panStartRef.current) return;
      setPan({
        x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
      });
    },
    [],
  );

  const handleImagePointerUp = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const handleImageClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        if (scaleRef.current > 1) {
          resetTransform();
        } else {
          setScale(2.5);
        }
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
    },
    [resetTransform],
  );

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2) {
      pinchStartRef.current = {
        distance: pinchDistance(e.touches[0], e.touches[1]),
        scale: scaleRef.current,
      };
      panStartRef.current = null;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLImageElement>) => {
    if (e.touches.length === 2 && pinchStartRef.current) {
      const distance = pinchDistance(e.touches[0], e.touches[1]);
      const next = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pinchStartRef.current.scale * (distance / pinchStartRef.current.distance)),
      );
      setScale(next);
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 1 && scaleRef.current > 1 && !pinchStartRef.current) {
      const touch = e.touches[0];
      if (!panStartRef.current) {
        panStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
      } else {
        setPan({
          x: panStartRef.current.panX + (touch.clientX - panStartRef.current.x),
          y: panStartRef.current.panY + (touch.clientY - panStartRef.current.y),
        });
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    pinchStartRef.current = null;
    panStartRef.current = null;
    if (scaleRef.current <= 1.05) {
      resetTransform();
    }
  }, [resetTransform]);

  const host = hostRef?.current;
  if (!host) return null;

  return createPortal(
    <div
      className="absolute inset-0 z-[60] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      <button
        type="button"
        aria-label="Close photo viewer"
        className="absolute inset-0"
        onClick={handleBackdropClick}
      />
      <div className="safe-pt pointer-events-none relative z-10 flex justify-end px-[var(--sp-2)]">
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="pressable pointer-events-auto flex h-11 w-11 items-center justify-center text-white"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center overflow-hidden px-[var(--sp-2)] pb-[var(--sp-4)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          draggable={false}
          onClick={handleImageClick}
          onPointerDown={handleImagePointerDown}
          onPointerMove={handleImagePointerMove}
          onPointerUp={handleImagePointerUp}
          onPointerCancel={handleImagePointerUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          className="pointer-events-auto max-h-full max-w-full select-none object-contain touch-none"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        />
      </div>
    </div>,
    host,
  );
}
