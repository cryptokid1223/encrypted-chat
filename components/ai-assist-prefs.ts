const ENABLED_KEY = "ai_assist_enabled";
const CONSENTED_KEY = "ai_assist_consented";

export function getAiAssistEnabled(): boolean {
  try {
    const raw = localStorage.getItem(ENABLED_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

export function setAiAssistEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}

export function getAiAssistConsented(): boolean {
  try {
    return localStorage.getItem(CONSENTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAiAssistConsented(consented: boolean): void {
  try {
    localStorage.setItem(CONSENTED_KEY, consented ? "1" : "0");
  } catch {
    // Ignore storage failures.
  }
}
