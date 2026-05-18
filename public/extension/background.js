// ClipIQ — background service worker (MV3)
// Opens the side panel, reads clipboard from the active tab, and pastes
// individual clips into whatever editable element the user is focused on.

chrome.runtime.onInstalled.addListener(() => {
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

// ---- Clipboard read (active tab proxy) ----
async function readClipboardFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return null;
  const [{ result } = { result: null }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: async () => {
      try {
        return await navigator.clipboard.readText();
      } catch (e) {
        return null;
      }
    },
  });
  return result;
}

// ---- Paste into the focused editable element on the active tab ----
// Serialized into the page context via chrome.scripting.executeScript.
function insertAtCursor(text) {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  if (
    tag === "TEXTAREA" ||
    (tag === "INPUT" &&
      /text|search|url|email|tel|password/i.test(el.type || "text"))
  ) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    const pos = start + text.length;
    el.setSelectionRange(pos, pos);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  if (el.isContentEditable) {
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

async function pasteToActiveTab(text) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, reason: "no-tab" };
  const [{ result } = { result: false }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [text],
    func: insertAtCursor,
  });
  return { ok: !!result };
}

// ---- Message bridge for the side panel UI ----
// { type: "CLIPIQ_READ" }       -> { text }
// { type: "CLIPIQ_PASTE", text } -> { ok }
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "CLIPIQ_READ") {
    readClipboardFromActiveTab().then((text) => sendResponse({ text }));
    return true;
  }
  if (msg?.type === "CLIPIQ_PASTE" && typeof msg.text === "string") {
    pasteToActiveTab(msg.text).then(sendResponse);
    return true;
  }
  return false;
});
