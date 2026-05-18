import { enrichEmail, isEnrichmentConfigured } from "./enrichment";

export type ClipKind = "email" | "phone" | "text";

export interface ClipItem {
  id: string;
  value: string;
  kind: ClipKind;
  createdAt: number;
  sourceId?: string; // batch source
  name?: string;
  nameSource?: "local" | "external";
  pinned?: boolean;
}

/* ---------------- Name enrichment ---------------- */

// Common non-name words to ignore in email local parts
const STOP_WORDS = new Set([
  "info","contact","hello","hi","hey","mail","email","admin","support",
  "help","team","no","noreply","reply","do","not","sales","marketing",
  "office","work","me","my","the","and","for","with","from","news",
  "newsletter","billing","accounts","account","hr","jobs","career",
  "careers","press","media","pr","legal","privacy","security","dev",
  "developer","api","bot","auto","automated","notification","alerts",
  "alert","system","service","services","business","enquiry","enquiries",
  "inquiry","inquiries","feedback","general","official","main","inbox",
]);

// Common name prefixes/titles to strip
const TITLES = new Set([
  "mr","mrs","ms","dr","prof","sir","rev","eng","barr","hon","chief",
]);

// Digits-only or mostly-digit segments
function isJunk(s: string): boolean {
  if (s.length === 0) return true;
  if (s.length === 1) return true; // single letter not useful alone
  const digitRatio = (s.match(/\d/g) ?? []).length / s.length;
  if (digitRatio > 0.5) return true; // more digits than letters
  if (STOP_WORDS.has(s.toLowerCase())) return true;
  if (TITLES.has(s.toLowerCase())) return true;
  return false;
}

function capitalize(s: string): string {
  if (s.length === 0) return s;
  // Handle hyphenated names like "mary-jane" → "Mary-Jane"
  return s
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join("-");
}

/** Smart local rule: derive a human name from the local-part of an email. */
export function deriveNameFromEmail(email: string): string | undefined {
  const at = email.indexOf("@");
  if (at < 1) return undefined;

  const domain = email.slice(at + 1).toLowerCase();
  let local = email.slice(0, at);

  // Strip leading/trailing underscores or dots
  local = local.replace(/^[._]+|[._]+$/g, "");

  // Split on common separators: . _ - + and also on camelCase boundaries
  // e.g. "johnDoe" → ["john", "Doe"], "john.doe" → ["john", "doe"]
  const raw = local
    .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase split
    .split(/[._\-+\s]+/);

  // Clean each segment: remove trailing/leading digits, keep only letters and hyphens
  const segments = raw
    .map((p) => p.replace(/^\d+|\d+$/g, "").replace(/[^a-zA-Z-]/g, ""))
    .filter((p) => !isJunk(p));

  // Need at least 2 clean name parts to be confident it's a real name
  if (segments.length < 2) {
    // Single segment — only use if it looks like a real name (4+ letters, not a stop word)
    if (segments.length === 1 && segments[0].length >= 4) {
      // Could be a real first name like "collins@..." 
      return capitalize(segments[0]);
    }
    return undefined;
  }

  // Take first 3 segments max (first, middle, last)
  return segments
    .slice(0, 3)
    .map(capitalize)
    .join(" ");
}

/**
 * Real OSINT / reverse-email lookup (Hunter.io, Clearbit, …).
 * Returns `null` when no provider is configured or no authoritative match is
 * found. We never invent a name.
 */
export async function fetchEnrichedName(email: string): Promise<string | null> {
  const result = await enrichEmail(email);
  return result?.name ?? null;
}

export { isEnrichmentConfigured };


const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Phone: international or local; 7-15 digits with optional separators
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[[\s.-]?)?\d{3,4}[\s.-]?\d{3,4}/g;

function normalizePhone(p: string): string {
  const digits = p.replace(/[^\d+]/g, "");
  return digits;
}

function isPlausiblePhone(p: string): boolean {
  const digits = p.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export interface ParseResult {
  emails: string[];
  phones: string[];
  raw: string;
}

export function parseClipboard(text: string): ParseResult {
  const trimmed = text.trim();
  const emailMatches = Array.from(new Set(trimmed.match(EMAIL_RE) ?? []));

  // remove emails before phone matching to avoid digits-in-emails
  const withoutEmails = trimmed.replace(EMAIL_RE, " ");
  const phoneRaw = withoutEmails.match(PHONE_RE) ?? [];
  const phones = Array.from(
    new Set(
      phoneRaw
        .map((p) => p.trim())
        .filter(isPlausiblePhone)
        .map(normalizePhone)
    )
  );

  return { emails: emailMatches, phones, raw: trimmed };
}

export function makeItems(result: ParseResult): ClipItem[] {
  const now = Date.now();
  const src = `src_${now}`;
  const items: ClipItem[] = [];
  result.emails.forEach((v, i) => {
    const local = deriveNameFromEmail(v);
    items.push({
      id: `${now}_e_${i}_${Math.random().toString(36).slice(2, 7)}`,
      value: v,
      kind: "email",
      createdAt: now + i,
      sourceId: src,
      name: local,
      nameSource: local ? "local" : undefined,
    });
  });

  result.phones.forEach((v, i) =>
    items.push({
      id: `${now}_p_${i}_${Math.random().toString(36).slice(2, 7)}`,
      value: v,
      kind: "phone",
      createdAt: now + 1000 + i,
      sourceId: src,
    })
  );
  // If nothing parsed, keep raw as a single text clip
  if (items.length === 0 && result.raw.length > 0) {
    items.push({
      id: `${now}_t_${Math.random().toString(36).slice(2, 7)}`,
      value: result.raw,
      kind: "text",
      createdAt: now,
      sourceId: src,
    });
  }
  return items;
}

export function groupByDate(items: ClipItem[]): {
  label: string;
  items: ClipItem[];
}[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  const groups = new Map<string, ClipItem[]>();
  const orderedKeys: string[] = [];

  const sorted = [...items].sort((a, b) => b.createdAt - a.createdAt);

  for (const it of sorted) {
    let key: string;
    if (it.createdAt >= startOfToday) key = "Today's Clips";
    else if (it.createdAt >= startOfYesterday) key = "Yesterday's Clips";
    else {
      const d = new Date(it.createdAt);
      key = d.toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    }
    if (!groups.has(key)) {
      groups.set(key, []);
      orderedKeys.push(key);
    }
    groups.get(key)!.push(it);
  }

  return orderedKeys.map((k) => ({ label: k, items: groups.get(k)! }));
}

export function exportTxt(items: ClipItem[]): string {
  return items.map((i) => i.value).join("\n");
}

export function exportCsv(items: ClipItem[]): string {
  const rows = [["kind", "value", "captured_at"]];
  for (const i of items) {
    rows.push([
      i.kind,
      `"${i.value.replace(/"/g, '""')}"`,
      new Date(i.createdAt).toISOString(),
    ]);
  }
  return rows.map((r) => r.join(",")).join("\n");
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
