import { useEffect, useState } from "react";
import { request } from "./backendApi";

/** How EaseVoice behaves for everyone. Only an administrator can change it (Admin → EaseVoice narration). */
export type EaseVoiceConfig = {
  selectToRead: boolean;
  idlePromptEnabled: boolean;
  idleSeconds: number;
  idlePromptText: string;
  updatedAt?: string | null;
};

// Used until the server answers, and if it cannot be reached. Matches the backend defaults.
export const DEFAULT_EASEVOICE_CONFIG: EaseVoiceConfig = {
  selectToRead: true,
  idlePromptEnabled: true,
  idleSeconds: 120,
  idlePromptText:
    "Hello, this is EaseVoice. Would you like me to read something for you? Just highlight any words on the screen and I'll read them aloud.",
};

export const IDLE_SECONDS_MIN = 30;
export const IDLE_SECONDS_MAX = 1800;
export const IDLE_PROMPT_MAX_LENGTH = 500;

let current: EaseVoiceConfig = DEFAULT_EASEVOICE_CONFIG;
let loading: Promise<void> | null = null;
const listeners = new Set<(config: EaseVoiceConfig) => void>();

function publish(config: EaseVoiceConfig) {
  current = config;
  listeners.forEach((listener) => listener(config));
}

function load() {
  loading ??= request<EaseVoiceConfig>("/easevoice/config")
    .then(publish)
    .catch(() => {
      loading = null; // keep the defaults and try again next time a page asks
    });
  return loading;
}

export function saveEaseVoiceConfig(change: Partial<Omit<EaseVoiceConfig, "updatedAt">>) {
  return request<EaseVoiceConfig>("/admin/easevoice/config", { method: "PUT", body: JSON.stringify(change) }, true)
    .then((saved) => {
      publish(saved); // every open EaseVoice picks up the change straight away
      return saved;
    });
}

/** The current EaseVoice settings, loaded once and shared by every component that asks. */
export function useEaseVoiceConfig(): EaseVoiceConfig {
  const [config, setConfig] = useState(current);
  useEffect(() => {
    listeners.add(setConfig);
    setConfig(current);
    void load();
    return () => {
      listeners.delete(setConfig);
    };
  }, []);
  return config;
}
