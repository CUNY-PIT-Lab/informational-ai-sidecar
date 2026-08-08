(() => {
  "use strict";

  const Core = window.FortuneGuideCore;
  if (!Core) throw new Error("FortuneGuideCore must load before app.js");
  const guide = document.querySelector(".guide");
  const panel = document.querySelector("#guide-panel");
  const toggle = document.querySelector("#guide-toggle");
  const closeButton = document.querySelector("#guide-close");
  const title = document.querySelector("#guide-title");
  const transcript = document.querySelector("#chat-transcript");
  const suggestions = document.querySelector("#chat-suggestions");
  const form = document.querySelector("#question-form");
  const questionField = document.querySelector("#question");
  const submitButton = form.querySelector('button[type="submit"]');
  const modelStatus = document.querySelector("#model-status");
  const contextWindow = document.querySelector("#context-window");
  const contextWindowText = document.querySelector("#context-window-text");
  const contextWindowCopy = document.querySelector("#context-window-copy");
  const walkthrough = document.querySelector("#walkthrough");
  const walkthroughCard = walkthrough.querySelector(".walkthrough-card");
  const walkthroughTitle = document.querySelector("#walkthrough-title");
  const walkthroughCopy = document.querySelector("#walkthrough-copy");
  const walkthroughCount = document.querySelector("#walkthrough-count");
  const walkthroughInstruction = document.querySelector("#walkthrough-instruction");
  const walkthroughLive = document.querySelector("#walkthrough-live");
  const walkthroughSkip = document.querySelector("#walkthrough-skip");
  const walkthroughNext = document.querySelector("#walkthrough-next");
  const walkthroughReplay = document.querySelector("#walkthrough-replay");
  const API_BASE = String(window.FORTUNE_GUIDE_CONFIG?.apiBaseUrl || "").replace(/\/$/, "");
  const CONTACT_URL = "https://www.fortunedigitalequity.org/contact";
  const TRAININGS_URL = "https://www.fortunedigitalequity.org/trainings";
  const MAX_CONTEXT_MESSAGES = 6;
  const MAX_CONTEXT_EXCHANGES = MAX_CONTEXT_MESSAGES / 2;
  const WALKTHROUGH_STORAGE_KEY = "fortune-guide-walkthrough-v1";

  let history = [];
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
  let walkthroughStep = -1;
  let walkthroughStartedOpen = false;
  let walkthroughStartedExpanded = false;
  let walkthroughLastFocus = null;

  const walkthroughSteps = [
    {
      title: "Meet the page guide",
      copy: "This informational sidecar helps you understand the page you are on by checking it first and looking elsewhere on the site only when needed.",
      primary: "Show me how",
      target: ["#guide-toggle"],
      panelOpen: false,
    },
    {
      title: "This page sets the first boundary",
      copy: "The current page title and URL travel with every question. The guide checks this page’s approved record before it looks across the wider site.",
      primary: "See page questions",
      target: [".page-title", "#guide-header"],
      panelOpen: true,
    },
    {
      title: "Questions change with the page",
      copy: "The suggested questions and page FAQs follow the page’s type and material. Choose either option to see the guide check this page first.",
      instruction: "Choose one of the highlighted questions in the guide.",
      target: ["#chat-suggestions"],
      panelOpen: true,
      requiresSuggestion: true,
    },
    {
      title: "You can inspect the source",
      copy: "The guide shows which public page supplied the answer. The model can select an approved source, while the visible facts come from that source record.",
      primary: "See the context limit",
      target: [".chat-message.assistant:last-child"],
      panelOpen: true,
      openSources: true,
    },
    {
      title: "The context stays small",
      copy: "Only the last three exchanges stay in memory for this tab. A new page clears them, and the server keeps no chat database.",
      primary: "Finish",
      target: ["#context-window"],
      panelOpen: true,
      openContext: true,
    },
  ];

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
    contextWindowText.textContent = `This page + ${count} of ${MAX_CONTEXT_EXCHANGES} recent exchanges`;
  }

  function walkthroughWasSeen() {
    try {
      return window.localStorage.getItem(WALKTHROUGH_STORAGE_KEY) === "seen";
    } catch {
      return false;
    }
  }

  function recordWalkthroughSeen() {
    try {
      window.localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "seen");
    } catch {
      // The walkthrough can still run when storage is unavailable.
    }
  }

  function openGuide() {
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
    toggle.hidden = true;
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

  function clearWalkthroughFocus() {
    document.querySelectorAll(".walkthrough-focus").forEach(element => element.classList.remove("walkthrough-focus"));
    guide.classList.remove("is-walkthrough-layer");
  }

  function applyWalkthroughTargets(step) {
    clearWalkthroughFocus();
    let firstTarget = null;
    for (const selector of step.target || []) {
      const target = document.querySelector(selector);
      if (!target || target.hidden) continue;
      target.classList.add("walkthrough-focus");
      firstTarget ||= target;
      if (guide.contains(target)) guide.classList.add("is-walkthrough-layer");
    }
    return firstTarget;
  }

  function walkthroughFocusables() {
    const controls = [
      ...walkthroughCard.querySelectorAll("button:not([hidden]):not([disabled])"),
    ];
    if (walkthroughSteps[walkthroughStep]?.requiresSuggestion) {
      controls.push(...suggestions.querySelectorAll("button:not([disabled])"));
    }
    return controls.filter(control => control.offsetParent !== null);
  }

  function setWalkthroughStep(index) {
    const step = walkthroughSteps[index];
    if (!step) {
      endWalkthrough(true);
      return;
    }

    walkthroughStep = index;
    if (step.panelOpen) {
      openGuide();
      if (history.length === 0 && index < 3) panel.classList.add("is-tour-open");
      else panel.classList.add("is-expanded");
    } else {
      closeGuide({ restoreFocus: false });
    }

    contextWindow.open = Boolean(step.openContext);
    if (step.openSources) {
      const sourceDetails = transcript.querySelector(".chat-message.assistant:last-child .chat-sources");
      if (sourceDetails) sourceDetails.open = true;
    }

    walkthrough.dataset.step = String(index + 1);
    walkthroughTitle.textContent = step.title;
    walkthroughCopy.textContent = step.copy;
    walkthroughCount.textContent = `${index + 1} of ${walkthroughSteps.length}`;
    walkthroughInstruction.hidden = !step.instruction;
    walkthroughInstruction.textContent = step.instruction || "";
    walkthroughSkip.textContent = index === 0 ? "Not now" : "Skip tour";
    walkthroughNext.hidden = Boolean(step.requiresSuggestion);
    walkthroughNext.textContent = step.primary || "Continue";
    walkthrough.classList.remove("is-waiting");
    walkthrough.hidden = false;
    walkthrough.setAttribute("aria-hidden", "false");
    document.body.classList.add("walkthrough-active");

    const target = applyWalkthroughTargets(step);
    requestAnimationFrame(() => {
      walkthroughCard.classList.remove("is-entering");
      void walkthroughCard.offsetWidth;
      walkthroughCard.classList.add("is-entering");
      if (step.requiresSuggestion) {
        const firstSuggestion = suggestions.querySelector("button");
        if (firstSuggestion) firstSuggestion.focus();
        else walkthroughSkip.focus();
      } else {
        walkthroughNext.focus();
      }
      if (target) target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    });
    walkthroughLive.textContent = `Step ${index + 1} of ${walkthroughSteps.length}. ${step.title}. ${step.copy}`;
  }

  function setWalkthroughWaiting(value) {
    walkthrough.classList.toggle("is-waiting", value);
    walkthroughInstruction.hidden = false;
    walkthroughInstruction.textContent = value
      ? "Checking the approved record for this page first…"
      : "Choose one of the highlighted questions in the guide.";
    if (value) {
      clearWalkthroughFocus();
      panel.classList.add("walkthrough-focus");
      guide.classList.add("is-walkthrough-layer");
      walkthroughSkip.focus();
    }
  }

  function startWalkthrough() {
    if (walkthroughStep >= 0) return;
    walkthroughStartedOpen = !panel.hidden;
    walkthroughStartedExpanded = panel.classList.contains("is-expanded");
    walkthroughLastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!suggestions.querySelector("button")) {
      renderSuggestions(window.FortuneMockSite.getStarter(currentPage()));
    }
    setWalkthroughStep(0);
  }

  function endWalkthrough(completed = false) {
    if (walkthroughStep < 0) return;
    const shouldReturnClosed = !completed && !walkthroughStartedOpen && history.length === 0;
    walkthroughStep = -1;
    walkthrough.hidden = true;
    walkthrough.setAttribute("aria-hidden", "true");
    walkthrough.classList.remove("is-waiting");
    walkthrough.removeAttribute("data-step");
    document.body.classList.remove("walkthrough-active");
    contextWindow.open = false;
    clearWalkthroughFocus();
    recordWalkthroughSeen();
    panel.classList.remove("is-tour-open");
    if (!walkthroughStartedExpanded && history.length === 0) panel.classList.remove("is-expanded");
    if (walkthroughStartedOpen) openGuide();
    else if (shouldReturnClosed) closeGuide({ restoreFocus: false });
    if (walkthroughLastFocus?.isConnected && !walkthroughLastFocus.hidden) walkthroughLastFocus.focus();
    else if (!panel.hidden) closeButton.focus();
    else toggle.focus();
    walkthroughLastFocus = null;
  }

  function handleWalkthroughKeydown(event) {
    if (walkthroughStep < 0) return;
    if (event.key === "Escape") {
      event.preventDefault();
      endWalkthrough(false);
      return;
    }
    if (event.key !== "Tab") return;
    const controls = walkthroughFocusables();
    if (!controls.length) return;
    const currentIndex = controls.indexOf(document.activeElement);
    const nextIndex = event.shiftKey
      ? (currentIndex <= 0 ? controls.length - 1 : currentIndex - 1)
      : (currentIndex < 0 || currentIndex === controls.length - 1 ? 0 : currentIndex + 1);
    event.preventDefault();
    controls[nextIndex].focus();
  }

  function appendMessage(role, message, options = {}) {
    const article = document.createElement("article");
    article.className = `chat-message ${role}`;
    const label = document.createElement("p");
    label.className = "chat-speaker";
    label.textContent = role === "user" ? "You" : "Digital Equity guide";
    const body = document.createElement("p");
    body.className = "chat-copy";
    body.textContent = redactSixDigitValues(cleanText(message));
    article.append(label, body);

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
      const scope = options.scope === "page"
        ? "Source on this page"
        : options.scope === "staff"
          ? "Staff route"
          : "Website sources";
      summary.textContent = sourceRows.length === 1 ? scope : `${scope} (${sourceRows.length})`;
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
    const fallback = currentUrl === CONTACT_URL ? TRAININGS_URL : CONTACT_URL;
    return { url: fallback, title: currentUrl === CONTACT_URL ? "Go to current trainings" : "Contact Digital Equity staff" };
  }

  function renderSuggestions(starter) {
    suggestions.replaceChildren();
    (starter?.suggestions || []).slice(0, 2).forEach(prompt => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.prompt = prompt;
      button.textContent = prompt;
      suggestions.append(button);
    });
  }

  function resetForPage(page, starter) {
    if (!page) return;
    activePageId = page.id;
    history = [];
    conversationId = "";
    conversationToken = "";
    pendingClientEventId = "";
    pendingQuestion = "";
    updateContextWindow();
    panel.classList.remove("is-expanded");
    transcript.replaceChildren();
    title.textContent = starter.heading;
    questionField.placeholder = starter.placeholder;
    renderSuggestions(starter);
    const pageTitle = window.FortuneMockSite.cleanTitle(page.title);
    let greeting = `You’re on ${pageTitle}. Ask about this page, or tell me what you’re trying to do and I’ll take you to the right section.`;
    if (starter.family === "archive") greeting = `This is a historical page. Tell me what current information you need and I’ll take you to the right section.`;
    if (starter.family === "excluded") greeting = `This route is not reproduced in the public demo. Tell me what current information you need and I’ll take you to a public section.`;
    appendMessage("assistant", greeting);
  }

  function setBusy(value) {
    answering = value;
    if (value) panel.classList.add("is-expanded");
    submitButton.disabled = value;
    questionField.disabled = value;
    panel.setAttribute("aria-busy", String(value));
    submitButton.textContent = value ? "Checking…" : "Ask";
  }

  function privacyHold() {
    suggestions.replaceChildren();
    appendMessage("user", "[Personal information removed]");
    appendMessage(
      "assistant",
      "We removed that entry before it left this browser. Please ask again without your six-digit Fortune ID, name, contact details, case information, health information, or other personally identifiable information.",
      {
        destination: distinctDestination({ related: [{ title: "Contact Digital Equity staff", url: CONTACT_URL }] }),
        scope: "staff",
        revealStart: true,
      },
    );
    history = [];
    updateContextWindow();
  }

  async function remoteAnswer(question, clientEventId) {
    if (warmupPromise) {
      try {
        await warmupPromise;
      } catch {
        // The chat request can still succeed when a preload attempt fails.
      }
    }
    const response = await fetch(apiUrl("/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: question,
        history,
        page_context: pageContext(),
        client_surface: "replica",
        client_event_id: clientEventId,
        conversation_id: conversationId || undefined,
        conversation_token: conversationToken || undefined,
      }),
    });
    const data = await response.json();
    conversationId = String(data.conversation_id || conversationId);
    conversationToken = String(data.conversation_token || conversationToken);
    if (!response.ok || data.error) {
      const error = new Error(data.error || "The live model could not answer.");
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function warmModel(modelName, pages) {
    try {
      const response = await fetch(apiUrl("/api/warmup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw new Error("Model warm-up failed");
      const data = await response.json();
      if (data.status !== "ready") throw new Error("Model warm-up unavailable");
      modelStatus.textContent = `Live ${data.model || modelName || "model"} · ready`;
      modelStatus.classList.add("model-ready");
      return data;
    } catch {
      modelStatus.textContent = modelReady
        ? `Live ${modelName || "model"} · page-first`
        : `Source guide · ${pages} pages`;
      return null;
    }
  }

  function showAnswer(data) {
    suggestions.replaceChildren();
    const destination = distinctDestination(data);
    appendMessage("assistant", data.message || "The website does not contain an approved answer. Please contact Digital Equity staff.", {
      choices: data.choices,
      destination,
      sources: data.sources,
      scope: data.retrieval_scope || (data.sources?.some(source => source.url === currentPage()?.url) ? "page" : "site"),
      revealStart: true,
    });
  }

  function showUnavailable(message = "The guide could not display an answer right now. Please retry; the guide will reuse the same request when possible, or contact Digital Equity staff.") {
    showAnswer({
      kind: "handoff",
      message,
      reason: "The source pages remain available while the guide reconnects.",
      sources: [],
      related: [{ title: "Contact Digital Equity staff", url: CONTACT_URL }],
      retrieval_scope: "staff",
      model_called: false,
    });
  }

  async function ask(question) {
    const value = cleanText(question);
    if (!value || answering) return;
    questionField.value = "";

    if (personalInformationDetected(value)) {
      privacyHold();
      return;
    }

    const safeQuestion = redactSixDigitValues(value);
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
      const data = await remoteAnswer(safeQuestion, pendingClientEventId);
      appendMessage("user", safeQuestion);
      history.push({ role: "user", content: safeQuestion }, { role: "assistant", content: redactSixDigitValues(data.message || "") });
      history = history.slice(-MAX_CONTEXT_MESSAGES);
      updateContextWindow();
      showAnswer(data);
      pendingClientEventId = "";
      pendingQuestion = "";
    } catch (error) {
      questionField.value = value;
      if (error?.payload?.idempotency_complete) {
        pendingClientEventId = "";
        pendingQuestion = "";
      }
      apiReady = false;
      modelReady = false;
      modelStatus.textContent = "Guide temporarily unavailable";
      modelStatus.classList.remove("model-ready");
      showUnavailable(error?.payload?.idempotency_complete
        ? "That request finished, but this privacy mode did not retain answer text for replay. Please submit it once more or contact Digital Equity staff."
        : undefined);
    } finally {
      setBusy(false);
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
      walkthroughSteps[4].copy = captureMode === "transcript"
        ? "Only the last three exchanges stay in this tab. This approved evaluation build records questions and answers that pass its automated privacy hold for authorized reviewers. Do not enter personal information."
        : captureMode === "metadata"
          ? "Only the last three exchanges stay in this tab. This evaluation build records conversation IDs and response metadata, not question or answer text."
          : "Only the last three exchanges stay in memory for this tab. A new page clears them, and the server keeps no chat database.";
      contextWindowCopy.textContent = captureMode === "transcript"
        ? "Changing pages starts a new conversation. This approved evaluation build records questions and answers that pass its automated privacy hold for authorized review. The hold is not guaranteed anonymization, so do not enter personal information."
        : captureMode === "metadata"
          ? "Changing pages starts a new conversation. This evaluation build records IDs and response metadata, not question or answer text."
          : "The current page title and URL travel with each question. Changing pages clears the conversation, and the server keeps no chat database.";
      const pages = Number(data.indexed_pages) || Number(window.FortuneMockSite.getIndex()?.unique_urls) || 199;
      modelStatus.textContent = modelReady ? `Preparing ${data.model || "live model"}…` : `Source guide · ${pages} pages`;
      modelStatus.classList.toggle("model-ready", modelReady);
      if (modelReady) warmupPromise = warmModel(data.model, pages);
    } catch {
      const pages = Number(window.FortuneMockSite.getIndex()?.unique_urls) || 199;
      apiReady = false;
      modelReady = false;
      captureMode = "none";
      modelStatus.textContent = `Source guide · ${pages} pages`;
      modelStatus.classList.remove("model-ready");
    }
  }

  toggle.addEventListener("click", () => {
    if (walkthroughStep === 0) setWalkthroughStep(1);
    else openGuide();
  });
  closeButton.addEventListener("click", () => {
    if (walkthroughStep >= 0) endWalkthrough(false);
    else closeGuide();
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    ask(questionField.value);
  });
  suggestions.addEventListener("click", async event => {
    const button = event.target.closest("[data-prompt]");
    if (!button) return;
    if (walkthroughSteps[walkthroughStep]?.requiresSuggestion) {
      setWalkthroughWaiting(true);
      await ask(button.dataset.prompt);
      if (walkthroughStep >= 0) setWalkthroughStep(walkthroughStep + 1);
      return;
    }
    ask(button.dataset.prompt);
  });
  transcript.addEventListener("click", event => {
    const button = event.target.closest("[data-prompt]");
    if (button) ask(button.dataset.prompt);
  });
  document.addEventListener("keydown", event => {
    if (walkthroughStep >= 0) {
      handleWalkthroughKeydown(event);
      return;
    }
    if (event.key === "Escape" && !panel.hidden) closeGuide();
  });
  walkthroughNext.addEventListener("click", () => setWalkthroughStep(walkthroughStep + 1));
  walkthroughSkip.addEventListener("click", () => endWalkthrough(false));
  walkthroughReplay.addEventListener("click", startWalkthrough);
  window.addEventListener("fortune:pagechange", event => {
    if (event.detail?.page?.id === activePageId) return;
    resetForPage(event.detail.page, event.detail.starter);
  });

  window.FortuneMockSite.ready.then(page => {
    if (page.id !== activePageId) resetForPage(page, window.FortuneMockSite.getStarter(page));
    checkHealth();
    const search = new URLSearchParams(window.location.search);
    if (search.get("open") === "1") openGuide();
    if (search.get("tour") === "1" || !walkthroughWasSeen()) {
      window.setTimeout(startWalkthrough, 420);
    }
  });

  window.FortuneGuide = Object.freeze({
    ask,
    open: openGuide,
    close: closeGuide,
    tour: startWalkthrough,
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
      contextExchanges: contextExchangeCount(),
      walkthroughStep,
    }),
  });
})();
