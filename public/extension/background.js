// ClipIQ — background service worker (MV3)

chrome.runtime.onInstalled.addListener(() => {
  // Enable side panel on all tabs by default
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  console.log("[ClipIQ] installed");
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

// ---- Clipboard read from active tab ----
async function readClipboardFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const [{ result } = { result: null }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      try { return await navigator.clipboard.readText(); } catch { return null; }
    },
  });
  return result;
}

// ---- Paste into focused element on active tab ----
function insertAtCursor(text) {
  const el = document.activeElement;
  if (!el) return false;
  // Gmail compose box (contenteditable)
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
  const [{ result } = { result: false }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [text],
    func: insertAtCursor,
  });
  return { ok: !!result };
}

// ---- Message bridge ----
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'CLIPIQ_READ') {
    readClipboardFromActiveTab().then(text => sendResponse({ text }));
    return true;
  }
  if (msg?.type === 'CLIPIQ_PASTE' && typeof msg.text === 'string') {
    pasteToActiveTab(msg.text).then(sendResponse);
    return true;
  }
  return false;
});
