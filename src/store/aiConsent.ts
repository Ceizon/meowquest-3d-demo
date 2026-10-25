import { create } from "zustand";

const CONSENT_KEY = "mq-ai-consent";

function loadConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}

let pendingConsent: Promise<boolean> | null = null;
let resolvePending: ((allowed: boolean) => void) | null = null;

interface AIConsentState {
  accepted: boolean;
  promptOpen: boolean;
  requestConsent: () => Promise<boolean>;
  resolveConsent: (allowed: boolean) => void;
}

export const useAIConsent = create<AIConsentState>((set, get) => ({
  accepted: loadConsent(),
  promptOpen: false,
  requestConsent: () => {
    if (get().accepted) return Promise.resolve(true);
    if (pendingConsent) return pendingConsent;

    pendingConsent = new Promise<boolean>((resolve) => {
      resolvePending = resolve;
      set({ promptOpen: true });
    });
    return pendingConsent;
  },
  resolveConsent: (allowed) => {
    try {
      if (allowed) localStorage.setItem(CONSENT_KEY, "1");
      else localStorage.removeItem(CONSENT_KEY);
    } catch {
      // Keep the decision for this page even when storage is unavailable.
    }
    set({ accepted: allowed, promptOpen: false });
    resolvePending?.(allowed);
    resolvePending = null;
    pendingConsent = null;
  },
}));
