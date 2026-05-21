import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Download,
  FileText,
  Mail,
  Phone,
  Pin,
  PinOff,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  Clipboard as ClipboardIcon,
  X,
  Minimize2,
  Maximize2,
  GripVertical,
  Zap,
  CornerDownLeft,
  Wand2,
} from "lucide-react";
import {
  type ClipItem,
  type ClipKind,
  downloadFile,
  exportCsv,
  exportTxt,
  groupByDate,
  makeItems,
  parseClipboard,
} from "@/lib/clipboard-engine";
import {
  cleanEmailName,
  enrichEmail,
  isEnrichmentConfigured,
} from "@/lib/enrichment";
import {
  getCompactMode,
  setCompactMode,
  SETTINGS_EVENT,
} from "@/lib/settings";

type Tab = "all" | "email" | "phone";

const STORAGE_KEY = "clipiq.items.v2";
const PINNED_KEY = "clipiq.pinned.v2";
const INITIALIZED_KEY = "clipiq.initialized";

function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function loadItems(): ClipItem[] {
  try {
    // Migrate from old v1 key if it exists
    const oldRaw = localStorage.getItem("clipiq.items.v1");
    if (oldRaw) {
      const oldItems = JSON.parse(oldRaw) as ClipItem[];
      // Only migrate if they look like real user data (not seed data)
      const realItems = oldItems.filter(
        (i) => !["ada.lovelace@analytical.io", "grace.hopper@navy.mil"].includes(i.value)
      );
      if (realItems.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(realItems));
        localStorage.removeItem("clipiq.items.v1");
        return realItems;
      }
      localStorage.removeItem("clipiq.items.v1");
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ClipItem[];
      if (Array.isArray(parsed)) return parsed;
    }
    // First ever visit — return empty, no seed data
    return [];
  } catch {
    return [];
  }
}

function saveItems(items: ClipItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    // localStorage full — try removing oldest items to make room
    console.warn("Storage full, pruning oldest clips");
    try {
      const pruned = items.slice(0, Math.floor(items.length * 0.8));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    } catch {
      /* noop */
    }
  }
}

function savePinned(items: ClipItem[]) {
  try {
    const ids = items.filter((i) => i.pinned).map((i) => i.id);
    localStorage.setItem(PINNED_KEY, JSON.stringify(ids));
  } catch {
    /* noop */
  }
}

