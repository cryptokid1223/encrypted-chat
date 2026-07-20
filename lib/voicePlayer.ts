export class VoicePlaybackError extends Error {
  constructor(message = "Can't play on this device") {
    super(message);
    this.name = "VoicePlaybackError";
  }
}

export type VoicePlayerSnapshot = {
  activePath: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
};

let audio: HTMLAudioElement | null = null;
let activePath: string | null = null;
const listeners = new Set<() => void>();

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = document.createElement("audio");
    audio.preload = "none";
    audio.setAttribute("playsinline", "");
    audio.addEventListener("timeupdate", publish);
    audio.addEventListener("play", publish);
    audio.addEventListener("pause", publish);
    audio.addEventListener("ended", () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
      }
      publish();
    });
  }
  return audio;
}

export function getVoicePlayerSnapshot(): VoicePlayerSnapshot {
  const el = audio;
  const duration =
    el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
  const isPlaying = Boolean(
    el &&
      activePath &&
      !el.paused &&
      !el.ended &&
      (duration === 0 || el.currentTime < duration - 0.05),
  );
  return {
    activePath,
    isPlaying,
    currentTime: el?.currentTime ?? 0,
    duration,
  };
}

function publish(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeVoicePlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function stopVoicePlayback(): void {
  const el = audio;
  if (!el) return;
  el.pause();
  el.removeAttribute("src");
  el.load();
  activePath = null;
  publish();
}

export async function playVoice(path: string, url: string): Promise<void> {
  const el = getAudio();
  if (activePath !== path) {
    el.pause();
    el.currentTime = 0;
  }
  if (el.src !== url) {
    el.src = url;
  }
  activePath = path;
  try {
    await el.play();
  } catch {
    throw new VoicePlaybackError();
  }
  publish();
}

export function pauseVoice(): void {
  audio?.pause();
  publish();
}

export function seekVoice(ratio: number): void {
  const el = audio;
  if (!el || !activePath) return;
  const duration =
    Number.isFinite(el.duration) && el.duration > 0
      ? el.duration
      : 0;
  if (duration <= 0) return;
  el.currentTime = duration * Math.max(0, Math.min(1, ratio));
  publish();
}

export function isVoiceActive(path: string): boolean {
  return activePath === path;
}
