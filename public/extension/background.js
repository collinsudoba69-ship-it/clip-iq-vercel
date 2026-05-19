// ClipIQ background — minimal and reliable
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.windowId) return;
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Paste text into the active tab's focused element
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "PASTE") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) { sendResponse({ ok: false }); return; }
      try {
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (text) => {
            const el = document.activeElement;
            if (!el) return false;
            if (el.isContentEditable || el.getAttribute('role') === 'textbox') {
              document.execCommand('insertText', false, text);
              return true;
            }
            if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
              const s = el.selectionStart ?? el.value.length;
              const e = el.selectionEnd ?? el.value.length;
              el.value = el.value.slice(0, s) + text + el.value.slice(e);
              el.setSelectionRange(s + text.length, s + text.length);
              el.dispatchEvent(new Event('input', { bubbles: true }));
              return true;
            }
            return false;
          },
          args: [msg.text]
        });
        sendResponse({ ok: result?.result ?? false });
      } catch { sendResponse({ ok: false }); }
    });
    return true;
  }
});