export function ClipboardDashboard() {
  const [items, setItems] = useState<ClipItem[]>(() => {
    const pinnedIds = loadPinned();
    return loadItems().map((it) =>
      pinnedIds.has(it.id) ? { ...it, pinned: true } : it
    );
  });
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pastedId, setPastedId] = useState<string | null>(null);
  const [dumpText, setDumpText] = useState("");
  const [showOverlay, setShowOverlay] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [compact, setCompact] = useState<boolean>(() => getCompactMode());
  const [enrichConfigured, setEnrichConfigured] = useState<boolean>(() =>
    isEnrichmentConfigured()
  );
  const [toast, setToast] = useState<string | null>(null);

  // React to settings changes from the Settings page (API keys, compact).
  useEffect(() => {
    function onChange() {
      setCompact(getCompactMode());
      setEnrichConfigured(isEnrichmentConfigured());
    }
    window.addEventListener(SETTINGS_EVENT, onChange);
    return () => window.removeEventListener(SETTINGS_EVENT, onChange);
  }, []);

  // Persist every change immediately and permanently
  useEffect(() => {
    saveItems(items);
    savePinned(items);
  }, [items]);

  // Auto-enrich emails whenever a provider is configured.
  useEffect(() => {
    if (!enrichConfigured) return;
    let cancelled = false;
    const queue = items.filter(
      (i) => i.kind === "email" && i.nameSource !== "external"
    );
    (async () => {
      for (const it of queue) {
        const result = await enrichEmail(it.value);
        if (cancelled) return;
        if (!result) continue;
        setItems((prev) =>
          prev.map((p) =>
            p.id === it.id
              ? { ...p, name: result.name, nameSource: "external" }
              : p
          )
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enrichConfigured, items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (tab === "email" && i.kind !== "email") return false;
      if (tab === "phone" && i.kind !== "phone") return false;
      if (
        q &&
        !i.value.toLowerCase().includes(q) &&
        !(i.name?.toLowerCase().includes(q))
      )
        return false;
      return true;
    });
  }, [items, tab, query]);

  const pinnedItems = useMemo(
    () => filtered.filter((i) => i.pinned),
    [filtered]
  );
  const grouped = useMemo(
    () => groupByDate(filtered.filter((i) => !i.pinned)),
    [filtered]
  );

  // (pinned IDs are saved together with items in the effect above)

  function togglePin(id: string) {
    setItems((prev) =>
      prev.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p))
    );
  }

  const stats = useMemo(
    () => ({
      total: items.length,
      emails: items.filter((i) => i.kind === "email").length,
      phones: items.filter((i) => i.kind === "phone").length,
    }),
    [items]
  );

  function ingest(text: string) {
    if (!text.trim()) return;
    const parsed = parseClipboard(text);
    const newItems = makeItems(parsed);
    setItems((prev) => [...newItems, ...prev]);
    setDumpText("");
  }

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 3000);
  }

  async function copyOne(item: ClipItem) {
    try {
      await navigator.clipboard.writeText(item.value);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((c) => (c === item.id ? null : c)), 1200);
    } catch {
      /* noop */
    }
  }

  async function pasteOne(item: ClipItem) {
    try { await navigator.clipboard.writeText(item.value); } catch { /* noop */ }
    setPastedId(item.id);
    setTimeout(() => setPastedId((p) => (p === item.id ? null : p)), 1200);
    flashToast("✅ Copied! Click where you want to paste → press Ctrl+V");
  }

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectGroup(ids: string[], on: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(filtered.map((i) => i.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function removeSelected() {
    const ids = new Set(selected);
    if (ids.size === 0) return;
    setRemoving(ids);
    // Allow CSS transition (~280ms) before unmount.
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => !ids.has(i.id)));
      setRemoving(new Set());
      clearSelection();
    }, 300);
  }

  function exportSelected(kind: "txt" | "csv") {
    const list = selected.size
      ? items.filter((i) => selected.has(i.id))
      : filtered;
    if (kind === "txt") {
      downloadFile(exportTxt(list), "clips.txt", "text/plain");
    } else {
      downloadFile(exportCsv(list), "clips.csv", "text/csv");
    }
  }

  function clearAll() {
    if (items.length === 0) return;
    const keepPinned = items.filter((i) => i.pinned).length;
    const willRemove = items.length - keepPinned;
    if (willRemove === 0) {
      flashToast("Only pinned clips remain — unpin to delete");
      return;
    }
    const ok = window.confirm(
      `Delete ${willRemove} clip${willRemove === 1 ? "" : "s"}? Pinned clips will be kept.`
    );
    if (!ok) return;
    setItems((prev) => prev.filter((i) => i.pinned));
    clearSelection();
  }

  function toggleCompact() {
    const next = !compact;
    setCompact(next);
    setCompactMode(next);
  }

  const containerMax = compact ? "max-w-md" : "max-w-6xl";

  return (
    <div className="relative min-h-screen w-full">
      <Header
        stats={stats}
        onOpenOverlay={() => setShowOverlay(true)}
        compact={compact}
        onToggleCompact={toggleCompact}
        enrichConfigured={enrichConfigured}
        containerMax={containerMax}
      />

      <main className={`mx-auto w-full px-4 pb-32 pt-6 lg:px-8 ${containerMax}`}>
        <div className={compact ? "space-y-6" : "grid gap-6 lg:grid-cols-[1fr_360px]"}>
          <section className="space-y-6">
            <DumpArea value={dumpText} onChange={setDumpText} onIngest={ingest} />

            <Panel
              tab={tab}
              setTab={setTab}
              query={query}
              setQuery={setQuery}
              selectedCount={selected.size}
              onSelectAll={selectAllVisible}
              onClear={clearSelection}
              onClearAll={clearAll}
              onExport={exportSelected}
              totalCount={items.length}
            >
              <ClipsFeed
                pinnedItems={pinnedItems}
                grouped={grouped}
                selected={selected}
                removing={removing}
                onToggle={toggleSelect}
                onToggleGroup={selectGroup}
                onCopy={copyOne}
                onPaste={pasteOne}
                onPin={togglePin}
                copiedId={copiedId}
                pastedId={pastedId}
              />
            </Panel>
          </section>

          {!compact && (
            <aside className="space-y-6">
              <Sidecard stats={stats} />
              <EnrichmentCard enrichConfigured={enrichConfigured} />
              <ExtensionCard />
            </aside>
          )}
        </div>
      </main>


      <FloatingWidget
        minimized={minimized}
        setMinimized={setMinimized}
        showOverlay={showOverlay}
        setShowOverlay={setShowOverlay}
        items={items}
        onCopy={copyOne}
        onPaste={pasteOne}
        copiedId={copiedId}
        pastedId={pastedId}
        tab={tab}
        setTab={setTab}
        query={query}
        setQuery={setQuery}
      />

      <DeleteBar count={selected.size} onDelete={removeSelected} onClear={clearSelection} />

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl border border-cyan-accent/40 bg-surface px-6 py-3 text-sm font-semibold shadow-2xl shadow-black/40 text-foreground whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- Cursor-insert function (also serialized into MV3) ---------------- */

function insertAtCursor(text: string): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || (tag === "INPUT" && /text|search|url|email|tel|password/i.test((el as HTMLInputElement).type || "text"))) {
    const input = el as HTMLInputElement | HTMLTextAreaElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const pos = start + text.length;
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if ((el as HTMLElement).isContentEditable) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      el.appendChild(document.createTextNode(text));
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return true;
  }
  return false;
}

