(() => {
  "use strict";

  const Core = window.FortuneGuideCore;
  if (!Core) throw new Error("FortuneGuideCore must load before app.js");
  const panel = document.querySelector("#guide-panel");
  const toggle = document.querySelector("#guide-toggle");
  const closeButton = document.querySelector("#guide-close");
  const title = document.querySelector("#guide-title");
  const transcript = document.querySelector("#chat-transcript");
  const suggestions = document.querySelector("#chat-suggestions");
  const form = document.querySelector("#question-form");
  const questionLabel = document.querySelector("#question-label");
  const questionField = document.querySelector("#question");
  const submitButton = form.querySelector('button[type="submit"]');
  const editStatus = document.querySelector("#edit-status");
  const editCancel = document.querySelector("#edit-cancel");
  const modelStatus = document.querySelector("#model-status");
  const contextWindowText = document.querySelector("#context-window-text");
  const contextWindowCopy = document.querySelector("#context-window-copy");
  const API_BASE = String(window.FORTUNE_GUIDE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
  const CONTACT_URL = "https://www.fortunedigitalequity.org/contact";
  const MAX_CONTEXT_MESSAGES = 6;
  const MAX_CONTEXT_EXCHANGES = MAX_CONTEXT_MESSAGES / 2;

  let history = [];
  let latestTurn = null;
  let editTarget = null;
  let apiReady = false;
  let modelReady = false;
  let captureMode = "none";
  let conversationId = "";
  let conversationToken = "";
  let pendingClientEventId = "";
  let pendingQuestion = "";
  let answering = false;
  let activePageId = "";
  let warmupPromise = null;

  function apiUrl(path) {
    return `${API_BASE}${path}`;
  }

  function cleanText(value) {
    return Core.cleanText(value);
  }

  function personalInformationDetected(value) {
    return Core.personalInformationDetected(value);
  }

  function redactSixDigitValues(value) {
    return Core.redactSixDigitValues(value);
  }

  function currentPage() {
    return window.FortuneMockSite?.getCurrentPage?.() || null;
  }

  function pageContext() {
    const page = currentPage();
    return {
      url: page?.url || "",
      path: page?.url ? new URL(page.url).pathname : "",
      title: window.FortuneMockSite?.cleanTitle?.(page?.title) || "Digital Equity",
    };
  }

  function contextExchangeCount() {
    return Math.min(MAX_CONTEXT_EXCHANGES, Math.floor(history.length / 2));
  }

  function updateContextWindow() {
    const count = contextExchangeCount();
    contextWindowText.textContent = `Context · this page · ${count}/${MAX_CONTEXT_EXCHANGES}`;
  }

  function resizeQuestionField() {
    questionField.style.height = "auto";
    const maxHeight = Number.parseFloat(window.getComputedStyle(questionField).maxHeight) || 92;
    const borderHeight = questionField.offsetHeight - questionField.clientHeight;
    const contentHeight = questionField.scrollHeight + borderHeight;
    const nextHeight = Math.min(contentHeight, maxHeight);
    questionField.style.height = `${nextHeight}px`;
    questionField.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }

  function openGuide(options = {}) {
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    toggle.hidden = true;
    if (options.moveFocus !== false) closeButton.focus({ preventScroll: true });
  }

  function closeGuide(options = {}) {
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.hidden = false;
    if (options.restoreFocus !== false) toggle.focus();
  }

  function scrollConversation() {
    requestAnimationFrame(() => transcript.scrollTo({ top: transcript.scrollHeight, behavior: "smooth" }));
  }

  function revealResponse(article) {
    panel.classList.add("is-expanded");
    requestAnimationFrame(() => {
      const articleRect = article.getBoundingClientRect();
      const transcriptRect = transcript.getBoundingClientRect();
      const top = transcript.scrollTop + articleRect.top - transcriptRect.top;
      transcript.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
    });
  }

  function appendMessage(role, message, options = {}) {
    const article = document.createElement("article");
    article.className = `chat-message ${role}`;
    const meta = document.createElement("div");
    meta.className = "chat-message-meta";
    const label = document.createElement("p");
    label.className = "chat-speaker";
    label.textContent = role === "user" ? "You" : "Guide";
    const body = document.createElement("p");
    body.className = "chat-copy";
    body.textContent = redactSixDigitValues(cleanText(message));
    meta.append(label);

    if (role === "user" && options.editable) {
      transcript.querySelectorAll(".chat-message-actions").forEach(actions => actions.remove());
      const actions = document.createElement("div");
      actions.className = "chat-message-actions";
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "chat-edit-button";
      editButton.textContent = "Edit";
      editButton.setAttribute("aria-label", "Edit question");
      actions.append(editButton);
      meta.append(actions);
    }

    article.append(meta, body);

    if (Array.isArray(options.choices) && options.choices.length) {
      const choiceList = document.createElement("div");
      choiceList.className = "answer-choices";
      options.choices.slice(0, 3).forEach(choice => {
        if (!choice?.label || !choice?.prompt) return;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.prompt = choice.prompt;
        button.textContent = choice.label;
        choiceList.append(button);
      });
      article.append(choiceList);
    }

    if (options.destination?.url) {
      const action = document.createElement("a");
      action.className = "chat-destination";
      action.dataset.mockUrl = options.destination.url;
      const baseHref = window.FortuneMockSite.hrefFor(options.destination.url);
      const connector = String(baseHref).includes("?") ? "&" : "?";
      action.href = `${baseHref}${connector}open=1`;
      action.textContent = options.destination.title || "Go to the next page";
      article.append(action);
    }

    const sourceRows = Array.isArray(options.sources) ? options.sources.filter(source => source?.url && source?.title) : [];
    if (sourceRows.length) {
      const details = document.createElement("details");
      details.className = "chat-sources";
      const summary = document.createElement("summary");
      summary.textContent = sourceRows.length === 1 ? "Source" : `Sources · ${sourceRows.length}`;
      const list = document.createElement("ul");
      sourceRows.slice(0, 3).forEach(source => {
        const item = document.createElement("li");
        const link = document.createElement("a");
        link.dataset.mockUrl = source.url;
        link.href = window.FortuneMockSite.hrefFor(source.url);
        link.textContent = source.title;
        item.append(link);
        list.append(item);
      });
      details.append(summary, list);
      article.append(details);
    }

    transcript.append(article);
    if (options.revealStart) revealResponse(article);
    else scrollConversation();
    return article;
  }

  function distinctDestination(data) {
    const currentUrl = window.FortuneMockSite.canonicalUrl(currentPage()?.url);
    const sourceRows = Array.isArray(data?.sources) ? data.sources : [];
    const relatedRows = Array.isArray(data?.related) ? data.related : [];
    const rows = ["site", "staff"].includes(data?.retrieval_scope)
      ? [...sourceRows, ...relatedRows]
      : [...relatedRows, ...sourceRows];
    const found = rows.find(row => row?.url && window.FortuneMockSite.canonicalUrl(row.url) !== currentUrl && window.FortuneMockSite.isKnown(row.url));
    if (found) {
      const title = Core.destinationLabel(found.title);
      return { url: found.url, title };
    }
    return null;
  }

  function renderSuggestions(starter) {
    suggestions.replaceChildren();
    (starter?.suggestions || []).slice(0, 2).forEach(prompt => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.prompt = prompt;
      button.textContent = Core.suggestionLabel(prompt);
      suggestions.append(button);
    });
  }

  function resetForPage(page, starter) {
    if (!page) return;
    activePageId = page.id;
    history = [];
    latestTurn = null;
    endEditing({ clearInput: true });
    conversationId = "";
    conversationToken = "";
    pendingClientEventId = "";
    pendingQuestion = "";
    updateContextWindow();
    panel.classList.remove("is-expanded");
    transcript.replaceChildren();
    title.textContent = "Website Guide";
    questionField.placeholder = "Ask about this page";
    renderSuggestions(starter);
  }

  function setEditStatus(message = "") {
    editStatus.textContent = message;
    editStatus.hidden = !message;
  }

  function setBusy(value) {
    answering = value;
    if (value) panel.classList.add("is-expanded");
    submitButton.disabled = value;
    questionField.readOnly = value;
    editCancel.disabled = value;
    transcript.querySelectorAll(".chat-edit-button").forEach(button => { button.disabled = value; });
    panel.setAttribute("aria-busy", String(value));
    submitButton.textContent = value ? "Sending…" : editTarget ? "Update" : "Send";
  }

  function endEditing(options = {}) {
    editTarget?.userArticle?.classList.remove("is-editing");
    editTarget = null;
    form.classList.remove("is-editing");
    editCancel.hidden = true;
    setEditStatus();
    questionLabel.textContent = "Question";
    if (options.clearInput) {
      questionField.value = "";
      resizeQuestionField();
    }
    if (!answering) submitButton.textContent = "Send";
  }

  function startEditing(userArticle) {
    if (!latestTurn || latestTurn.userArticle !== userArticle || answering) return;
    editTarget?.userArticle?.classList.remove("is-editing");
    editTarget = latestTurn;
    pendingClientEventId = "";
    pendingQuestion = "";
    userArticle.classList.add("is-editing");
    form.classList.add("is-editing");
    editCancel.hidden = false;
    setEditStatus();
    questionLabel.textContent = "Edit question";
    questionField.value = latestTurn.question;
    resizeQuestionField();
    submitButton.textContent = "Update";
    questionField.focus({ preventScroll: true });
    questionField.setSelectionRange(questionField.value.length, questionField.value.length);
  }

  function privacyHold(editing = false) {
    pendingClientEventId = "";
    pendingQuestion = "";
    questionField.value = "";
    resizeQuestionField();

    if (editing) {
      setEditStatus("Not sent. Remove personal information.");
      return;
    }

    suggestions.replaceChildren();
    appendMessage("user", "Not sent");
    appendMessage(
      "assistant",
      "Remove personal information and try again.",
      {
        destination: distinctDestination({ related: [{ title: "Contact", url: CONTACT_URL }] }),
        scope: "staff",
        revealStart: true,
      },
    );
    history = [];
    latestTurn = null;
    conversationId = "";
    conversationToken = "";
    transcript.querySelectorAll(".chat-message-actions").forEach(actions => actions.remove());
    updateContextWindow();
  }

  async function remoteAnswer(question, clientEventId, options = {}) {
    const response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: question,
        history: options.history || history,
        page_context: pageContext(),
        client_surface: "replica",
        client_event_id: clientEventId,
        conversation_id: options.startNew ? undefined : conversationId || undefined,
        conversation_token: options.startNew ? undefined : conversationToken || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      const error = new Error(data.error || "The live model could not answer.");
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function warmModel() {
    try {
      const response = await fetch(apiUrl("/api/warmup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Model warm-up failed");
      const data = await response.json();
      if (data.status !== "ready") throw new Error("Model warm-up unavailable");
      modelStatus.textContent = "Ready";
      modelStatus.classList.add("model-ready");
      return data;
    } catch {
      modelStatus.textContent = modelReady ? "Ready" : "Source only";
      return null;
    }
  }

  function showAnswer(data) {
    suggestions.replaceChildren();
    const destination = Array.isArray(data?.choices) && data.choices.length
      ? null
      : distinctDestination(data);
    return appendMessage("assistant", data.message || "I couldn’t confirm that on Fortune’s public pages.", {
      choices: data.choices,
      destination,
      sources: data.sources,
      scope: data.retrieval_scope || (data.sources?.some(source => source.url === currentPage()?.url) ? "page" : "site"),
      revealStart: true,
    });
  }

  function showUnavailable(message = "Guide unavailable. Try again.") {
    showAnswer({
      kind: "handoff",
      message,
      reason: "",
      sources: [],
      related: [{ title: "Contact", url: CONTACT_URL }],
      retrieval_scope: "staff",
      model_called: false,
    });
  }

  async function ask(question, options = {}) {
    const value = cleanText(question);
    if (!value || answering) return;
    const restoreComposerFocus = options.restoreFocus || form.contains(document.activeElement);
    questionField.value = "";
    resizeQuestionField();

    if (personalInformationDetected(value)) {
      privacyHold(Boolean(editTarget));
      return;
    }

    const safeQuestion = redactSixDigitValues(value);
    const editing = editTarget;
    const requestHistory = editing ? Core.historyBeforeLatestExchange(history) : history;
    if (pendingQuestion !== safeQuestion || !pendingClientEventId) {
      pendingQuestion = safeQuestion;
      pendingClientEventId = window.crypto.randomUUID();
    }
    suggestions.replaceChildren();
    setBusy(true);
    try {
      if (!apiReady) {
        await checkHealth();
        if (!apiReady) throw new Error("The guide backend is unavailable.");
      }
      const data = await remoteAnswer(safeQuestion, pendingClientEventId, {
        history: requestHistory,
        startNew: Boolean(editing),
      });
      if (data.kind === "privacy") {
        privacyHold(Boolean(editing));
        return;
      }
      if (editing) {
        let node = editing.userArticle;
        while (node) {
          const next = node.nextSibling;
          node.remove();
          node = next;
        }
        endEditing();
      }
      const userArticle = appendMessage("user", safeQuestion, { editable: true });
      const answer = redactSixDigitValues(data.message || "");
      const assistantArticle = showAnswer(data);
      history = [...requestHistory, { role: "user", content: safeQuestion }, { role: "assistant", content: answer }]
        .slice(-MAX_CONTEXT_MESSAGES);
      latestTurn = { question: safeQuestion, answer, userArticle, assistantArticle };
      conversationId = String(data.conversation_id || (editing ? "" : conversationId));
      conversationToken = String(data.conversation_token || (editing ? "" : conversationToken));
      updateContextWindow();
      pendingClientEventId = "";
      pendingQuestion = "";
    } catch (error) {
      questionField.value = value;
      resizeQuestionField();
      if (error?.payload?.idempotency_complete) {
        pendingClientEventId = "";
        pendingQuestion = "";
      }
      apiReady = false;
      modelReady = false;
      modelStatus.textContent = "Unavailable";
      modelStatus.classList.remove("model-ready");
      if (editing) {
        setEditStatus(error?.payload?.idempotency_complete
          ? "Try again or cancel."
          : "Couldn’t update. Try again or cancel.");
      } else {
        showUnavailable(error?.payload?.idempotency_complete
          ? "Try again."
          : undefined);
      }
    } finally {
      setBusy(false);
      if (restoreComposerFocus && !panel.hidden) questionField.focus({ preventScroll: true });
    }
  }

  async function checkHealth() {
    try {
      const response = await fetch(apiUrl("/health"), { cache: "no-store" });
      if (!response.ok || !String(response.headers.get("content-type") || "").includes("application/json")) throw new Error("No model backend");
      const data = await response.json();
      apiReady = true;
      modelReady = Boolean(data.model_enabled);
      captureMode = ["none", "metadata", "transcript"].includes(data.conversation_logging?.capture_mode)
        ? data.conversation_logging.capture_mode
        : "none";
      contextWindowCopy.textContent = captureMode === "transcript"
        ? "This review build records questions and answers."
        : captureMode === "metadata"
          ? "This review build stores IDs and response data, not chat text."
          : "Up to 3 exchanges stay in this tab. Changing pages clears them. Chat text isn’t stored.";
      modelStatus.textContent = modelReady ? "Starting…" : "Source only";
      modelStatus.classList.toggle("model-ready", modelReady);
      if (modelReady) warmupPromise = warmModel();
    } catch {
      apiReady = false;
      modelReady = false;
      captureMode = "none";
      modelStatus.textContent = "Source only";
      modelStatus.classList.remove("model-ready");
    }
  }

  toggle.addEventListener("click", openGuide);
  closeButton.addEventListener("click", closeGuide);
  form.addEventListener("submit", event => {
    event.preventDefault();
    ask(questionField.value);
  });
  questionField.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });
  questionField.addEventListener("input", resizeQuestionField);
  suggestions.addEventListener("click", event => {
    const button = event.target.closest("[data-prompt]");
    if (!button) return;
    ask(button.dataset.prompt, { restoreFocus: event.detail === 0 });
  });
  transcript.addEventListener("click", event => {
    const editButton = event.target.closest(".chat-edit-button");
    if (editButton) {
      startEditing(editButton.closest(".chat-message.user"));
      return;
    }
    const button = event.target.closest("[data-prompt]");
    if (button) ask(button.dataset.prompt, { restoreFocus: event.detail === 0 });
  });
  editCancel.addEventListener("click", () => {
    pendingClientEventId = "";
    pendingQuestion = "";
    endEditing({ clearInput: true });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !panel.hidden) closeGuide();
  });
  window.addEventListener("fortune:pagechange", event => {
    if (event.detail?.page?.id === activePageId) return;
    resetForPage(event.detail.page, event.detail.starter);
  });

  window.FortuneMockSite.ready.then(page => {
    if (page.id !== activePageId) resetForPage(page, window.FortuneMockSite.getStarter(page));
    checkHealth();
    const search = new URLSearchParams(window.location.search);
    if (search.get("open") === "1") openGuide({ moveFocus: false });
  });

  window.FortuneGuide = Object.freeze({
    ask,
    open: openGuide,
    close: closeGuide,
    privacyDetected: personalInformationDetected,
    state: () => ({
      apiReady,
      modelReady,
      captureMode,
      conversationId,
      pendingClientEventId,
      activePageId,
      answering,
      historyLength: history.length,
      latestQuestion: latestTurn?.question || "",
      editing: Boolean(editTarget),
      contextExchanges: contextExchangeCount(),
    }),
  });
})();
