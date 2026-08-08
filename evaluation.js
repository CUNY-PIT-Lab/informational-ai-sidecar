(() => {
  "use strict";

  const accessView = document.querySelector("#access-view");
  const workspace = document.querySelector("#workspace");
  const loginForm = document.querySelector("#login-form");
  const claimForm = document.querySelector("#claim-form");
  const claimCancel = document.querySelector("#claim-cancel");
  const accessStatus = document.querySelector("#access-status");
  const accountButton = document.querySelector("#account-button");
  const accountDialog = document.querySelector("#account-dialog");
  const accountClose = document.querySelector("#account-close");
  const accountName = document.querySelector("#account-name");
  const accountSlots = document.querySelector("#account-slots");
  const logoutButton = document.querySelector("#logout-button");
  const board = document.querySelector("#conversation-board");
  const emptyState = document.querySelector("#empty-state");
  const search = document.querySelector("#conversation-search");
  const newBucketButton = document.querySelector("#new-bucket-button");
  const bucketDialog = document.querySelector("#bucket-dialog");
  const bucketForm = document.querySelector("#bucket-form");
  const bucketClose = document.querySelector("#bucket-close");
  const transcriptDialog = document.querySelector("#transcript-dialog");
  const transcriptClose = document.querySelector("#transcript-close");
  const transcriptTitle = document.querySelector("#transcript-title");
  const transcriptMeta = document.querySelector("#transcript-meta");
  const transcript = document.querySelector("#transcript");
  const moveStatus = document.querySelector("#move-status");

  const localPreview = ["127.0.0.1", "localhost"].includes(location.hostname)
    && new URLSearchParams(location.search).get("preview") === "1";
  const previewKey = "fortune-evaluation-preview-v2";
  const state = {
    session: null,
    csrf: "",
    buckets: [],
    conversations: [],
    selectedId: "",
  };

  const previewBuckets = [
    { id: "success", label: "Success", color_key: "sky", standard_key: "success" },
    { id: "needs", label: "Needs work", color_key: "coral", standard_key: "needs" },
    { id: "handoff", label: "Handoff", color_key: "blue", standard_key: "handoff" },
  ];
  const previewConversations = [
    ["7b8d3e", "Digital Literacy Workshops", 6, null],
    ["4c6e8f", "Internet Access Support", 7, null],
    ["9f2a1c", "Device Distribution", 8, "success"],
    ["6e7f9g", "Legal Help Referrals", 6, "needs"],
    ["3h6j8k", "Benefits Assistance", 5, "handoff"],
    ["5k9l0m", "Program Navigation", 4, "handoff"],
  ].map(([id, page_title, turn_count, bucket_id]) => ({
    id, page_title, turn_count, bucket_id, transcript_version: turn_count,
    last_turn_at: "2026-08-08T14:30:00Z",
  }));

  function shortId(value) {
    return `CV-${String(value || "").replace(/-/g, "").slice(0, 6).toUpperCase()}`;
  }

  function setStatus(message, error = false) {
    accessStatus.textContent = message;
    accessStatus.classList.toggle("is-error", error);
  }

  async function api(path, options = {}) {
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    if (state.csrf && !["GET", "HEAD"].includes(options.method || "GET")) headers["X-CSRF-Token"] = state.csrf;
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options, headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || "Request failed.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function showAccess() {
    accessView.hidden = false;
    workspace.hidden = true;
    accountButton.hidden = true;
  }

  function showWorkspace() {
    accessView.hidden = true;
    workspace.hidden = false;
    accountButton.hidden = false;
    accountButton.textContent = state.session?.display_name || "Account";
  }

  function previewLoad() {
    const saved = JSON.parse(localStorage.getItem(previewKey) || "null");
    state.session = { slot_key: "editor-1", role: "editor", display_name: "Editor 1" };
    state.buckets = saved?.buckets || previewBuckets;
    state.conversations = saved?.conversations || previewConversations;
    showWorkspace();
    renderBoard();
  }

  function previewSave() {
    localStorage.setItem(previewKey, JSON.stringify({ buckets: state.buckets, conversations: state.conversations }));
  }

  async function loadWorkspace() {
    if (localPreview) return previewLoad();
    const [bucketPayload, conversationPayload] = await Promise.all([
      api("/api/evaluation/buckets"),
      api("/api/evaluation/conversations?limit=100"),
    ]);
    state.buckets = bucketPayload.buckets || [];
    state.conversations = conversationPayload.conversations || [];
    showWorkspace();
    renderBoard();
  }

  function bucketColumns() {
    return [
      { id: null, label: "Unsorted", color_key: "blue" },
      ...state.buckets.filter(item => !item.archived_at),
    ];
  }

  function filteredConversations() {
    const query = search.value.trim().toLowerCase();
    return state.conversations.filter(item => {
      if (!query) return true;
      return `${shortId(item.id)} ${item.page_title || ""}`.toLowerCase().includes(query);
    });
  }

  function moveOptions(conversation) {
    const options = bucketColumns().map(bucket => {
      const value = bucket.id || "";
      const selected = (conversation.bucket_id || "") === value ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(bucket.label)}</option>`;
    }).join("");
    return `<select class="card-move" aria-label="Move ${shortId(conversation.id)} to bucket">${options}</select>`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
  }

  function cardHtml(conversation) {
    const selected = state.selectedId === conversation.id;
    return `
      <article class="conversation-card${selected ? " is-selected" : ""}" draggable="true" data-conversation-id="${escapeHtml(conversation.id)}" tabindex="0" aria-label="${shortId(conversation.id)}, ${escapeHtml(conversation.page_title || "Unknown page")}">
        <span class="drag-handle" aria-hidden="true">⠿</span>
        <p class="conversation-id">${shortId(conversation.id)}</p>
        <p class="conversation-page">${escapeHtml(conversation.page_title || "Unknown page")}</p>
        ${selected ? `<div class="card-actions"><button class="open-transcript" type="button">Open transcript</button>${moveOptions(conversation)}</div>` : moveOptions(conversation)}
      </article>`;
  }

  function renderBoard() {
    const conversations = filteredConversations();
    emptyState.hidden = conversations.length > 0;
    board.innerHTML = bucketColumns().map(bucket => {
      const items = conversations.filter(item => (item.bucket_id || null) === bucket.id);
      return `
        <section class="bucket" data-bucket-id="${escapeHtml(bucket.id || "")}" data-color="${escapeHtml(bucket.color_key || "blue")}" aria-labelledby="bucket-${escapeHtml(bucket.id || "unsorted")}">
          <header class="bucket-header">
            <h2 id="bucket-${escapeHtml(bucket.id || "unsorted")}">${escapeHtml(bucket.label)}</h2>
            <span class="bucket-count" aria-label="${items.length} conversations">${items.length}</span>
          </header>
          <div class="bucket-cards">${items.map(cardHtml).join("")}</div>
        </section>`;
    }).join("");
    bindBoardEvents();
  }

  function bindBoardEvents() {
    board.querySelectorAll(".conversation-card").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("button, select")) return;
        state.selectedId = card.dataset.conversationId;
        renderBoard();
      });
      card.addEventListener("keydown", event => {
        if ((event.key === "Enter" || event.key === " ") && !event.target.closest("button, select")) {
          event.preventDefault();
          state.selectedId = card.dataset.conversationId;
          renderBoard();
          board.querySelector(`[data-conversation-id="${CSS.escape(state.selectedId)}"]`)?.focus();
        }
      });
      card.addEventListener("dragstart", event => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", card.dataset.conversationId);
      });
      card.querySelector(".open-transcript")?.addEventListener("click", () => openTranscript(card.dataset.conversationId));
      card.querySelector(".card-move")?.addEventListener("change", event => moveConversation(card.dataset.conversationId, event.target.value || null));
    });

    board.querySelectorAll(".bucket").forEach(bucket => {
      bucket.addEventListener("dragover", event => { event.preventDefault(); bucket.classList.add("is-drop-target"); });
      bucket.addEventListener("dragleave", () => bucket.classList.remove("is-drop-target"));
      bucket.addEventListener("drop", event => {
        event.preventDefault();
        bucket.classList.remove("is-drop-target");
        moveConversation(event.dataTransfer.getData("text/plain"), bucket.dataset.bucketId || null);
      });
    });
  }

  async function moveConversation(conversationId, bucketId) {
    const conversation = state.conversations.find(item => item.id === conversationId);
    if (!conversation || (conversation.bucket_id || null) === bucketId) return;
    const previous = conversation.bucket_id || null;
    conversation.bucket_id = bucketId;
    renderBoard();
    try {
      if (localPreview) {
        previewSave();
      } else {
        const payload = await api(`/api/evaluation/conversations/${encodeURIComponent(conversationId)}/placement`, {
          method: "PUT",
          body: JSON.stringify({
            bucket_id: bucketId,
            expected_version: Number(conversation.evaluation_version || 0),
            expected_transcript_version: Number(conversation.transcript_version || 0),
            operation_id: crypto.randomUUID(),
          }),
        });
        Object.assign(conversation, payload.evaluation || {});
      }
      const label = bucketColumns().find(bucket => bucket.id === bucketId)?.label || "Unsorted";
      moveStatus.textContent = `${shortId(conversationId)} moved to ${label}.`;
    } catch (error) {
      conversation.bucket_id = previous;
      renderBoard();
      moveStatus.textContent = `Move failed. ${error.message}`;
    }
  }

  async function openTranscript(conversationId) {
    const conversation = state.conversations.find(item => item.id === conversationId);
    let detail;
    if (localPreview) {
      detail = {
        ...conversation,
        messages: [
          { role: "user", content: "Where can I find the current information on this page?" },
          { role: "assistant", content: "I found the relevant public page and can point you to it." },
        ],
      };
    } else {
      detail = (await api(`/api/evaluation/conversations/${encodeURIComponent(conversationId)}`)).conversation;
    }
    transcriptTitle.textContent = shortId(detail.id);
    transcriptMeta.textContent = detail.page_title || "Conversation";
    transcript.innerHTML = (detail.messages || []).map(message => `
      <article class="message ${message.role === "assistant" ? "assistant" : "user"}">
        <p class="message-role">${message.role === "assistant" ? "Digital Equity guide" : "Visitor"}</p>
        <p class="message-content">${escapeHtml(message.content)}</p>
      </article>`).join("");
    transcriptDialog.showModal();
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    setStatus("Signing in…");
    const form = new FormData(loginForm);
    try {
      const payload = await api("/api/evaluation/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      state.session = payload.account;
      state.csrf = payload.csrf_token;
      loginForm.reset();
      await loadWorkspace();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  claimForm.addEventListener("submit", async event => {
    event.preventDefault();
    const invitationToken = new URLSearchParams(location.hash.slice(1)).get("invite") || "";
    const form = new FormData(claimForm);
    setStatus("Creating account…");
    try {
      const payload = await api("/api/evaluation/invitations/claim", {
        method: "POST",
        body: JSON.stringify({
          token: invitationToken,
          display_name: form.get("display_name"),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      state.session = payload.account;
      state.csrf = payload.csrf_token;
      await loadWorkspace();
    } catch (error) {
      setStatus(error.message, true);
    }
  });

  claimCancel.addEventListener("click", () => {
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    claimForm.hidden = true;
    loginForm.hidden = false;
    setStatus("");
  });

  search.addEventListener("input", renderBoard);
  newBucketButton.addEventListener("click", () => bucketDialog.showModal());
  bucketClose.addEventListener("click", () => bucketDialog.close());
  transcriptClose.addEventListener("click", () => transcriptDialog.close());
  accountButton.addEventListener("click", async () => {
    accountName.textContent = `${state.session?.display_name || "Account"} · ${state.session?.role || "editor"}`;
    accountSlots.hidden = true;
    if (!localPreview && state.session?.role === "admin") {
      try {
        const payload = await api("/api/evaluation/admin/accounts");
        accountSlots.innerHTML = `<ul class="slot-list">${payload.accounts.map(account => `<li><span>${escapeHtml(account.slot_key)}</span><strong>${account.claimed ? "Assigned" : "Unassigned"}</strong></li>`).join("")}</ul>`;
        accountSlots.hidden = false;
      } catch (_error) {}
    }
    accountDialog.showModal();
  });
  accountClose.addEventListener("click", () => accountDialog.close());

  bucketForm.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(bucketForm);
    try {
      let bucket;
      if (localPreview) {
        bucket = { id: crypto.randomUUID(), label: form.get("label"), color_key: form.get("color_key"), standard_key: null };
        state.buckets.push(bucket);
        previewSave();
      } else {
        bucket = (await api("/api/evaluation/buckets", {
          method: "POST",
          body: JSON.stringify({ label: form.get("label"), color_key: form.get("color_key"), operation_id: crypto.randomUUID() }),
        })).bucket;
        state.buckets.push(bucket);
      }
      bucketForm.reset();
      bucketDialog.close();
      renderBoard();
    } catch (error) {
      moveStatus.textContent = `Bucket could not be created. ${error.message}`;
    }
  });

  logoutButton.addEventListener("click", async () => {
    if (!localPreview) {
      try { await api("/api/evaluation/auth/logout", { method: "POST", body: "{}" }); } catch (_error) {}
    }
    state.session = null;
    state.csrf = "";
    accountDialog.close();
    showAccess();
  });

  async function start() {
    if (localPreview) return previewLoad();
    const invitationToken = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (invitationToken) {
      loginForm.hidden = true;
      claimForm.hidden = false;
      document.querySelector("#access-title").textContent = "Claim evaluation account";
    }
    try {
      const payload = await api("/api/evaluation/session");
      state.session = payload.account;
      state.csrf = payload.csrf_token;
      await loadWorkspace();
    } catch (_error) {
      showAccess();
      try {
        const status = await api("/api/evaluation/status");
        if (!invitationToken && status.claimed_slots === 0) setStatus("Invitations are not assigned yet.");
      } catch (_statusError) {
        setStatus("Evaluation access is not available.");
      }
    }
  }

  start();
})();
