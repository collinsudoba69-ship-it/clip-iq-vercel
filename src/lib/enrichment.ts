/**
 * Real OSINT / reverse-email enrichment.
 *
 * API keys are read from the user's browser LocalStorage (set via the
 * in-app Settings page). Falls back to Vite env vars for power users.
 * Returns `null` when no provider is configured or no authoritative match
 * is found — we never invent a name.
 */

import { getApiKeys } from "./settings";

export interface EnrichmentResult {
  name: string;
  source: "hunter" | "clearbit";
  confidence?: number;
}

const ENV_HUNTER = import.meta.env.VITE_HUNTER_API_KEY as string | undefined;
const ENV_CLEARBIT = import.meta.env.VITE_CLEARBIT_API_KEY as string | undefined;

const cache = new Map<string, EnrichmentResult | null>();

function hunterKey(): string | undefined {
  return getApiKeys().hunter || ENV_HUNTER || undefined;
}
function clearbitKey(): string | undefined {
  return getApiKeys().clearbit || ENV_CLEARBIT || undefined;
}

async function viaHunter(email: string): Promise<EnrichmentResult | null> {
  const key = hunterKey();
  if (!key) return null;
  try {
    const url = `https://api.hunter.io/v2/email-finder?email=${encodeURIComponent(
      email
    )}&api_key=${key}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const first = json?.data?.first_name;
    const last = json?.data?.last_name;
    if (!first && !last) return null;
    return {
      name: [first, last].filter(Boolean).join(" "),
      source: "hunter",
      confidence: json?.data?.score,
    };
  } catch {
    return null;
  }
}

async function viaClearbit(email: string): Promise<EnrichmentResult | null> {
  const key = clearbitKey();
  if (!key) return null;
  try {
    const res = await fetch(
      `https://person.clearbit.com/v2/people/find?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${key}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const name = json?.name?.fullName;
    if (!name) return null;
    return { name, source: "clearbit" };
  } catch {
    return null;
  }
}

export async function enrichEmail(
  email: string
): Promise<EnrichmentResult | null> {
  const cacheKey = email.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;
  const result = (await viaHunter(email)) ?? (await viaClearbit(email));
  cache.set(cacheKey, result);
  return result;
}

export function isEnrichmentConfigured(): boolean {
  return Boolean(hunterKey() || clearbitKey());
}

export function clearEnrichmentCache(): void {
  cache.clear();
}

/**
 * Produce a clean, presentable name fallback from an email local-part when
 * no API match is available. e.g. `jane.doe+work@x.com` → "Jane Doe".
 */
export function cleanEmailName(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  const local = email.slice(0, at);
  const parts = local
    .split(/[._\-+]+/)
    .map((p) => p.replace(/[^a-zA-Z]/g, ""))
    .filter((p) => p.length >= 1);
  if (parts.length === 0) return local;
  return parts
    .slice(0, 3)
    .map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}