/* ---------------- Header ---------------- */

function Header({
  stats,
  onOpenOverlay,
  compact,
  onToggleCompact,
  enrichConfigured,
  containerMax,
}: {
  stats: { total: number; emails: number; phones: number };
  onOpenOverlay: () => void;
  compact: boolean;
  onToggleCompact: () => void;
  enrichConfigured: boolean;
  containerMax: string;
}) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/95 shadow-lg shadow-black/30 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
      <div className={`mx-auto flex w-full min-w-0 items-center justify-between gap-3 px-4 py-3 lg:px-8 ${containerMax}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-accent shadow-lg shadow-primary/20">
            <ClipboardIcon className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">
              Clip<span className="text-gradient">IQ</span>
            </h1>
            <p className="truncate text-[11px] text-muted-foreground">
              {enrichConfigured ? "OSINT enrichment active" : "Add API keys in Settings for real names"}
            </p>
          </div>
        </div>
        {!compact && (
          <div className="hidden items-center gap-2 md:flex">
            <StatPill icon={<Sparkles className="h-3.5 w-3.5" />} label="Clips" value={stats.total} />
            <StatPill icon={<Mail className="h-3.5 w-3.5" />} label="Emails" value={stats.emails} />
            <StatPill icon={<Phone className="h-3.5 w-3.5" />} label="Phones" value={stats.phones} />
          </div>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={onToggleCompact}
            title={compact ? "Expand layout" : "Compact mode (dock next to Gmail)"}
            className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
              compact
                ? "border-cyan-accent/60 bg-cyan-accent/10 text-cyan-accent"
                : "border-border bg-surface text-foreground hover:border-primary/60"
            }`}
          >
            {compact ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{compact ? "Expand" : "Compact"}</span>
          </button>
          <Link
            to="/settings"
            title="Settings & API keys"
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-medium hover:border-primary/60"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Settings</span>
          </Link>
          <button
            onClick={onOpenOverlay}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/60 hover:bg-surface-elevated"
          >
            Sidepanel
          </button>
        </div>
      </div>
    </header>
  );
}

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-surface/80 px-2.5 py-1 text-xs">
      <span className="text-primary">{icon}</span>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/* ---------------- Dump area ---------------- */

