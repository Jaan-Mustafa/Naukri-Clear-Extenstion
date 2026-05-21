// Floating launcher — injects a small "NC" button on every webpage. Click
// it to slide in an iframe loading our popup.html. Modeled after the Simplify
// pattern (in-page widget, not a Chrome side panel), so the user can autofill
// without ever clicking the toolbar icon.
//
// Style isolation via Shadow DOM so the host page's CSS can't break our
// button or panel. The iframe handles its own style isolation natively.

(function () {
  // Skip if we're inside an iframe — the launcher should only live on the
  // top frame. Also skip non-http URLs (chrome://, file://, extension pages)
  // where injection either fails or makes no sense.
  if (window !== window.top) return;
  if (!/^https?:/.test(location.protocol)) return;

  // Idempotency guard — content scripts can be re-injected on SPA route
  // changes; we want exactly one launcher per page.
  if (document.documentElement.dataset.ncLauncherInstalled === '1') return;
  document.documentElement.dataset.ncLauncherInstalled = '1';

  const PANEL_WIDTH = 380;
  const BUTTON_SIZE = 48;
  const Z_INDEX = 2147483646; // one below 2^31-1 so we can layer above ourselves later

  // Host container — a single div on <body> hosts the Shadow DOM. Keeping it
  // outside the page's React tree means SPAs that wipe and re-render the DOM
  // won't accidentally tear down our widget.
  const host = document.createElement('div');
  host.id = 'naukri-clear-launcher-host';
  host.style.cssText = `
    all: initial;
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: ${Z_INDEX};
  `;
  const shadow = host.attachShadow({ mode: 'closed' });

  const iconUrl = chrome.runtime.getURL('icons/icon-48.png');
  const popupUrl = chrome.runtime.getURL('popup/popup.html');

  shadow.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }

      .launcher-btn {
        position: fixed;
        right: 0;
        top: 120px;
        width: ${BUTTON_SIZE}px;
        height: ${BUTTON_SIZE}px;
        border-radius: 10px 0 0 10px;
        border: none;
        background: #2547a0;
        cursor: pointer;
        box-shadow: -3px 4px 14px rgba(0, 0, 0, 0.18);
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
      }
      .launcher-btn:hover {
        transform: translateX(-2px);
        box-shadow: -5px 6px 18px rgba(0, 0, 0, 0.22);
      }
      .launcher-btn img {
        width: 28px;
        height: 28px;
        border-radius: 6px;
      }
      .launcher-btn[aria-expanded="true"] {
        background: #1a3578;
      }

      .panel {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: ${PANEL_WIDTH}px;
        max-width: 100vw;
        background: #ffffff;
        box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
        transform: translateX(100%);
        transition: transform 0.22s ease-out;
        pointer-events: auto;
        display: flex;
        flex-direction: column;
      }
      .panel.open {
        transform: translateX(0);
      }

      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        border-bottom: 1px solid #e8e5e0;
        background: #fbfaf8;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: #37352f;
      }
      .panel-close {
        background: transparent;
        border: none;
        cursor: pointer;
        color: #6b6962;
        font-size: 18px;
        line-height: 1;
        padding: 4px 8px;
        border-radius: 4px;
      }
      .panel-close:hover {
        background: #f1f0ed;
        color: #37352f;
      }

      .panel-frame {
        flex: 1 1 auto;
        border: none;
        width: 100%;
        height: 100%;
        display: block;
      }
    </style>

    <button class="launcher-btn" id="launcher-btn" aria-expanded="false" aria-label="Open Naukri Clear">
      <img src="${iconUrl}" alt="" />
    </button>

    <aside class="panel" id="panel" aria-hidden="true">
      <div class="panel-header">
        <span>Naukri Clear</span>
        <button class="panel-close" id="panel-close" aria-label="Close">&times;</button>
      </div>
      <iframe class="panel-frame" id="panel-frame" title="Naukri Clear"></iframe>
    </aside>
  `;

  document.body.appendChild(host);

  const btn = shadow.getElementById('launcher-btn');
  const panel = shadow.getElementById('panel');
  const frame = shadow.getElementById('panel-frame');
  const closeBtn = shadow.getElementById('panel-close');

  let frameLoaded = false;

  function openPanel() {
    if (!frameLoaded) {
      frame.src = popupUrl;
      frameLoaded = true;
    }
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
  }

  function closePanel() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
  }

  function togglePanel() {
    if (panel.classList.contains('open')) closePanel();
    else openPanel();
  }

  btn.addEventListener('click', togglePanel);
  closeBtn.addEventListener('click', closePanel);

  // Close on Escape when the panel is open and focus is inside it.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
  });

  // Allow other scripts (the iframe popup itself) to ask us to close. The
  // iframe sends a postMessage with { type: 'nc-close-panel' } and we honor it.
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'nc-close-panel') closePanel();
  });
})();
