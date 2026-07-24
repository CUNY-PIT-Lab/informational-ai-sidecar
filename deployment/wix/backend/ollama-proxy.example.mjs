/**
 * WIX BACKEND EXAMPLE — ADAPT INSIDE A GENERATED WIX PROJECT
 *
 * This module avoids invented Wix package imports and extension IDs. Bind the
 * injected functions to the Secrets Manager, approved site index, and web
 * method or HTTP endpoint supplied by the current Wix project generator.
 * Browser code must never receive an API key.
 */

const OLLAMA_CHAT_URL = "https://ollama.com/api/chat";
const MODEL = "glm-5.2";
const HOME_URL = "https://www.fortunedigitalequity.org/";
const CONTACT_URL = "https://www.fortunedigitalequity.org/contact";
const MAX_HISTORY = 6;

const HOME_SOURCE = { id: "home", title: "Digital Equity home", url: HOME_URL };
const CONTACT_SOURCE = { id: "contact", title: "Contact Digital Equity", url: CONTACT_URL };
const HOME_LINK = { title: HOME_SOURCE.title, url: HOME_SOURCE.url };
const CONTACT_LINK = { title: CONTACT_SOURCE.title, url: CONTACT_SOURCE.url };

const cleanPageContext = (value = {}) => ({
  url: String(value.url || "").slice(0, 1000),
  path: String(value.path || "").slice(0, 160),
  title: String(value.title || "").slice(0, 200)
});

const cleanQuestion = (value) => String(value || "").trim().slice(0, 2000);

const cleanHistory = (history, detectSensitive) => {
  if (!Array.isArray(history)) return [];
  return history.slice(-MAX_HISTORY).flatMap((item) => {
    if (!item || !["user", "assistant"].includes(item.role)) return [];
    const content = String(item.content || "").trim().slice(0, 1600);
    if (!content || detectSensitive(content)) return [];
    return [{ role: item.role, content }];
  });
};

const responseContract = ({
  kind,
  message,
  reason = "",
  sources,
  related,
  choices = [],
  modelCalled,
  continuationAvailable
}) => ({
  kind,
  message: String(message || "").slice(0, 3000),
  reason: String(reason || "").slice(0, 1000),
  sources: (Array.isArray(sources) && sources.length ? sources : [HOME_SOURCE])
    .slice(0, 3)
    .map(({ id, title, url }) => ({ id, title, url })),
  related: (Array.isArray(related) && related.length ? related : [CONTACT_LINK])
    .slice(0, 3)
    .map(({ title, url }) => ({ title, url })),
  choices: Array.isArray(choices) ? choices.slice(0, 3) : [],
  handoff_url: CONTACT_URL,
  model: MODEL,
  model_called: Boolean(modelCalled),
  continuation: { label: "Ask the live guide", available: Boolean(continuationAvailable) }
});

const parseModelJson = (content) => {
  const text = String(content || "").trim().replace(/^```json\s*|\s*```$/g, "");
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("The model did not return JSON.");
  return JSON.parse(match[0]);
};

const validateModelResult = (modelResult, retrieved, modelAvailable) => {
  const sourceById = new Map(retrieved.sources.map((item) => [item.id, item]));
  const requestedIds = Array.isArray(modelResult.source_ids) ? modelResult.source_ids : [];
  const selected = requestedIds.map((id) => sourceById.get(id)).filter(Boolean);
  const sources = (selected.length ? selected : retrieved.sources).slice(0, 3).map(({ title, url }) => ({
    title,
    url
  }));
  const related = retrieved.related.slice(0, 3).map(({ title, url }) => ({ title, url }));
  const kind = ["clarify", "answer", "handoff"].includes(modelResult.kind)
    ? modelResult.kind
    : "answer";

  return responseContract({
    kind,
    message: modelResult.message || "Use the current Digital Equity pages or contact staff.",
    reason: modelResult.reason || "The suggestion uses current public Digital Equity sources.",
    sources,
    related,
    modelCalled: true,
    continuationAvailable: modelAvailable
  });
};

/**
 * Create the private backend handler.
 *
 * Required adapters:
 * - getSecretValue(name): retrieve a value from Wix Secrets Manager.
 * - retrieveApprovedContext(question, pageContext): return `passages`,
 *   `sources`, and `related`. Source records have id, title, and URL.
 * - detectSensitive(message): return true when personal information should be
 *   held before a model call.
 * - clarifyKnownAmbiguity(message): return null or an object with message,
 *   reason, sources, related, and `{ label, prompt }` choices.
 */