function DumpArea({
  value,
  onChange,
  onIngest,
}: {
  value: string;
  onChange: (v: string) => void;
  onIngest: (v: string) => void;
}) {
  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) onIngest(t);
    } catch {
      /* noop */
    }
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xl shadow-black/20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Zap className="h-4 w-4 shrink-0 text-cyan-accent" />
          <h2 className="truncate text-sm font-semibold">Smart Batch Parser</h2>
        </div>
        <span className="min-w-0 text-[11px] text-muted-foreground">
          Paste raw text · we explode it into single-click items
        </span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Drop 50 emails or phone numbers here…"
        rows={4}
        className="w-full resize-none rounded-xl border border-border bg-background/70 px-3 py-2 text-sm placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onIngest(value)}
          disabled={!value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg gradient-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow shadow-primary/30 transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Parse & Split
        </button>
        <button
          onClick={pasteFromClipboard}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-primary/50"
        >
          <ClipboardIcon className="h-3.5 w-3.5" />
          Read Clipboard
        </button>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Regex: <code className="rounded bg-surface px-1 py-0.5">emails</code> ·{" "}
          <code className="rounded bg-surface px-1 py-0.5">phones</code>
        </span>
      </div>
    </div>
  );
}

/* ---------------- Tab panel ---------------- */

