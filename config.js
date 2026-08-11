// Public runtime configuration. Never put a provider credential in this file.
// Leave apiBaseUrl empty for the local same-origin server. A GitHub Pages copy
// may point it to an approved HTTPS model proxy with exact-origin CORS.
window.FORTUNE_GUIDE_CONFIG = Object.freeze({
  apiBaseUrl: window.location.hostname.endsWith("github.io")
    ? "https://guide-api-production-a1a1.up.railway.app"
    : "",
});
