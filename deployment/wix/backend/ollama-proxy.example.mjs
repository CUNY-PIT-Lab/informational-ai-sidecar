/**
 * WIX BACKEND EXAMPLE — THIN PROXY TO THE CANONICAL WEBSITE GUIDE API
 *
 * The canonical Railway service owns privacy screening, retrieval, model use,
 * grounding, capture policy, and response validation. This adapter deliberately
 * authors no Guide response and contains no alternate fallback logic.
 */

const DEFAULT_CHAT_API = "https://guide-api-production-a1a1.up.railway.app";
const MAX_BODY_CHARS = 12000;

const apiUrl = (baseUrl) => `${String(baseUrl || DEFAULT_CHAT_API).replace(/\/$/, "")}/api/chat`;

/**
 * Create the private Wix backend relay.
 *
 * Generated Wix code must apply its own public-method permission declaration.
 * `chatApi` should be the canonical Railway deployment, never a second model
 * implementation. The browser-facing custom element still performs its local
 * privacy hold before calling this relay.
 */
export const createChatHandler = ({
  chatApi = DEFAULT_CHAT_API,
  fetchImpl = fetch,
} = {}) => async (payload = {}) => {
  const body = JSON.stringify({
    message: String(payload.message || "").slice(0, 600),
    history: Array.isArray(payload.history) ? payload.history.slice(-6) : [],
    page_context: payload.page_context && typeof payload.page_context === "object"
      ? payload.page_context
      : {},
    client_surface: "wix",
    client_event_id: payload.client_event_id,
    conversation_id: payload.conversation_id,
    conversation_token: payload.conversation_token,
  });

  if (body.length > MAX_BODY_CHARS) {
    return { status: 400, body: { error: "Request is too large." } };
  }

  try {
    const response = await fetchImpl(apiUrl(chatApi), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    const result = await response.json();
    return { status: response.status, body: result };
  } catch {
    return { status: 503, body: { error: "Guide unavailable. Try again." } };
  }
};

/*
  Generated Wix wrapper, shown as pseudocode:

  const handler = createChatHandler({ chatApi: CANONICAL_RAILWAY_API });
  return handler({
    message,
    history,
    page_context,
    client_event_id,
    conversation_id,
    conversation_token,
  });

  Relay the returned status and JSON body without substituting participant-facing
  Guide copy. Provider credentials remain only on the canonical Railway service.
*/
