/**
 * Portable Wix embedded-script example.
 *
 * This browser component receives a public backend URL. It never receives an
 * Ollama key. Copy it into the generated Wix extension as
 * `fortune-guide-element.js`, then adjust labels and styling with Fortune.
 */
(() => {
  const TAG_NAME = "fortune-digital-equity-guide";
  if (customElements.get(TAG_NAME)) return;

  const isSafeLink = (value) => {
    if (typeof value !== "string" || !value.trim()) return false;
    try {
      const url = new URL(value, window.location.href);
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  };

  class FortuneDigitalEquityGuide extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;

      this.history = [];
      this.warmupPromise = null;
      const root = this.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          :host {
            --guide-blue: #1669a8;
            --guide-blue-dark: #0d4f7d;
            --guide-blue-soft: #edf6fb;
            --guide-ink: #241a2d;
            --guide-muted: #4b5c6c;
            font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
            position: fixed;
            inset: auto 18px 18px auto;
            z-index: 2147483000;
          }
          *, *::before, *::after { box-sizing: border-box; }
          button, input { font: inherit; }
          :focus-visible { outline: 3px solid #f2b705; outline-offset: 3px; }
          .toggle {
            min-width: 56px;
            min-height: 48px;
            padding: 0 16px;
            border: 1px solid #a8b7c2;
            border-radius: 999px;
            background: #fff;
            color: var(--guide-ink);
            font-size: 16px;
            font-weight: 750;
            box-shadow: 0 4px 16px rgba(23, 39, 52, .16);
            cursor: pointer;
            transition: border-color .14s ease, box-shadow .14s ease, transform .14s ease;
          }
          .toggle:hover { border-color: var(--guide-blue); box-shadow: 0 7px 22px rgba(23, 39, 52, .2); transform: translateY(-1px); }
          .panel {
            width: min(440px, calc(100vw - 24px));
            max-height: min(520px, calc(100dvh - 24px));
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border: 1px solid #a6b4be;
            border-top: 4px solid var(--guide-blue);
            border-radius: 12px;
            background: #fff;
            color: var(--guide-ink);
            box-shadow: 0 22px 54px rgba(25, 20, 36, .22);
            contain: layout paint;
            transition: height .16s ease, max-height .16s ease;
          }
          .panel.expanded { height: min(760px, calc(100dvh - 24px)); max-height: calc(100dvh - 24px); }
          .panel[hidden] { display: none; }
          .head {
            display: flex;
            align-items: start;
            justify-content: space-between;
            gap: 16px;
            padding: 14px 18px 13px;
            border-bottom: 1px solid #d5dde4;
            background: linear-gradient(180deg, #fbfdfe, #f7fafb);
          }
          .eyebrow {
            margin: 0 0 3px;
            color: var(--guide-blue);
            font-size: 13px;
            font-weight: 800;
            letter-spacing: .1em;
            text-transform: uppercase;
          }
          h2 { margin: 0; font-size: 22px; letter-spacing: -.015em; line-height: 1.2; }
          .close, .again {
            min-height: 40px;
            padding: 7px 10px;
            border: 1px solid transparent;
            border-radius: 5px;
            background: transparent;
            color: var(--guide-muted);
            font-weight: 700;
            cursor: pointer;
          }
          .close:hover, .again:hover { border-color: #d5dde4; color: var(--guide-blue-dark); background: #fff; }
          .body { min-height: 0; overflow: auto; padding: 14px 18px 18px; overscroll-behavior: contain; scrollbar-gutter: stable; }
          label { display: block; margin-bottom: 8px; font-size: 16px; font-weight: 750; }
          .row { display: flex; gap: 8px; }
          input {
            min-width: 0;
            flex: 1;
            min-height: 48px;
            border: 1px solid #73889a;
            border-radius: 5px;
            padding: 10px 12px;
            font-size: 16px;
          }
          input:hover { border-color: #4f697c; }
          input:focus { border-color: var(--guide-blue); }
          .send, .choice {
            min-height: 48px;
            border: 1px solid var(--guide-blue-dark);
            border-radius: 5px;
            background: var(--guide-blue-dark);
            color: #fff;
            padding: 10px 14px;
            font-weight: 700;
            cursor: pointer;
            transition: background .14s ease, transform .14s ease;
          }
          .send:hover, .choice:hover { background: #083e63; transform: translateY(-1px); }
          .send:disabled { opacity: .65; cursor: wait; }
          .status { min-height: 22px; margin: 9px 0 0; color: var(--guide-muted); font-size: 14px; line-height: 1.4; }
          .result { margin-top: 14px; border-top: 1px solid #d5dde4; padding-top: 14px; }
          .answer { margin: 0; color: #2f4351; font-size: 16px; line-height: 1.52; white-space: pre-wrap; }
          h3 { margin: 16px 0 7px; font-size: 16px; }
          ul { margin: 0; padding-left: 22px; }
          li + li { margin-top: 8px; }
          a { color: var(--guide-blue-dark); text-underline-offset: 3px; }
          .choices { display: grid; gap: 8px; margin-top: 12px; }
          .choice { width: 100%; border-color: #c4d7e2; color: var(--guide-blue-dark); background: var(--guide-blue-soft); text-align: left; }
          .choice:hover { color: #fff; }
          .footer-actions { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 18px; }
          @media (max-width: 520px) {
            :host { inset: auto 8px 8px 8px; }
            .panel { width: 100%; max-height: calc(100dvh - 16px); }
            .panel.expanded { height: calc(100dvh - 16px); max-height: calc(100dvh - 16px); }
            .row { flex-direction: column; }
          }
          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              scroll-behavior: auto !important;
              transition-duration: .01ms !important;
              animation-duration: .01ms !important;
            }
          }
        </style>
        <button class="toggle" type="button" aria-expanded="false">Help</button>
        <section class="panel" aria-label="Digital Equity guide" hidden>
          <header class="head">
            <div>
              <p class="eyebrow">Digital Equity</p>
              <h2>Ask the live guide</h2>
            </div>
            <button class="close" type="button">Close</button>
          </header>
          <div class="body">
            <form>
              <label for="fortune-guide-question">What would you like help finding?</label>
              <div class="row">
                <input id="fortune-guide-question" name="question" autocomplete="off" />
                <button class="send" type="submit">Ask</button>
              </div>
              <p class="status" role="status" aria-live="polite"></p>
            </form>
            <div class="result" aria-live="polite" hidden></div>
          </div>
        </section>
      `;

      this.toggleButton = root.querySelector(".toggle");
      this.panel = root.querySelector(".panel");
      this.body = root.querySelector(".body");
      this.closeButton = root.querySelector(".close");
      this.form = root.querySelector("form");
      this.input = root.querySelector("input");
      this.sendButton = root.querySelector(".send");
      this.status = root.querySelector(".status");
      this.result = root.querySelector(".result");

      this.toggleButton.addEventListener("click", () => this.open());
      this.closeButton.addEventListener("click", () => this.close());
      this.form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.ask(this.input.value.trim());
      });
      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") this.close();
      });
      this.warmModel();
    }

    open() {
      this.panel.hidden = false;
      this.toggleButton.hidden = true;
      this.toggleButton.setAttribute("aria-expanded", "true");
      this.warmModel();
      // Deliberately avoid autofocus. Some mobile browsers zoom focused inputs.
    }

    close() {
      this.panel.hidden = true;
      this.toggleButton.hidden = false;
      this.toggleButton.setAttribute("aria-expanded", "false");
      this.toggleButton.focus({ preventScroll: true });
    }

    apiUrl(path) {
      const base = this.getAttribute("api-base-url");
      if (!base) throw new Error("The guide backend has not been configured.");
      return new URL(path.replace(/^\//, ""), `${base.replace(/\/$/, "")}/`).toString();
    }

    pageContext() {
      return {
        url: window.location.href,
        path: window.location.pathname,
        title: document.title
      };
    }

    async ask(question) {
      if (!question) {
        this.status.textContent = "Enter a question first.";
        return;
      }

      this.sendButton.disabled = true;
      this.panel.classList.add("expanded");
      this.status.textContent = "Checking Fortune's approved pages…";
      this.result.hidden = true;

      try {
        if (this.warmupPromise) await this.warmupPromise;
        const response = await fetch(this.apiUrl("/api/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: question,
            history: this.history,
            page_context: this.pageContext()
          })
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "The guide is unavailable.");
        if (payload.kind === "privacy") {
          this.history = [];
        } else {
          this.history.push(
            { role: "user", content: question },
            { role: "assistant", content: String(payload.message || "") }
          );
          this.history = this.history.slice(-6);
        }
        this.render(payload);
        this.revealResult();
        this.status.textContent = payload.model_called
          ? `Answer ready from ${payload.model || "the live model"}.`
          : "Showing approved source navigation without a model call.";
      } catch (error) {
        this.renderError(error instanceof Error ? error.message : "The guide is unavailable.");
        this.status.textContent = "The live guide could not answer right now.";
      } finally {
        this.sendButton.disabled = false;
      }
    }

    revealResult() {
      requestAnimationFrame(() => {
        const resultRect = this.result.getBoundingClientRect();
        const bodyRect = this.body.getBoundingClientRect();
        const top = this.body.scrollTop + resultRect.top - bodyRect.top;
        this.body.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" });
      });
    }

    warmModel() {
      if (this.warmupPromise) return this.warmupPromise;
      this.warmupPromise = fetch(this.apiUrl("/api/warmup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      })
        .then((response) => {
          if (!response.ok) throw new Error("Model warm-up failed.");
          return response.json();
        })
        .catch(() => null)
        .finally(() => {
          this.warmupPromise = null;
        });
      return this.warmupPromise;
    }

    addText(tagName, text, className) {
      const element = document.createElement(tagName);
      if (className) element.className = className;
      element.textContent = text;
      this.result.append(element);
      return element;
    }

    addLinks(title, links) {
      const safeLinks = (Array.isArray(links) ? links : []).filter((item) =>
        item && item.title && isSafeLink(item.url)
      );
      if (!safeLinks.length) return false;

      this.addText("h3", title);
      const list = document.createElement("ul");
      safeLinks.forEach((item) => {
        const listItem = document.createElement("li");
        const link = document.createElement("a");
        link.href = item.url;
        link.textContent = item.title;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        listItem.append(link);
        list.append(listItem);
      });
      this.result.append(list);
      return true;
    }

    render(payload) {
      this.result.replaceChildren();
      this.result.hidden = false;
      this.panel.classList.add("expanded");

      if (payload.kind === "clarify") {
        this.addText("p", payload.message || "Which kind of help do you mean?", "answer");
        if (payload.reason) {
          this.addText("h3", "Why this question");
          this.addText("p", payload.reason, "answer");
        }
        const choices = document.createElement("div");
        choices.className = "choices";
        (Array.isArray(payload.choices) ? payload.choices : []).slice(0, 3).forEach((choice) => {
          const label = choice && choice.label;
          const prompt = choice && choice.prompt;
          if (!label) return;
          const button = document.createElement("button");
          button.type = "button";
          button.className = "choice";
          button.textContent = label;
          button.addEventListener("click", () => {
            this.input.value = label;
            this.ask(prompt || label);
          });
          choices.append(button);
        });
        this.result.append(choices);
        this.addLinks("Source", payload.sources);
        const hasRelated = this.addLinks("You can also visit", payload.related);
        if (!hasRelated) {
          this.addLinks("You can also visit", [{
            title: "Digital Equity home",
            url: this.getAttribute("home-url") || "https://www.fortunedigitalequity.org/"
          }]);
        }
        this.addContinuationActions(payload.handoff_url, payload.continuation);
        return;
      }

      this.addText("p", payload.message || "I could not confirm that from an approved page.", "answer");
      if (payload.reason) {
        this.addText("h3", "Why this route");
        this.addText("p", payload.reason, "answer");
      }
      this.addLinks("Source", payload.sources);

      const hasRelated = this.addLinks("Keep going", payload.related);
      if (!hasRelated) {
        this.addLinks("Keep going", [{
          title: "Digital Equity home",
          url: this.getAttribute("home-url") || "https://www.fortunedigitalequity.org/"
        }]);
      }
      this.addContinuationActions(payload.handoff_url, payload.continuation);
    }

    addContinuationActions(handoffUrl, continuation) {
      const actions = document.createElement("div");
      actions.className = "footer-actions";

      const again = document.createElement("button");
      again.type = "button";
      again.className = "again";
      again.textContent = continuation && continuation.available && continuation.label
        ? continuation.label
        : "Ask another question";
      again.addEventListener("click", () => {
        this.input.value = "";
        this.input.focus({ preventScroll: true });
      });
      actions.append(again);

      const safeHandoffUrl = handoffUrl || this.getAttribute("contact-url");
      if (isSafeLink(safeHandoffUrl)) {
        const link = document.createElement("a");
        link.href = safeHandoffUrl;
        link.textContent = "Contact Digital Equity";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        actions.append(link);
      }
      this.result.append(actions);
    }

    renderError(message) {
      this.result.replaceChildren();
      this.result.hidden = false;
      this.panel.classList.add("expanded");
      this.addText("p", message, "answer");
      this.addLinks("Keep going", [{
        title: "Digital Equity home",
        url: this.getAttribute("home-url") || "https://www.fortunedigitalequity.org/"
      }]);
      this.addContinuationActions(this.getAttribute("contact-url"), {
        label: "Ask the live guide",
        available: true
      });
      this.revealResult();
    }
  }

  customElements.define(TAG_NAME, FortuneDigitalEquityGuide);
})();
