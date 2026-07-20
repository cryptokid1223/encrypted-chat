"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { loadPrivateKey } from "@/lib/keystore";
import QRCode from "qrcode";

const QR_DISPLAY_SECONDS = 60;
const QR_SIZE_PX = 280;

type Step = "warning" | "qr";

export function KeyTransferModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("warning");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(QR_DISPLAY_SECONDS);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    canvas.width = 0;
    canvas.height = 0;
  }, []);

  const handleClose = useCallback(() => {
    clearCanvas();
    setStep("warning");
    setError(null);
    setLoading(false);
    setSecondsLeft(QR_DISPLAY_SECONDS);
    onClose();
  }, [clearCanvas, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      clearCanvas();
    };
  }, [clearCanvas]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleClose]);

  useEffect(() => {
    if (step !== "qr" || loading || error) return;

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          handleClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [step, loading, error, handleClose]);

  async function handleShowQr() {
    setError(null);
    setLoading(true);
    setStep("qr");
    setSecondsLeft(QR_DISPLAY_SECONDS);

    try {
      const backup = await loadPrivateKey();
      if (!backup) {
        setError("No private key found on this device.");
        setStep("warning");
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        setError("Could not display QR code.");
        setStep("warning");
        return;
      }

      await QRCode.toCanvas(canvas, backup, {
        width: QR_SIZE_PX,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "M",
      });
    } catch {
      setError("Could not generate QR code.");
      setStep("warning");
      clearCanvas();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex h-app flex-col md:inset-0 md:items-center md:justify-center md:bg-black/60 md:p-4">
      <button
        type="button"
        aria-label="Close key transfer"
        className="absolute inset-0 hidden md:block"
        onClick={handleClose}
      />
      <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0F0E0D] md:h-auto md:max-h-[90dvh] md:max-w-md md:rounded-2xl md:border md:border-[#2E2B28] md:bg-[#1A1816]">
        <header className="safe-pt shrink-0 border-b border-[#2E2B28] bg-[#1A1816] md:rounded-t-2xl">
          <div className="flex h-12 items-center gap-1 px-2">
            <button
              type="button"
              aria-label="Back"
              onClick={handleClose}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <span className="text-[15px] font-semibold text-[#FAFAF9]">
              Transfer key
            </span>
          </div>
        </header>

        <div className="safe-pb min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-md flex-col p-6">
          {step === "warning" ? (
            <div className="my-auto flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[#78350F]/40 bg-[#451A03]">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-7 w-7 text-[#FBBF24]"
                  aria-hidden
                >
                  <path
                    d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="mt-5 text-[20px] font-semibold leading-[1.3] text-[#FAFAF9]">
                Your secret key
              </p>
              <p className="mt-3 text-[14px] leading-[1.5] text-[#6E6963]">
                This QR code contains your private key. Anyone who scans or
                photographs it can read all your messages. Only show it to your
                own device, in private. Never screenshot or share it.
              </p>
              {error ? (
                <p className="mt-4 text-[13px] text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-8 flex w-full flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handleShowQr()}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#EA580C] px-4 text-[14px] font-medium text-white transition-colors duration-150 ease-in-out hover:bg-[#C2410C]"
                >
                  Show QR code
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex min-h-[44px] w-full items-center justify-center rounded-xl text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="my-auto flex flex-col items-center text-center">
              <div className="rounded-2xl bg-white p-5 shadow-none">
                <canvas
                  ref={canvasRef}
                  className={`block ${loading ? "invisible h-0 w-0" : ""}`}
                  aria-label="QR code containing your private key backup"
                />
                {loading ? (
                  <div
                    className="flex items-center justify-center text-[13px] text-[#6E6963]"
                    style={{ width: QR_SIZE_PX, height: QR_SIZE_PX }}
                  >
                    Generating…
                  </div>
                ) : null}
              </div>
              {!loading && !error ? (
                <p className="mt-3 text-[12px] text-[#6E6963]">
                  Closes in {secondsLeft}s
                </p>
              ) : null}
              <p className="mt-5 max-w-[280px] text-[14px] leading-[1.5] text-[#6E6963]">
                On your new device: log in, choose &apos;Restore key&apos; →
                &apos;Scan QR code&apos;.
              </p>
              {error ? (
                <p className="mt-4 text-[13px] text-red-400" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleClose}
                className="mt-6 flex min-h-[44px] w-full max-w-xs items-center justify-center rounded-xl text-[14px] font-medium text-[#6E6963] transition-colors duration-150 ease-in-out hover:bg-[#242220] hover:text-[#FAFAF9]"
              >
                Close
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