export const createChatHandler = ({
  getSecretValue,
  retrieveApprovedContext,
  detectSensitive,
  clarifyKnownAmbiguity,
  fetchImpl = fetch
}) => async ({ message, history, page_context }) => {
  const question = cleanQuestion(message);
  if (!question) {
    return { status: 400, body: { error: "Enter a question." } };
  }

  let apiKey = "";
  try {
    apiKey = await getSecretValue("OLLAMA_API_KEY");
  } catch {
    apiKey = "";
  }
  const modelAvailable = Boolean(apiKey);

  if (detectSensitive(question)) {
    return {
      status: 200,
      body: responseContract({
        kind: "privacy",
        message: "Please remove names, IDs, contact details, case information, and other personal details before using this meeting demo. Digital Equity staff can help through an approved channel.",
        reason: "This Ollama Cloud demonstration is for public or made-up questions only.",
        sources: [CONTACT_SOURCE],
        related: [HOME_LINK],
        modelCalled: false,
        continuationAvailable: modelAvailable
      })
    };
  }

  const clarification = clarifyKnownAmbiguity(question);
  if (clarification) {
    return {
      status: 200,
      body: responseContract({
        kind: "clarify",
        message: clarification.message,
        reason: clarification.reason || "One detail will help the guide choose a useful route.",
        sources: clarification.sources,
        related: clarification.related,
        choices: (clarification.choices || []).filter((choice) =>
          choice && choice.label && choice.prompt
        ),
        modelCalled: false,
        continuationAvailable: modelAvailable
      })
    };
  }

  const pageContext = cleanPageContext(page_context);
  const retrieved = await retrieveApprovedContext(question, pageContext);
  if (!retrieved || !Array.isArray(retrieved.sources) || !retrieved.sources.length) {
    return {
      status: 200,
      body: responseContract({
        kind: "handoff",
        message: "I could not confirm an answer from an approved page. Digital Equity staff can help you find the right information.",
        reason: "The approved public index does not contain enough information for this request.",
        sources: [HOME_SOURCE],
        related: [CONTACT_LINK],
        modelCalled: false,
        continuationAvailable: modelAvailable
      })
    };
  }

  if (!apiKey) {
    return {
      status: 200,
      body: responseContract({
        kind: "handoff",
        message: "The live model is not configured. The current Digital Equity pages and staff route are still available.",
        reason: "The page directory works without sending a question to an external model.",
        sources: retrieved.sources,
        related: retrieved.related,
        modelCalled: false,
        continuationAvailable: false
      })
    };
  }

  const systemPrompt = [
    "Answer only from the approved passages in CONTEXT.",
    "If the passages do not support an answer, say that plainly and recommend staff handoff.",
    "Return JSON with kind, message, reason, and source_ids.",
    "Use only source IDs present in CONTEXT. Do not include URLs of your own."
  ].join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    ...cleanHistory(history, detectSensitive),
    {
      role: "user",
      content: JSON.stringify({
        question,
        current_page: pageContext,
        CONTEXT: retrieved.passages
      })
    }
  ];

  try {
    const modelResponse = await fetchImpl(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        think: false,
        format: "json",
        messages
      })
    });

    if (!modelResponse.ok) throw new Error(`Ollama Cloud returned ${modelResponse.status}.`);
    const raw = await modelResponse.json();
    return {
      status: 200,
      body: validateModelResult(
        parseModelJson(raw.message && raw.message.content),
        retrieved,
        modelAvailable
      )
    };
  } catch {
    return {
      status: 200,
      body: responseContract({
        kind: "handoff",
        message: "The live model could not answer. Use the current page links or contact Digital Equity staff.",
        reason: "The verified directory stays available when the model is unavailable.",
        sources: retrieved.sources,
        related: retrieved.related,
        modelCalled: false,
        continuationAvailable: modelAvailable
      })
    };
  }
};

/*
  Generated Wix wrapper, shown as pseudocode:

  const handler = createChatHandler({
    getSecretValue: (name) => wixSecretsAdapter.getValue(name),
    retrieveApprovedContext,
    detectSensitive,
    clarifyKnownAmbiguity
  });

  // Use the generated permission declaration for public visitors and return
  // handler({ message, history, page_context }).body. Do not return secret
  // values or raw provider responses. Add an origin allowlist for HTTP routes.
*/
