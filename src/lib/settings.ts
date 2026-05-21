/**
 * User-managed settings stored in browser LocalStorage.
 * - API keys for real name enrichment (Hunter.io, Clearbit)
 * - Compact mode (shrinks layout to dock next to Gmail)
 */

export interface ApiKeys {
  hunter?: string;
  clearbit?: string;
  peopledatalabs?: string;
  snov?: string;
  abstract?: string;
}

const KEYS_STORAGE = "clipiq.apikeys.v1";
const COMPACT_STORAGE = "clipiq.compact.v1";

export const SETTINGS_EVENT = "clipiq:settings-changed";

export function getApiKeys(): ApiKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEYS_STORAGE);
    if (!raw) return {};
    return JSON.parse(raw) as ApiKeys;
  } catch {
    return {};
  }
}

export function setApiKeys(keys: ApiKeys): void {
  try {
    localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
  } catch {
    /* noop */
  }
}

export function hasAnyApiKey(): boolean {
  const k = getApiKeys();
  return Boolean(k.hunter || k.clearbit || k.peopledatalabs || k.snov || k.abstract);
}

export function getCompactMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(COMPACT_STORAGE) === "1";
  } catch {
    return false;
  }
}

export function setCompactMode(v: boolean): void {
  try {
    localStorage.setItem(COMPACT_STORAGE, v ? "1" : "0");
    window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
  } catch {
    /* noop */
  }
}
