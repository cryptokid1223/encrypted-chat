"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeftIcon } from "@/components/icons";

type ScannerPhase = "scanning" | "permission-denied" | "invalid";

/** Match the visual scan window (~65vw, capped) used by html5-qrcode qrbox. */
function scanBoxSize(viewfinderWidth: number, viewfinderHeight: number): number {
  return Math.max(
    120,
    Math.floor(
      Math.min(viewfinderWidth * 0.65, viewfinderHeight * 0.65, 280),
    ),
  );
}

export function KeyQrScanner({
  onDecoded,
  onCancel,
}: {
  onDecoded: (text: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const elementId = useId().replace(/:/g, "");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const handlingRef = useRef(false);
  const onDecodedRef = useRef(onDecoded);
  const [phase, setPhase] = useState<ScannerPhase>("scanning");

  useEffect(() => {
    onDecodedRef.current = onDecoded;
  }, [onDecoded]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch {
      // ignore stop errors during teardown
    }
    try {
      scanner.clear();
    } catch {
      // ignore clear errors during teardown
    }
  }, []);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      void stopScanner();
    };
  }, [stopScanner]);

  useEffect(() => {
    if (phase !== "scanning") return;

    let cancelled = false;
    handlingRef.current = false;

    void (async () => {
      await stopScanner();
      if (cancelled) return;

      try {
        const scanner = new Html5Qrcode(elementId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (viewfinderWidth, viewfinderHeight) => {
              const size = scanBoxSize(viewfinderWidth, viewfinderHeight);
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            void (async () => {
              if (handlingRef.current || cancelled) return;
              handlingRef.current = true;

              await stopScanner();

              const ok = await onDecodedRef.current(decodedText);
              if (cancelled) return;
              if (ok) return;

              handlingRef.current = false;
              setPhase("invalid");
            })();
          },
          () => {
            // ignore per-frame decode misses
          },
        );
      } catch {
        if (!cancelled) {
          setPhase("permission-denied");
          await stopScanner();
        }
      }
    })();

    return () => {
      cancelled = true;
      void stopScanner();
    };
  }, [phase, elementId, stopScanner]);

  function handleCancel() {
    void (async () => {
      await stopScanner();
      onCancel();
    })();
  }

  return (
    <div
      className="absolute inset-0 z-[80] flex h-app flex-col overflow-hidden bg-[#0F0E0D]"
      role="dialog"
      aria-modal="true"
      aria-label="Scan QR code"
    >
      {phase === "scanning" ? (
        <>
          {/* Camera fills the app container; html5-qrcode injects video + #qr-shaded-region here. */}
          <div id={elementId} className="key-qr-reader absolute inset-0" />

          <button
            type="button"
            aria-label="Cancel scan"
            onClick={handleCancel}
            className="absolute left-[max(0.5rem,var(--safe-left))] top-[max(0.5rem,var(--safe-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-[#FAFAF9] transition-colors duration-150 ease-in-out hover:bg-black/60"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>

          <p
            className="pointer-events-none absolute left-1/2 z-20 max-w-xs -translate-x-1/2 px-6 text-center text-[14px] leading-[1.4] text-[#FAFAF9] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            style={{
              // Sit just below the library's centered qrbox (~65vw / max 280px).
              top: "calc(50% + min(32.5vw, 140px) + 1.5rem)",
              paddingBottom: "max(1rem, var(--safe-bottom))",
            }}
          >
            Point at the QR code on your other device
          </p>
        </>
      ) : null}

      {phase === "permission-denied" ? (
        <div className="safe-pt relative z-10 flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            aria-label="Cancel scan"
            onClick={handleCancel}
            className="ml-[max(0.5rem,var(--safe-left))] mt-2 flex h-11 w-11 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="safe-pb flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[16px] font-semibold text-[#FAFAF9]">
              Camera access needed
            </p>
            <p className="mt-2 max-w-sm text-[14px] leading-[1.5] text-[#6E6963]">
              To scan your key QR code, allow camera access in your browser
              settings, or import your key backup file instead.
            </p>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-6 flex min-h-[44px] w-full max-w-xs items-center justify-center rounded-xl bg-[#EA580C] px-4 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
            >
              Use key backup file
            </button>
          </div>
        </div>
      ) : null}

      {phase === "invalid" ? (
        <div className="safe-pt relative z-10 flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            aria-label="Cancel scan"
            onClick={handleCancel}
            className="ml-[max(0.5rem,var(--safe-left))] mt-2 flex h-11 w-11 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <div className="safe-pb flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="text-[16px] font-semibold text-[#FAFAF9]">
              Invalid QR code
            </p>
            <p className="mt-2 max-w-sm text-[14px] leading-[1.5] text-[#6E6963]">
              This QR code is not a valid Celesth key.
            </p>
            <div className="mt-6 flex w-full max-w-xs flex-col gap-2">
              <button
                type="button"
                onClick={() => setPhase("scanning")}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#EA580C] px-4 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
              >
                Scan again
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
              >
                Go back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
