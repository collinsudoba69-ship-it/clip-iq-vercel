/**
 * Email → Real Name enrichment.
 * Supports: Hunter.io, Clearbit, People Data Labs, Snov.io, Abstract API
 * All keys stored in browser LocalStorage — never sent to any server.
 */

import { getApiKeys } from "./settings";

export interface EnrichmentResult {
  name: string;
  source: "hunter" | "clearbit" | "peopledatalabs" | "snov" | "abstract" | "behindtheemail";
  confidence?: number;
  // Extra profile fields from Behind The Email
  jobTitle?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  twitter?: string;
  github?: string;
}

const cache = new Map<string, EnrichmentResult | null>();

// ---- Key getters ----
function key(k: keyof ReturnType<typeof getApiKeys>) {
  return getApiKeys()[k] || undefined;
}

// ---- Provider: Hunter.io ----
async function viaHunter(email: string): Promise<EnrichmentResult | null> {
  const k = key("hunter");
  if (!k) return null;
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-finder?email=${encodeURIComponent(email)}&api_key=${k}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const first = json?.data?.first_name;
    const last = json?.data?.last_name;
    if (!first && !last) return null;
    return { name: [first, last].filter(Boolean).join(" "), source: "hunter", confidence: json?.data?.score };
  } catch { return null; }
}

// ---- Provider: Clearbit ----
async function viaClearbit(email: string): Promise<EnrichmentResult | null> {
  const k = key("clearbit");
  if (!k) return null;
  try {
    const res = await fetch(
      `https://person.clearbit.com/v2/people/find?email=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${k}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const name = json?.name?.fullName;
    if (!name) return null;
    return { name, source: "clearbit" };
  } catch { return null; }
}

// ---- Provider: People Data Labs ----
async function viaPeopleDatalabs(email: string): Promise<EnrichmentResult | null> {
  const k = key("peopledatalabs");
  if (!k) return null;
  try {
    const res = await fetch(
      `https://api.peopledatalabs.com/v5/person/enrich?email=${encodeURIComponent(email)}`,
      { headers: { "X-Api-Key": k } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const name = json?.data?.full_name;
    if (!name) return null;
    return { name, source: "peopledatalabs", confidence: json?.data?.likelihood };
  } catch { return null; }
}

// ---- Provider: Snov.io ----
async function viaSnov(email: string): Promise<EnrichmentResult | null> {
  const k = key("snov");
  if (!k) return null;
  try {
    const res = await fetch(
      `https://ap
