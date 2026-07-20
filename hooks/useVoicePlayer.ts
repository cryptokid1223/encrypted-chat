"use client";

import { useEffect, useState } from "react";
import {
  getVoicePlayerSnapshot,
  subscribeVoicePlayer,
  type VoicePlayerSnapshot,
} from "@/lib/voicePlayer";

export function useVoicePlayer(): VoicePlayerSnapshot {
  const [snap, setSnap] = useState(getVoicePlayerSnapshot);
  useEffect(
    () => subscribeVoicePlayer(() => setSnap(getVoicePlayerSnapshot())),
    [],
  );
  return snap;
}
