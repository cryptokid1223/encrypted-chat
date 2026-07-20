"use client";

import { useVisualViewport } from "@/hooks/useVisualViewport";

/** Runs visual-viewport tracking for the whole app (auth + in-app routes). */
export function VisualViewportRoot({ children }: { children: React.ReactNode }) {
  useVisualViewport();
  return children;
}
