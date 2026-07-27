(() => {
  "use strict";

  const status = document.getElementById("connection-status");
  const webchat = document.getElementById("webchat");
  const fallback = document.getElementById("fallback");
  const bootstrapMeta = document.querySelector('meta[name="widget-bootstrap"]');
  const bootstrap = bootstrapMeta?.content || "";

  if (bootstrapMeta) {
    bootstrapMeta.content = "";
  }

  function showFailure(message) {
    status.textContent = message;
    status.hidden = false;
    webchat.hidden = true;
    fallback.hidden = false;
  }

  function appendMockMessage(transcript, kind, text) {
    const message = document.createElement("div");
    message.className = `mock-message ${kind}`;
    message.textContent = text;
    transcript.append(message);
    transcript.scrollTop = transcript.scrollHeight;
  }

  function renderMock() {
    status.textContent = "Local preview";
    webchat.replaceChildren();

    const shell = document.createElement("div");
    shell.className = "mock-chat";

    const transcript = document.createElement("div");
    transcript.className = "mock-transcript";
    transcript.setAttribute("role", "log");
    transcript.setAttribute("aria-live", "polite");

    const form = document.createElement("form");
    form.className = "mock-form";

    const input = document.createElement("input");
    input.type = "text";
    input.name = "message";
    input.autocomplete = "off";
    input.placeholder = "Ask about public programs or events";
    input.setAttribute("aria-label", "Message");

    const button = document.createElement("button");
    button.type = "submit";
    button.title = "Send";
    button.setAttribute("aria-label", "Send message");
    button.innerHTML = [
      '<svg viewBox="0 0 24 24" aria-hidden="true">',
      '<path d="M4 12 20 4l-5 16-3.4-6.2L4 12Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
      '<path d="m11.6 13.8 3.2-3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
      "</svg>"
    ].join("");

    appendMockMessage(
      transcript,
      "bot",
      "Hello. I can help you find public information about programs, events, and ways to connect."
    );

    form.addEventListener("submit", event => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        return;
      }
      appendMockMessage(transcript, "user", text);
      input.value = "";
      appendMockMessage(
        transcript,
        "bot",
        "This is the local safety preview. A published widget would answer from the approved Copilot Studio source set and include a human contact route."
      );
    });

    form.append(input, button);
    shell.append(transcript, form);
    webchat.append(shell);
  }

  function renderWebChat(session) {
    if (!window.WebChat) {
      showFailure("The chat interface could not be loaded.");
      return;
    }

    const directLine = window.WebChat.createDirectLine({
      token: session.token,
      domain: session.domain
    });

    directLine.connectionStatus$.subscribe(connectionStatus => {
      if (connectionStatus === 2) {
        status.hidden = true;
      } else if (connectionStatus === 3) {
        showFailure("The conversation expired. Reload to start again.");
      } else if (connectionStatus === 4 || connectionStatus === 5) {
        showFailure("The information guide lost its connection.");
      }
    });

    window.WebChat.renderWebChat(
      {
        directLine,
        userID: session.userId,
        username: "Site visitor",
        locale: "en-US",
        styleOptions: {
          accent: "#006f7c",
          backgroundColor: "#ffffff",
          bubbleBackground: "#f3f6f7",
          bubbleBorderColor: "#d9dddf",
          bubbleBorderRadius: 7,
          bubbleFromUserBackground: "#006f7c",
          bubbleFromUserBorderColor: "#006f7c",
          bubbleFromUserBorderRadius: 7,
          bubbleFromUserTextColor: "#ffffff",
          bubbleTextColor: "#171717",
          botAvatarBackgroundColor: "#006f7c",
          botAvatarInitials: "FS",
          hideUploadButton: true,
          rootHeight: "100%",
          rootWidth: "100%",
          sendBoxBackground: "#ffffff",
          sendBoxButtonColor: "#006f7c",
          sendBoxTextColor: "#171717",
          suggestedActionBorderRadius: 6,
          suggestedActionTextColor: "#00525c",
          userAvatarBackgroundColor: "#343a3d",
          userAvatarInitials: "You"
        }
      },
      webchat
    );
  }

  async function start() {
    if (!bootstrap) {
      showFailure("The widget session could not be started.");
      return;
    }

    try {
      const response = await fetch("/api/direct-line/token", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Widget-Bootstrap": bootstrap
        },
        body: "{}"
      });

      if (!response.ok) {
        throw new Error(`Token request failed with ${response.status}`);
      }

      const session = await response.json();
      if (session.mock) {
        renderMock();
      } else {
        renderWebChat(session);
      }
    } catch {
      showFailure("The information guide is unavailable right now.");
    }
  }

  start();
})();
