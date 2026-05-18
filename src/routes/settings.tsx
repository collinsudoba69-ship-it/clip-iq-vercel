import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, KeyRound, Save, Trash2 } from "lucide-react";
import {
  getApiKeys,
  setApiKeys,
  getCompactMode,
  setCompactMode,
} from "@/lib/settings";
import { clearEnrichmentCache } from "@/lib/enrichment";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [hunter, setHunter] = useState("");
  const [clearbit, setClearbit] = useState("");
  const [compact, setCompact] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const k = getApiKeys();
    setHunter(k.hunter ?? "");
    setClearbit(k.clearbit ?? "");
    setCompact(getCompactMode());
  }, []);

  function save() {
    setApiKeys({
      hunter: hunter.trim() || undefined,
      clearbit: clearbit.trim() || undefined,
    });
    setCompactMode(compact);
    clearEnrichmentCache();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function clearAll() {
    setHunter("");
    setClearbit("");
    setApiKeys({});
    clearEnrichmentCache();
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="min-h-screen w-full">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
          <h1 className="text-base font-semibold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-xl shadow-black/20">
          <div className="mb-4 flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-cyan-accent" />
            <h2 className="text-sm font-semibold">Name lookup API keys</h2>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Paste your API keys below. They are stored only in this browser's
            LocalStorage and used directly for email → name lookups. We never
            send them to a server.
          </p>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium">
                Hunter.io API Key
              </span>
              <input
                type="password"
                value={hunter}
                onChange={(e) => setHunter(e.target.value)}
                placeholder="hunter_live_xxxxxxxxxxxx"
                className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-mono focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <a
                href="https://hunter.io/api-keys"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-cyan-accent hover:underline"
              >
                Get a Hunter.io key →
              </a>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium">
                Clearbit API Key
              </span>
              <input
                type="password"
                value={clearbit}
                onChange={(e) => setClearbit(e.target.value)}
                placeholder="sk_xxxxxxxxxxxx"
                className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm font-mono focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <a
                href="https://dashboard.clearbit.com/api"
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-cyan-accent hover:underline"
              >
                Get a Clearbit key →
              </a>
            </label>
          </div>
        </section>

        <section className="rounded-2xl border border-border/70 bg-card/60 p-5 shadow-xl shadow-black/20">
          <h2 className="mb-1 text-sm font-semibold">Compact mode</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Shrinks the dashboard into a narrow column so you can dock it next
            to Gmail or Slack on desktop.
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

        <div className="flex flex-wrap gap-2">
          <button
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-lg gradient-accent px-4 py-2 text-sm font-semibold text-primary-foreground shadow shadow-primary/30 hover:opacity-95"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved" : "Save settings"}
          </button>
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
          >
            <Trash2 className="h-4 w-4" />
            Clear keys
          </button>
        </div>
      </main>
    </div>
  );
}
