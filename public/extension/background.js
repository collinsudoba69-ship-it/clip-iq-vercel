// ClipIQ — background service worker (MV3)
// Acts as the storage bridge between sidepanel and content scripts

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log("[ClipIQ] installed v1.2");
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.windowId) return;
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel.html",
    enabled: true,
  });
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// ---- Storage helpers (chrome.storage.local — shared across all extension pages) ----
const STORAGE_KEY = "clipiq.items.v2";

async function getClips() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] || [];
}

async function saveClips(clips) {
  await chrome.storage.local.set({ [STORAGE_KEY]: clips });
}

// ---- Paste into focused element on active tab ----
function insertAtCursor(text) {
  const el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
    return true;
  }
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || (tag === 'INPUT' && /text|search|url|email|tel|password/i.test(el.type || 'text'))) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  return false;
}

async function pasteToActiveTab(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false };
  try {
    const [{ result } = { result: false }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [text],
      func: insertAtCursor,
    });
    return { ok: !!result };
  } catch {
    return { ok: false };
  }
}

async function readClipboardFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  try {
    const [{ result } = { result: null }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        try { return await navigator.clipboard.readText(); } catch { return null; }
      },
    });
    return result;
  } catch { return null; }
}

// ---- Message bridge ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIPIQ_READ") {
    readClipboardFromActiveTab().then(text => sendResponse({ text }));
    return true;
  }
  if (msg?.type === "CLIPIQ_PASTE") {
    pasteToActiveTab(msg.text).then(sendResponse);
    return true;
  }
  if (msg?.type === "CLIPIQ_GET_CLIPS") {
    getClips().then(clips => sendResponse({ clips }));
    return true;
  }
  if (msg?.type === "CLIPIQ_SAVE_CLIPS") {
    saveClips(msg.clips).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "CLIPIQ_ADD_CLIP") {
    getClips().then(async clips => {
      clips.push(msg.clip);
      await saveClips(clips);
      sendResponse({ ok: true, clips });
    });
    return true;
  }
  return false;
});
