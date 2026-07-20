"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { ChevronLeftIcon } from "@/components/icons";

type ScannerPhase = "scanning" | "permission-denied" | "invalid";

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
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
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
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0F0E0D]">
      <div className="safe-pt shrink-0 border-b border-[#2E2B28] bg-[#1A1816]">
        <div className="flex h-12 items-center gap-1 px-2">
          <button
            type="button"
            aria-label="Cancel scan"
            onClick={handleCancel}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold text-[#FAFAF9]">
            Scan QR code
          </span>
        </div>
      </div>

      {phase === "scanning" ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div id={elementId} className="absolute inset-0" />
          <div className="pointer-events-none relative z-10 flex flex-1 flex-col items-center justify-center px-6">
            <div className="h-[250px] w-[250px] rounded-2xl border-2 border-[#EA580C]/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            <p className="mt-6 max-w-xs text-center text-[14px] leading-[1.4] text-[#FAFAF9]">
              Point at the QR code on your other device
            </p>
          </div>
        </div>
      ) : null}

      {phase === "permission-denied" ? (
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
      ) : null}

      {phase === "invalid" ? (
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
      ) : null}
    </div>
  );
}
