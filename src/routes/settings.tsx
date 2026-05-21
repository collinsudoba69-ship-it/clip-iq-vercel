import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, KeyRound, Save, Trash2 } from "lucide-react";
import { getApiKeys, setApiKeys, getCompactMode, setCompactMode } from "@/lib/settings";
import { clearEnrichmentCache } from "@/lib/enrichment";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

interface ApiField {
  label: string;
  key: "hunter" | "clearbit" | "peopledatalabs" | "snov" | "abstract";
  placeholder: string;
  link: string;
  linkLabel: string;
  badge: string;
  description: string;
}

const API_FIELDS: ApiField[] = [
  {
    label: "People Data Labs",
    key: "peopledatalabs",
    placeholder: "your_pdl_api_key",
    link: "https://www.peopledatalabs.com/signup",
    linkLabel: "Sign up free — 100 lookups/month →",
    badge: "FREE",
    description: "100 free lookups/month. No business email needed. Best for most users.",
  },
  {
    label: "Snov.io",
    key: "snov",
    placeholder: "your_snov_access_token",
    link: "https://snov.io",
    linkLabel: "Sign up free — 50 credits/month →",
    badge: "FREE",
    description: "50 free credits/month. Sign up with any Gmail account.",
  },
  {
    label: "Abstract API",
    key: "abstract",
    placeholder: "your_abstract_api_key",
    link: "https://www.abstractapi.com/api/email-validation",
    linkLabel: "Sign up free — 100 requests/month →",
    badge: "FREE",
    description: "100 free email lookups/month. Very easy signup.",
  },
  {
    label: "Hunter.io",
    key: "hunter",
    placeholder: "hunter_live_xxxxxxxxxxxx",
    link: "https://hunter.io/api-keys",
    linkLabel: "Get a Hunter.io key →",
    badge: "PAID",
    description: "Paid plans only. Best accuracy for business emails.",
  },
  {
    label: "Clearbit",
    key: "clearbit",
    placeholder: "sk_xxxxxxxxxxxx",
    link: "https://dashboard.clearbit.com/api",
    linkLabel: "Get a Clearbit key →",
    badge: "PAID",
    description: "Paid plans only. Very accurate for professional emails.",
  },
];

function SettingsPage() {
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [compact, setCompact] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});

  useEffect(() => {
    const k = getApiKeys();
    setKeys({
      hunter: k.hunter ?? "",
      clearbit: k.clearbit ?? "",
      peopledatalabs: k.peopledatalabs ?? "",
      snov: k.snov ?? "",
      abstract: k.abstract ?? "",
    });
    setCompact(getCompactMode());
  }, []);

  function save() {
    setApiKeys({
      hunter: keys.hunter?.trim() || undefined,
      clearbit: keys.clearbit?.trim() || undefined,
      peopledatalabs: keys.peopledatalabs?.trim() || undefined,
      snov: keys.snov?.trim() || undefined,
      abstract: keys.abstract?.trim() || undefined,
    });
    setCompactMode(compact);
    clearEnrichmentCache();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function clearAll() {
    setKeys({ hunter: "", clearbit: "", peopledatalabs: "", snov: "", abstract: "" });
    setApiKeys({});
    clearEnrichmentCache();
    setTestResult({});
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testKey(field: ApiField) {
    const k = keys[field.key]?.trim();
    if (!k) {
      setTestResult(r => ({ ...r, [field.key]: "❌ No key entered" }));
      return;
    }
    setTesting(field.key);
    setTestResult(r => ({ ...r, [field.key]: "Testing..." }));

    const testEmail = "john.doe@gmail.com";
    let ok = false;

    try {
      if (field.key === "hunter") {
        const res = await fetch(`https://api.hunter.io/v2/email-finder?email=${testEmail}&api_key=${k}`);
        ok = res.status !== 401 && res.status !== 403;
      } else if (field.key === "clearbit") {
        const res = await fetch(`https://person.clearbit.com/v2/people/find?email=${testEmail}`, { headers: { Authorization: `Bearer ${k}` } });
        ok = res.status !== 401 && res.status !== 403;
      } else if (field.key === "peopledatalabs") {
        const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?email=${testEmail}`, { headers: { "X-Api-Key": k } });
        ok = res.status !== 401 && res.status !== 403;
      } else if (field.key === "snov") {
        const res = await fetch(`https://api.snov.io/v1/get-emails-from-url?url=${testEmail}`, { headers: { Authorization: `Bearer ${k}` } });
        ok = res.status !== 401 && res.status !== 403;
      } else if (field.key === "abstract") {
        const res = await fetch(`https://emailvalidation.abstractapi.com/v1/?api_key=${k}&email=${testEmail}`);
        ok = res.status !== 401 && res.status !== 403;
      }
    } catch { ok = false; }

    setTestResult(r => ({ ...r, [field.key]: ok ? "✅ Key works!" : "❌ Invalid key" }));
    setTesting(null);
  }

  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/60">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">

        {/* API Keys Section */}
        <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-xl shadow-black/20">
          <div className="mb-2 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-cyan-accent" />
            <h2 className="text-sm font-semibold">Name Lookup API Keys</h2>
          </div>
          <p className="mb-5 text-xs text-muted-foreground">
            Add any API key below to enable automatic real name lookup from email addresses.
            Keys are stored only in your browser — never sent to any server. Free options are listed first.
          </p>

          <div className="space-y-5">
            {API_FIELDS.map((field) => (
              <div key={field.key} className="rounded-xl border border-border/50 bg-background/40 p-4">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-semibold text-foreground">{field.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    field.badge === "FREE"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-orange-500/20 text-orange-400"
                  }`}>
                    {field.badge}
                  </span>
                </div>
                <p className="mb-2 text-[11px] text-muted-foreground">{field.description}</p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={keys[field.key] || ""}
                    onChange={(e) => setKeys(k => ({ ...k, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    className="flex-1 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs font-mono focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    onClick={() => testKey(field)}
                    disabled={testing === field.key}
                    className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium hover:border-primary/60 disabled:opacity-50"
                  >
                    {testing === field.key ? "..." : "Test"}
                  </button>
                </div>
                {testResult[field.key] && (
                  <p className={`mt-1.5 text-[11px] font-medium ${testResult[field.key].startsWith("✅") ? "text-emerald-400" : testResult[field.key] === "Testing..." ? "text-muted-foreground" : "text-red-400"}`}>
                    {testResult[field.key]}
                  </p>
                )}
                <a href={field.link} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[11px] text-cyan-accent hover:underline">
                  {field.linkLabel}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* Compact mode */}
        <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-xl shadow-black/20">
          <h2 className="mb-1 text-sm font-semibold">Compact mode</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Shrinks the dashboard into a narrow column so you can dock it next to other apps on desktop.
          </p>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={compact}
              onChange={(e) => setCompact(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-[color:var(--primary)]"
            />
            Enable compact mode
          </label>
        </section>

        {/* Save / Clear buttons */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-lg gradient-accent px-4 py-2 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 hover:opacity-95"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved!" : "Save Settings"}
          </button>
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
          >
            <Trash2 className="h-4 w-4" />
            Clear All Keys
          </button>
        </div>
      </main>
    </div>
  );
}
