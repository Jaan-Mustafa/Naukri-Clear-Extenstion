// Defaults point at production. Override per-install by running this in the
// extension's DevTools console (right-click icon → Inspect popup/side panel):
//   chrome.storage.local.set({
//     apiBase: 'http://localhost:8080',
//     appBase: 'http://localhost:5173'
//   })
// Reload the extension to pick up the override.

const DEFAULT_CONFIG = {
  API_BASE: 'https://api.naukriclear.com',
  APP_BASE: 'https://naukriclear.com',
};

function loadConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiBase', 'appBase'], (result) => {
      resolve({
        API_BASE: result.apiBase || DEFAULT_CONFIG.API_BASE,
        APP_BASE: result.appBase || DEFAULT_CONFIG.APP_BASE,
      });
    });
  });
}
