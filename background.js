// Open the side panel when the user clicks the toolbar icon. The Chrome
// sidePanel API needs an active service worker context, which isn't
// guaranteed at top-level (top-level runs before MV3 finishes registering
// the SW, producing "No SW" errors). Calling inside onInstalled + onStartup
// guarantees we're inside an event tick where the SW is alive.

function applySidePanelBehavior() {
  if (!chrome.sidePanel || !chrome.sidePanel.setPanelBehavior) return;
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn('[Naukri Clear] setPanelBehavior failed:', err));
}

chrome.runtime.onInstalled.addListener(applySidePanelBehavior);
chrome.runtime.onStartup.addListener(applySidePanelBehavior);