function Panel({
  tab,
  setTab,
  query,
  setQuery,
  selectedCount,
  onSelectAll,
  onClear,
  onClearAll,
  onExport,
  totalCount,
  children,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  query: string;
  setQuery: (q: string) => void;
  selectedCount: number;
  onSelectAll: () => void;
  onClear: () => void;
  onClearAll: () => void;
  onExport: (kind: "txt" | "csv") => void;
  totalCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 shadow-xl shadow-black/20">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
        <Tabs tab={tab} setTab={setTab} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter clips…"
            className="w-full rounded-lg border border-border bg-background/70 py-1.5 pl-8 pr-3 text-xs placeholder:text-muted-foreground/70 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2 text-xs">
        <button
          onClick={onSelectAll}
          className="rounded-md border border-border bg-surface px-2 py-1 font-medium transition hover:border-primary/50"
        >
          Select all
        </button>
        <button
          onClick={onClear}
          className="rounded-md border border-border bg-surface px-2 py-1 font-medium transition hover:border-primary/50"
        >
          Clear
        </button>
        <button
          onClick={onClearAll}
          disabled={totalCount === 0}
          title="Delete all unpinned clips"
          className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 font-medium text-destructive transition hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear All
        </button>
        <span className="text-muted-foreground">
          {selectedCount > 0
            ? `${selectedCount} selected`
            : "Tip: select items to export or delete in batch"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onExport("txt")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 font-medium transition hover:border-cyan-accent/60"
          >
            <FileText className="h-3.5 w-3.5" /> TXT
          </button>
          <button
            onClick={() => onExport("csv")}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 font-medium transition hover:border-cyan-accent/60"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </div>

      <div className="p-3">{children}</div>
    </div>
  );
}


function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "all", label: "All Clips", icon: <Sparkles className="h-3.5 w-3.5" /> },
    { id: "email", label: "Emails", icon: <Mail className="h-3.5 w-3.5" /> },
    { id: "phone", label: "Phones", icon: <Phone className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
            tab === t.id
              ? "gradient-accent text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Feed ---------------- */

function ClipsFeed({
  pinnedItems,
  grouped,
  selected,
  removing,
  onToggle,
  onToggleGroup,
  onCopy,
  onPaste,
  onPin,
  copiedId,
  pastedId,
}: {
  pinnedItems: ClipItem[];
  grouped: { label: string; items: ClipItem[] }[];
  selected: Set<string>;
  removing: Set<string>;
  onToggle: (id: string) => void;
  onToggleGroup: (ids: string[], on: boolean) => void;
  onCopy: (i: ClipItem) => void;
  onPaste: (i: ClipItem) => void;
  onPin: (id: string) => void;
  copiedId: string | null;
  pastedId: string | null;
}) {
  if (grouped.length === 0 && pinnedItems.length === 0) {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-border/70 py-14 text-center">
        <ClipboardIcon className="h-7 w-7 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No clips yet</p>
        <p className="text-xs text-muted-foreground">
          Paste a block above and we&apos;ll split it into individual items.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {pinnedItems.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-cyan-accent">
              📌 Pinned Clips
            </h3>
            <span className="h-px flex-1 bg-cyan-accent/30" />
            <span className="text-[11px] text-muted-foreground">{pinnedItems.length}</span>
          </div>
          <ul className="space-y-1.5">
            {pinnedItems.map((it) => (
              <ClipRow
                key={it.id}
                item={it}
                checked={selected.has(it.id)}
                removing={removing.has(it.id)}
                onToggle={() => onToggle(it.id)}
                onCopy={() => onCopy(it)}
                onPaste={() => onPaste(it)}
                onPin={() => onPin(it.id)}
                copied={copiedId === it.id}
                pasted={pastedId === it.id}
              />
            ))}
          </ul>
        </section>
      )}
      {grouped.map((g) => {
        const ids = g.items.map((i) => i.id);
        const allChecked = ids.length > 0 && ids.every((id) => selected.has(id));
        const partial = !allChecked && ids.some((id) => selected.has(id));
        return (
          <section key={g.label}>
            <div className="mb-2 flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = partial;
                  }}
                  onChange={(e) => onToggleGroup(ids, e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--primary)]"
                />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </h3>
              </label>
              <span className="h-px flex-1 bg-border/70" />
              <span className="text-[11px] text-muted-foreground">{g.items.length}</span>
            </div>
            <ul className="space-y-1.5">
              {g.items.map((it) => (
                <ClipRow
                  key={it.id}
                  item={it}
                  checked={selected.has(it.id)}
                  removing={removing.has(it.id)}
                  onToggle={() => onToggle(it.id)}
                  onCopy={() => onCopy(it)}
                  onPaste={() => onPaste(it)}
                  onPin={() => onPin(it.id)}
                  copied={copiedId === it.id}
                  pasted={pastedId === it.id}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function KindBadge({ kind }: { kind: ClipKind }) {
  const cfg: Record<ClipKind, { label: string; cls: string; icon: React.ReactNode }> = {
    email: {
      label: "Email",
      cls: "bg-cyan-accent/15 text-cyan-accent border-cyan-accent/30",
      icon: <Mail className="h-3 w-3" />,
    },
    phone: {
      label: "Phone",
      cls: "bg-indigo-accent/15 text-indigo-accent border-indigo-accent/30",
      icon: <Phone className="h-3 w-3" />,
    },
    text: {
      label: "Text",
      cls: "bg-muted text-muted-foreground border-border",
      icon: <FileText className="h-3 w-3" />,
    },
  };
  const c = cfg[kind];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${c.cls}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function ClipRow({
  item,
  checked,
  removing,
  onToggle,
  onCopy,
  onPaste,
  onPin,
  copied,
  pasted,
}: {
  item: ClipItem;
  checked: boolean;
  removing: boolean;
  onToggle: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onPin: () => void;
  copied: boolean;
  pasted: boolean;
}) {
  return (
    <li
      style={{ containIntrinsicSize: "70px", contain: "layout paint" }}
      className={`group min-h-[70px] overflow-hidden rounded-xl border bg-surface/70 transition-opacity duration-300 ease-out hover:border-primary/40 hover:bg-surface-elevated ${
        checked ? "border-primary/60 ring-1 ring-primary/30" : "border-border/70"
      } ${item.pinned ? "border-cyan-accent/50 bg-cyan-accent/5" : ""} ${
        removing ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <div className="flex min-h-[70px] items-center gap-3 px-3 py-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-[color:var(--primary)]"
        />
        <KindBadge kind={item.kind} />
        <div className="min-w-0 flex-1">
          {item.kind === "email" && (
            <div className="flex items-center gap-1.5 truncate text-xs font-bold text-foreground">
              <span className="truncate">{item.name ?? cleanEmailName(item.value)}</span>
              <span
                className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${
                  item.nameSource === "external"
                    ? "bg-cyan-accent/15 text-cyan-accent"
                    : "bg-muted text-muted-foreground"
                }`}
                title={item.nameSource === "external" ? "Verified via OSINT lookup" : "Derived from email handle"}
              >
                <Wand2 className="h-2.5 w-2.5" />
                {item.nameSource === "external" ? "OSINT" : "Auto"}
              </span>
            </div>
          )}
          <span className="block truncate font-mono text-xs text-foreground/80">
            {item.value}
          </span>
        </div>
        <span
          suppressHydrationWarning
          className="ml-auto hidden text-[10px] text-muted-foreground sm:inline"
        >
          {new Date(item.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onPin}
            title={item.pinned ? "Unpin clip" : "Pin to top"}
            className={`grid h-7 w-7 place-items-center rounded-md border transition ${
              item.pinned
                ? "border-cyan-accent/60 bg-cyan-accent/15 text-cyan-accent"
                : "border-border bg-background/40 hover:border-cyan-accent/60 hover:text-cyan-accent"
            }`}
          >
            {item.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onCopy}
            title="Copy to clipboard"
            className={`grid h-7 w-7 place-items-center rounded-md border transition ${
              copied
                ? "border-success/60 bg-success/15 text-success"
                : "border-border bg-background/40 hover:border-primary/60 hover:text-primary"
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={onPaste}
            title="Paste into active field on the page"
            className={`grid h-7 w-7 place-items-center rounded-md border transition ${
              pasted
                ? "border-success/60 bg-success/15 text-success"
                : "border-border bg-background/40 hover:border-cyan-accent/60 hover:text-cyan-accent"
            }`}
          >
            {pasted ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <CornerDownLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </li>
  );
}

/* ---------------- Sidecards ---------------- */

function Sidecard({ stats }: { stats: { total: number; emails: number; phones: number } }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xl shadow-black/20">
      <h3 className="text-sm font-semibold">At a glance</h3>
      <p className="text-xs text-muted-foreground">Live counts across your clipboard.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "Total", value: stats.total, color: "text-primary" },
          { label: "Emails", value: stats.emails, color: "text-cyan-accent" },
          { label: "Phones", value: stats.phones, color: "text-indigo-accent" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-border/60 bg-surface/70 p-3 text-center"
          >
            <div className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnrichmentCard({ enrichConfigured }: { enrichConfigured: boolean }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xl shadow-black/20">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Name enrichment</h3>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            enrichConfigured
              ? "border-cyan-accent/60 bg-cyan-accent/10 text-cyan-accent"
              : "border-border bg-surface text-muted-foreground"
          }`}
        >
          <Wand2 className="h-2.5 w-2.5" />
          {enrichConfigured ? "OSINT active" : "No keys"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        When an email is copied we query <b>Hunter.io</b> / <b>Clearbit</b> for the
        real full name. Without a key configured we show a clean version of the
        email handle. We never invent a name.
      </p>
      <Link
        to="/settings"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:border-primary/60"
      >
        <SettingsIcon className="h-3.5 w-3.5" />
        Manage API keys
      </Link>
    </div>
  );
}


function ExtensionCard() {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-xl shadow-black/20">
      <h3 className="text-sm font-semibold">Browser extension</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Chrome MV3 sidepanel. Manifest, service worker, and{" "}
        <code className="rounded bg-surface px-1 py-0.5">insertAtCursor</code> automation live in{" "}
        <code className="rounded bg-surface px-1 py-0.5">/extension</code>.
      </p>
      <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
        <li className="flex items-start gap-2">
          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-cyan-accent" />
          <code>manifest.json</code> — clipboardRead/Write, sidePanel, scripting
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-accent" />
          <code>background.js</code> — bridges Copy & Paste to the active tab
        </li>
        <li className="flex items-start gap-2">
          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
          Paste = <code>chrome.scripting.executeScript</code> → cursor insert
        </li>
      </ul>
      <a
        href="/extension/manifest.json"
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-primary/60"
      >
        View manifest.json
      </a>
    </div>
  );
}

/* ---------------- Floating delete bar ---------------- */

function DeleteBar({
  count,
  onDelete,
  onClear,
}: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
}) {
  const visible = count > 0;
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-destructive/40 bg-card/95 px-3 py-2 shadow-2xl backdrop-blur">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-destructive/15 text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs">
          <span className="font-semibold tabular-nums">{count}</span>{" "}
          {count === 1 ? "clip" : "clips"} selected
        </span>
        <button
          onClick={onClear}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] font-medium hover:border-primary/50"
        >
          Cancel
        </button>
        <button
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1 text-[11px] font-semibold text-destructive-foreground shadow shadow-destructive/30 transition hover:opacity-95"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete {count} {count === 1 ? "Clip" : "Clips"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Floating widget / overlay ---------------- */

function FloatingWidget({
  minimized,
  setMinimized,
  showOverlay,
  setShowOverlay,
  items,
  onCopy,
  onPaste,
  copiedId,
  pastedId,
  tab,
  setTab,
  query,
  setQuery,
}: {
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  showOverlay: boolean;
  setShowOverlay: (v: boolean) => void;
  items: ClipItem[];
  onCopy: (i: ClipItem) => void;
  onPaste: (i: ClipItem) => void;
  copiedId: string | null;
  pastedId: string | null;
  tab: Tab;
  setTab: (t: Tab) => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const x = Math.max(8, Math.min(window.innerWidth - 80, e.clientX - dragRef.current.dx));
    const y = Math.max(8, Math.min(window.innerHeight - 80, e.clientY - dragRef.current.dy));
    setPos({ x, y });
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (tab === "email" && i.kind !== "email") return false;
      if (tab === "phone" && i.kind !== "phone") return false;
      if (q && !i.value.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, tab, query]);

  return (
    <>
      {minimized && !showOverlay && (
        <button
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => setShowOverlay(true)}
          style={{ right: pos.x, bottom: pos.y }}
          className="fixed z-40 grid h-14 w-14 cursor-grab place-items-center rounded-2xl gradient-accent shadow-2xl shadow-primary/40 ring-1 ring-white/10 transition active:cursor-grabbing"
          aria-label="Open ClipIQ"
        >
          <ClipboardIcon className="h-6 w-6 text-primary-foreground" />
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-background px-1 text-[10px] font-bold text-foreground ring-2 ring-primary/60">
            {items.length}
          </span>
        </button>
      )}

      {showOverlay && (
        <div className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm">
          <div
            className="absolute inset-0"
            onClick={() => {
              setShowOverlay(false);
              setMinimized(true);
            }}
          />
          <div className="relative flex h-full w-full max-w-[400px] flex-col border-l border-border/80 bg-card shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border/70 p-3">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <div className="grid h-7 w-7 place-items-center rounded-lg gradient-accent">
                <ClipboardIcon className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">ClipIQ Sidepanel</div>
                <div className="text-[10px] text-muted-foreground">Extension preview</div>
              </div>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => {
                    setShowOverlay(false);
                    setMinimized(true);
                  }}
                  className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                  aria-label="Minimize"
                >
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setShowOverlay(false)}
                  className="grid h-7 w-7 place-items-center rounded-md border border-border bg-surface text-muted-foreground hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="border-b border-border/70 p-3">
              <Tabs tab={tab} setTab={setTab} />
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-lg border border-border bg-background/70 py-1.5 pl-8 pr-3 text-xs focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            <div className="flex-1 space-y-1 overflow-auto p-3">
              {filtered.length === 0 ? (
                <p className="py-10 text-center text-xs text-muted-foreground">Nothing matches.</p>
              ) : (
                filtered.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface/70 px-2.5 py-2"
                  >
                    <KindBadge kind={it.kind} />
                    <div className="min-w-0 flex-1">
                      {it.kind === "email" && (
                        <div className="truncate text-[11px] font-bold">{it.name ?? cleanEmailName(it.value)}</div>
                      )}
                      <div className="truncate font-mono text-[11px] text-foreground/80">
                        {it.value}
                      </div>
                    </div>
                    <button
                      onClick={() => onCopy(it)}
                      className="grid h-6 w-6 place-items-center rounded border border-border hover:border-primary/50"
                      title="Copy"
                    >
                      {copiedId === it.id ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                    <button
                      onClick={() => onPaste(it)}
                      className="grid h-6 w-6 place-items-center rounded border border-border hover:border-cyan-accent/60"
                      title="Paste into active field"
                    >
                      {pastedId === it.id ? (
                        <Check className="h-3 w-3 text-success" />
                      ) : (
                        <CornerDownLeft className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
