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
      `https://api.snov.io/v1/get-emails-from-url?url=${encodeURIComponent(email)}`,
      { headers: { Authorization: `Bearer ${k}` } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const first = json?.data?.firstName;
    const last = json?.data?.lastName;
    if (!first && !last) return null;
    return { name: [first, last].filter(Boolean).join(" "), source: "snov" };
  } catch { return null; }
}

// ---- Provider: Abstract API ----
async function viaAbstract(email: string): Promise<EnrichmentResult | null> {
  const k = key("abstract");
  if (!k) return null;
  try {
    const res = await fetch(
      `https://emailvalidation.abstractapi.com/v2/?api_key=${k}&email=${encodeURIComponent(email)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const first = json?.email_sender?.first_name;
    const last = json?.email_sender?.last_name;
    const name = (first || last) ? [first, last].filter(Boolean).join(" ") : null;
    const legacyName = json?.full_name || json?.name;
    const resolvedName = name || legacyName;
    if (!resolvedName) return null;
    return { name: resolvedName, source: "abstract" };
  } catch { return null; }
}

// ---- Provider: Behind The Email ----
async function viaBehindTheEmail(email: string): Promise<EnrichmentResult | null> {
  const k = key("behindtheemail");
  if (!k) return null;
  try {
    const res = await fetch(
      `https://api.behindtheemail.com/v1/search?email=${encodeURIComponent(email)}`,
      { headers: { "Authorization": `Bearer ${k}`, "Content-Type": "application/json" } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const name = json?.data?.full_name || json?.data?.name || json?.full_name || json?.name;
    if (!name) return null;
    return {
      name,
      source: "behindtheemail",
      jobTitle: json?.data?.job_title || json?.data?.current_role?.title,
      company: json?.data?.company || json?.data?.current_role?.company,
      location: json?.data?.location,
      linkedin: json?.data?.linkedin_url || json?.data?.socials?.linkedin,
      twitter: json?.data?.twitter_url || json?.data?.socials?.twitter,
      github: json?.data?.github_url || json?.data?.socials?.github,
    };
  } catch { return null; }
}

// ---- Main enrichment — tries all configured providers in order ----
export async function enrichEmail(email: string): Promise<EnrichmentResult | null> {
  const cacheKey = email.toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const result =
    (await viaBehindTheEmail(email)) ??
    (await viaHunter(email)) ??
    (await viaPeopleDatalabs(email)) ??
    (await viaClearbit(email)) ??
    (await viaSnov(email)) ??
    (await viaAbstract(email)) ??
    null;

  cache.set(cacheKey, result);
  return result;
}

export function isEnrichmentConfigured(): boolean {
  const k = getApiKeys();
  return Boolean(k.hunter || k.clearbit || k.peopledatalabs || k.snov || k.abstract || k.behindtheemail);
}

export function clearEnrichmentCache(): void {
  cache.clear();
}

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
