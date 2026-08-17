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
  const bucketVisibility = document.querySelector("#bucket-visibility");
  const bucketSort = document.querySelector("#bucket-sort");
  const bucketLayout = document.querySelector("#bucket-layout");
  const newBucketButton = document.querySelector("#new-bucket-button");
  const bucketDialog = document.querySelector("#bucket-dialog");
  const bucketForm = document.querySelector("#bucket-form");
  const bucketClose = document.querySelector("#bucket-close");
  const transcriptDialog = document.querySelector("#transcript-dialog");
  const transcriptClose = document.querySelector("#transcript-close");
  const transcriptTitle = document.querySelector("#transcript-title");
  const transcriptMeta = document.querySelector("#transcript-meta");
  const transcript = document.querySelector("#transcript");
  const reviewNoteForm = document.querySelector("#review-note-form");
  const reviewNote = document.querySelector("#review-note");
  const reviewNoteStatus = document.querySelector("#review-note-status");
  const moveStatus = document.querySelector("#move-status");

  const localPreview = ["127.0.0.1", "localhost"].includes(location.hostname)
    && new URLSearchParams(location.search).get("preview") === "1";
  const previewKey = "fortune-evaluation-preview-v3";
  const viewKeyPrefix = "fortune-evaluation-view-v2";
  const defaultView = { visibility: "all", sort: "default", layout: "compact" };
  const state = {
    session: null,
    csrf: "",
    buckets: [],
    conversations: [],
    selectedId: "",
    openConversation: null,
    view: { ...defaultView },
  };

  const annotationLabels = {
    helpful: "Helpful",
    unclear: "Unclear",
    incorrect: "Incorrect",
    unsafe: "Safety concern",
    other: "Other",
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
    ["5k9l0m", "Theory of Change", 4, "handoff"],
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
    loadViewPreferences();
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
    loadViewPreferences();
    showWorkspace();
    renderBoard();
  }

  function bucketColumns() {
    return [
      { id: null, label: "Not yet reviewed", color_key: "blue" },
      ...state.buckets.filter(item => !item.archived_at),
    ];
  }

  function viewStorageKey() {
    return `${viewKeyPrefix}:${state.session?.slot_key || "preview"}`;
  }

  function loadViewPreferences() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(viewStorageKey()) || "{}"); } catch (_error) {}
    state.view = {
      visibility: ["all", "with-conversations", "empty"].includes(saved.visibility) ? saved.visibility : defaultView.visibility,
      sort: ["default", "name", "count"].includes(saved.sort) ? saved.sort : defaultView.sort,
      layout: ["comfortable", "compact"].includes(saved.layout) ? saved.layout : defaultView.layout,
    };
    bucketVisibility.value = state.view.visibility;
    bucketSort.value = state.view.sort;
    bucketLayout.value = state.view.layout;
  }

  function saveViewPreferences() {
    localStorage.setItem(viewStorageKey(), JSON.stringify(state.view));
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
    const counts = new Map(bucketColumns().map(bucket => [bucket.id, conversations.filter(item => (item.bucket_id || null) === bucket.id).length]));
    let columns = bucketColumns().filter(bucket => {
      if (state.view.visibility === "with-conversations") return counts.get(bucket.id) > 0;
      if (state.view.visibility === "empty") return counts.get(bucket.id) === 0;
      return true;
    });
    if (state.view.sort === "name") columns = [...columns].sort((a, b) => a.label.localeCompare(b.label));
    if (state.view.sort === "count") columns = [...columns].sort((a, b) => counts.get(b.id) - counts.get(a.id));
    board.dataset.layout = state.view.layout;
    board.innerHTML = columns.map(bucket => {
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
        const evaluation = payload.evaluation || {};
        conversation.bucket_id = evaluation.bucket_id || null;
        conversation.evaluation_version = Number(evaluation.version ?? conversation.evaluation_version ?? 0);
        conversation.transcript_version = Number(evaluation.transcript_version ?? conversation.transcript_version ?? 0);
      }
      renderBoard();
      const label = bucketColumns().find(bucket => bucket.id === bucketId)?.label || "Not yet reviewed";
      moveStatus.textContent = `${shortId(conversationId)} moved to ${label}.`;
    } catch (error) {
      const current = error.payload?.current;
      if (error.status === 409 && current) {
        conversation.bucket_id = current.bucket_id || null;
        conversation.evaluation_version = Number(current.version || 0);
        conversation.transcript_version = Number(current.transcript_version || conversation.transcript_version || 0);
      } else {
        conversation.bucket_id = previous;
      }
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
        note: conversation.note || null,
        annotations: conversation.annotations || [],
        messages: [
          { id: `${conversation.id}-user`, role: "user", content: "Where can I find the current information on this page?" },
          { id: `${conversation.id}-assistant`, role: "assistant", content: "I found the relevant public page and can point you to it." },
        ],
      };
    } else {
      detail = (await api(`/api/evaluation/conversations/${encodeURIComponent(conversationId)}`)).conversation;
    }
    state.openConversation = detail;
    transcriptTitle.textContent = shortId(detail.id);
    transcriptMeta.textContent = detail.page_title || "Conversation";
    reviewNote.value = detail.note || "";
    reviewNoteStatus.textContent = "";
    renderTranscriptMessages();
    transcriptDialog.showModal();
  }

  function annotationOptions(selected) {
    return [
      ["", "Choose type"],
      ...Object.entries(annotationLabels),
    ].map(([value, label]) => `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`).join("");
  }

  function annotationFor(messageId) {
    return (state.openConversation?.annotations || []).find(item => item.message_id === messageId) || null;
  }

  function transcriptMessageHtml(message) {
    const annotation = annotationFor(message.id);
    const buttonLabel = annotation
      ? `Annotated: ${annotationLabels[annotation.category] || "Other"}`
      : "Annotate";
    return `
      <article class="message ${message.role === "assistant" ? "assistant" : "user"}" data-message-id="${escapeHtml(message.id)}">
        <p class="message-role">${message.role === "assistant" ? "Website Guide" : "Visitor"}</p>
        <p class="message-content">${escapeHtml(message.content)}</p>
        <button class="annotation-toggle" type="button" aria-expanded="false">${escapeHtml(buttonLabel)}</button>
        <form class="annotation-form" hidden>
          <label>Annotation type
            <select name="category">${annotationOptions(annotation?.category || "")}</select>
          </label>
          <label class="sr-only" for="annotation-${escapeHtml(message.id)}">Annotation note</label>
          <textarea id="annotation-${escapeHtml(message.id)}" name="note" maxlength="500" rows="2" placeholder="Short note (optional)">${escapeHtml(annotation?.note || "")}</textarea>
          <div class="annotation-actions">
            <button class="secondary-button" type="submit">Save annotation</button>
            ${annotation ? '<button class="text-button remove-annotation" type="button">Remove</button>' : ""}
          </div>
        </form>
      </article>`;
  }

  function renderTranscriptMessages() {
    transcript.innerHTML = (state.openConversation?.messages || []).map(transcriptMessageHtml).join("");
    transcript.querySelectorAll(".message").forEach(message => {
      const messageId = message.dataset.messageId;
      const toggle = message.querySelector(".annotation-toggle");
      const form = message.querySelector(".annotation-form");
      toggle.addEventListener("click", () => {
        form.hidden = !form.hidden;
        toggle.setAttribute("aria-expanded", String(!form.hidden));
      });
      form.addEventListener("submit", event => {
        event.preventDefault();
        saveAnnotation(messageId, form, false);
      });
      form.querySelector(".remove-annotation")?.addEventListener("click", () => {
        saveAnnotation(messageId, form, true);
      });
    });
  }

  function updateOpenConversation(evaluation) {
    if (!state.openConversation) return;
    state.openConversation.note = evaluation.note ?? state.openConversation.note ?? null;
    state.openConversation.evaluation_version = Number(evaluation.version ?? state.openConversation.evaluation_version ?? 0);
    state.openConversation.transcript_version = Number(evaluation.transcript_version ?? state.openConversation.transcript_version ?? 0);
    const conversation = state.conversations.find(item => item.id === state.openConversation.id);
    if (conversation) {
      conversation.note = state.openConversation.note;
      conversation.evaluation_version = state.openConversation.evaluation_version;
      conversation.transcript_version = state.openConversation.transcript_version;
    }
  }

  async function saveReviewNote() {
    if (!state.openConversation) return;
    reviewNoteStatus.textContent = "Saving…";
    try {
      let evaluation;
      if (localPreview) {
        evaluation = {
          note: reviewNote.value.trim() || null,
          version: Number(state.openConversation.evaluation_version || 0) + 1,
          transcript_version: Number(state.openConversation.transcript_version || 0),
        };
      } else {
        evaluation = (await api(`/api/evaluation/conversations/${encodeURIComponent(state.openConversation.id)}/note`, {
          method: "PUT",
          body: JSON.stringify({
            note: reviewNote.value,
            expected_version: Number(state.openConversation.evaluation_version || 0),
            expected_transcript_version: Number(state.openConversation.transcript_version || 0),
            operation_id: crypto.randomUUID(),
          }),
        })).evaluation;
      }
      updateOpenConversation(evaluation || {});
      if (localPreview) previewSave();
      reviewNoteStatus.textContent = "Saved";
    } catch (error) {
      if (error.status === 409 && error.payload?.current) {
        updateOpenConversation(error.payload.current);
        reviewNote.value = state.openConversation.note || "";
      }
      reviewNoteStatus.textContent = `Not saved. ${error.message}`;
    }
  }

  async function saveAnnotation(messageId, form, remove) {
    if (!state.openConversation) return;
    const current = annotationFor(messageId);
    const category = remove ? "" : form.elements.category.value;
    const note = remove ? "" : form.elements.note.value;
    reviewNoteStatus.textContent = "Saving annotation…";
    try {
      let annotation;
      if (localPreview) {
        annotation = remove ? null : {
          message_id: messageId,
          category,
          note: note.trim() || null,
          transcript_version: Number(state.openConversation.transcript_version || 0),
          version: Number(current?.version || 0) + 1,
        };
      } else {
        annotation = (await api(`/api/evaluation/conversations/${encodeURIComponent(state.openConversation.id)}/annotations/${encodeURIComponent(messageId)}`, {
          method: "PUT",
          body: JSON.stringify({
            category,
            note,
            expected_version: Number(current?.version || 0),
            expected_transcript_version: Number(state.openConversation.transcript_version || 0),
            operation_id: crypto.randomUUID(),
          }),
        })).annotation;
      }
      state.openConversation.annotations = (state.openConversation.annotations || []).filter(item => item.message_id !== messageId);
      if (annotation) state.openConversation.annotations.push(annotation);
      const conversation = state.conversations.find(item => item.id === state.openConversation.id);
      if (conversation) conversation.annotations = state.openConversation.annotations;
      if (localPreview) previewSave();
      renderTranscriptMessages();
      reviewNoteStatus.textContent = annotation ? "Annotation saved" : "Annotation removed";
    } catch (error) {
      reviewNoteStatus.textContent = `Annotation not saved. ${error.message}`;
    }
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
  bucketVisibility.addEventListener("change", () => {
    state.view.visibility = bucketVisibility.value;
    saveViewPreferences();
    renderBoard();
  });
  bucketSort.addEventListener("change", () => {
    state.view.sort = bucketSort.value;
    saveViewPreferences();
    renderBoard();
  });
  bucketLayout.addEventListener("change", () => {
    state.view.layout = bucketLayout.value;
    saveViewPreferences();
    renderBoard();
  });
  newBucketButton.addEventListener("click", () => bucketDialog.showModal());
  bucketClose.addEventListener("click", () => bucketDialog.close());
  reviewNoteForm.addEventListener("submit", event => {
    event.preventDefault();
    saveReviewNote();
  });
  transcriptClose.addEventListener("click", () => {
    transcriptDialog.close();
    state.openConversation = null;
  });
  accountButton.addEventListener("click", async () => {
    accountName.textContent = `${state.session?.display_name || "Account"} · ${state.session?.role || "editor"}`;
    accountSlots.hidden = true;
    if (!localPreview && state.session?.role === "admin") {
      try {
        const payload = await api("/api/evaluation/admin/accounts");
        accountSlots.innerHTML = `<h3>Tester access</h3><ul class="slot-list">${payload.accounts.map(account => {
          const slot = escapeHtml(account.slot_key);
          const status = account.claimed ? "Assigned" : account.invitation_active ? "Invite active" : "Unassigned";
          const invite = account.claimed ? "" : `
            <form class="invite-form" data-slot="${slot}">
              <label for="invite-${slot}">Tester email</label>
              <div class="invite-row">
                <input id="invite-${slot}" name="email" type="email" autocomplete="off" required>
                <button class="secondary-button" type="submit">${account.invitation_active ? "Replace link" : "Create link"}</button>
              </div>
              <div class="invite-result" hidden>
                <label>Single-use registration link</label>
                <input class="invite-link" readonly>
                <div class="invite-actions">
                  <a class="secondary-button invite-open" target="_blank" rel="noopener">Open registration</a>
                  <button class="text-button invite-copy" type="button">Copy link</button>
                </div>
                <span class="save-status invite-status" role="status"></span>
              </div>
            </form>`;
          return `<li><div class="slot-summary"><span>${slot}</span><strong>${status}</strong></div>${invite}</li>`;
        }).join("")}</ul>`;
        accountSlots.hidden = false;
      } catch (_error) {}
    }
    accountDialog.showModal();
  });
  accountClose.addEventListener("click", () => accountDialog.close());
  accountSlots.addEventListener("submit", async event => {
    const form = event.target.closest(".invite-form");
    if (!form) return;
    event.preventDefault();
    const button = form.querySelector("button[type='submit']");
    const status = form.querySelector(".invite-status");
    button.disabled = true;
    status.textContent = "Creating link…";
    try {
      const payload = await api(`/api/evaluation/admin/accounts/${encodeURIComponent(form.dataset.slot)}/invitation`, {
        method: "POST",
        body: JSON.stringify({
          email: new FormData(form).get("email"),
          operation_id: crypto.randomUUID(),
        }),
      });
      const link = new URL(payload.invitation_path, location.origin).href;
      const result = form.querySelector(".invite-result");
      const input = form.querySelector(".invite-link");
      const open = form.querySelector(".invite-open");
      input.value = link;
      open.href = link;
      result.hidden = false;
      const hours = Math.round(Number(payload.expires_in_seconds || 0) / 3600);
      status.textContent = `Link ready · single use${hours ? ` · ${hours} hours` : ""}`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });
  accountSlots.addEventListener("click", async event => {
    const button = event.target.closest(".invite-copy");
    if (!button) return;
    const form = button.closest(".invite-form");
    const input = form.querySelector(".invite-link");
    const status = form.querySelector(".invite-status");
    try {
      await navigator.clipboard.writeText(input.value);
      status.textContent = "Link copied";
    } catch (_error) {
      input.focus();
      input.select();
      status.textContent = "Link selected";
    }
  });

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
