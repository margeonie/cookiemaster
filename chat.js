(function () {
  const icon = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
    video: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3z"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h3l2 5-2.2 1.5a15 15 0 0 0 4.7 4.7L16 12l5 2v3c0 1.1-.9 2-2 2C10.7 19 5 13.3 5 6c0-1.7.9-3 2-3Z"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    sticker: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7"/><path d="M20 13h-5a2 2 0 0 0-2 2v5M20 13l-7 7"/></svg>',
    camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9l-5 4V9a4 4 0 0 0-2-4Z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8"/></svg>',
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>'
  };

  function createGameChat(container, options) {
    if (!container) {
      throw new Error("createGameChat benötigt ein Chat-Element.");
    }

    const config = options || {};
    const data = config.data || {};
    const onLinkClick = config.onLinkClick || function () {};
    const messages = [];
    let messageCounter = 0;
    let typingTimer;
    let resolveTyping;
    let clockTimer;

    container.className = "game-chat";
    container.innerHTML = `
      <div class="chat-statusbar" aria-label="Gerätestatus">
        <strong class="chat-device-time"></strong>
        <div class="chat-status-icons">
          <svg class="chat-signal" viewBox="0 0 20 16" aria-hidden="true"><path d="M1 15h3V11H1zm5 0h3V8H6zm5 0h3V5h-3zm5 0h3V1h-3z"/></svg>
          <span class="chat-network"></span>
          <svg class="chat-battery" viewBox="0 0 40 20" role="img"><rect x="1" y="2" width="33" height="16" rx="4"/><path d="M36 7v6"/><text x="17" y="13" text-anchor="middle"></text></svg>
        </div>
      </div>
      <header class="chat-header">
        <button class="chat-back chat-pill" type="button" aria-label="Zurück">
          ${icon.back}<span class="chat-unread"></span>
        </button>
        <div class="chat-contact">
          <span class="chat-avatar"></span>
          <strong class="chat-contact-name"></strong>
        </div>
        <div class="chat-actions chat-pill">
          <button type="button" class="chat-icon-button chat-video" aria-label="Videoanruf">${icon.video}</button>
          <span class="chat-action-divider"></span>
          <button type="button" class="chat-icon-button chat-phone" aria-label="Anrufen">${icon.phone}</button>
        </div>
      </header>
      <div class="chat-messages" role="log" aria-live="polite" aria-relevant="additions"></div>
      <div class="chat-replies" hidden></div>
      <form class="chat-composer">
        <button class="chat-icon-button chat-plus" type="button" aria-label="Anhang">${icon.plus}</button>
        <label class="chat-input-wrap">
          <span class="visually-hidden">Nachricht eingeben</span>
          <input class="chat-input" type="text" autocomplete="off" placeholder="Nachricht" />
          <button class="chat-icon-button chat-sticker" type="button" aria-label="Sticker">${icon.sticker}</button>
        </label>
        <button class="chat-icon-button chat-camera" type="button" aria-label="Kamera">${icon.camera}</button>
        <button class="chat-send" type="submit" aria-label="Sprachnachricht">${icon.mic}</button>
      </form>
    `;

    const messageList = container.querySelector(".chat-messages");
    const input = container.querySelector(".chat-input");
    const sendButton = container.querySelector(".chat-send");
    const replyContainer = container.querySelector(".chat-replies");

    const deviceTime = container.querySelector(".chat-device-time");
    function updateDeviceTime() {
      const now = new Date();
      deviceTime.textContent = new Intl.DateTimeFormat("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(now);
      clockTimer = window.setTimeout(
        updateDeviceTime,
        Math.max(1000, 60000 - now.getSeconds() * 1000 - now.getMilliseconds())
      );
    }
    updateDeviceTime();
    container.querySelector(".chat-network").textContent = data.statusBar?.network || "";
    container.querySelector(".chat-battery text").textContent =
      `${Number.isFinite(data.statusBar?.battery) ? data.statusBar.battery : ""}%`;
    container.querySelector(".chat-unread").textContent = String(data.contact?.unreadCount ?? 0);
    container.querySelector(".chat-contact-name").textContent = data.contact?.name || "";

    const avatar = container.querySelector(".chat-avatar");
    if (data.contact?.avatar) {
      const image = document.createElement("img");
      image.src = data.contact.avatar;
      image.alt = "";
      image.addEventListener("error", () => {
        image.remove();
        avatar.textContent = getInitials(data.contact?.name);
      }, { once: true });
      avatar.append(image);
    } else {
      avatar.textContent = getInitials(data.contact?.name);
    }

    function getInitials(name) {
      return String(name || "").trim().slice(0, 1).toLocaleUpperCase("de") || "?";
    }

    function addMessage(message, animate) {
      if (!message || typeof message.type !== "string") {
        throw new TypeError("Eine Nachricht benötigt einen Nachrichtentyp.");
      }

      const item = { ...message, id: message.id || `message-${++messageCounter}` };
      messages.push(item);

      if (item.type === "date") {
        const chip = document.createElement("div");
        chip.className = "chat-date-chip chat-appear";
        chip.textContent = item.text || "";
        messageList.append(chip);
      } else if (item.type === "system" || item.type === "system-encryption") {
        const notice = document.createElement("div");
        notice.className = `chat-system-note ${item.type === "system-encryption" ? "chat-encryption-note" : ""} chat-appear`;
        if (item.type === "system-encryption") {
          const lock = document.createElement("span");
          lock.className = "chat-lock-icon";
          lock.innerHTML = icon.lock;
          notice.append(lock, document.createTextNode(`${item.text || ""} `));
          if (item.linkText) {
            const more = document.createElement("strong");
            more.textContent = item.linkText;
            notice.append(more);
          }
        } else {
          notice.textContent = item.text || "";
        }
        messageList.append(notice);
      } else if (item.type === "incoming" || item.type === "outgoing") {
        const previous = messages[messages.length - 2];
        const grouped = previous?.type === item.type &&
          (previous.sender || "") === (item.sender || "");
        const row = document.createElement("article");
        row.className = `chat-message-row ${item.type === "outgoing" ? "is-outgoing" : "is-incoming"}${grouped ? " is-grouped" : ""}${animate ? " chat-appear" : ""}`;
        row.dataset.messageId = item.id;

        const bubble = document.createElement("div");
        bubble.className = "chat-bubble";
        if (item.sender && !grouped) {
          const sender = document.createElement("div");
          sender.className = "chat-message-sender";
          sender.textContent = item.sender;
          bubble.append(sender);
        }
        const body = document.createElement("div");
        body.className = "chat-message-text";
        appendLinkedText(body, String(item.text || ""), item.id);
        bubble.append(body);

        const meta = document.createElement("div");
        meta.className = "chat-message-meta";
        const time = document.createElement("time");
        time.textContent = item.time || "";
        meta.append(time);
        if (item.type === "outgoing") {
          const status = document.createElement("span");
          status.className = `chat-receipt receipt-${["sent", "delivered", "read"].includes(item.status) ? item.status : "sent"}`;
          status.setAttribute("aria-label", `Nachricht ${item.status || "sent"}`);
          status.innerHTML = item.status === "delivered" || item.status === "read"
            ? '<svg viewBox="0 0 22 16" aria-hidden="true"><path d="m1 8 4 4L15 2M8 8l4 4L22 2"/></svg>'
            : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m2 8 4 4L14 3"/></svg>';
          meta.append(status);
        }
        bubble.append(meta);
        row.append(bubble);
        messageList.append(row);
      } else {
        messages.pop();
        throw new TypeError(`Unbekannter Nachrichtentyp: ${item.type}`);
      }
      scrollToLatest();
      return item;
    }

    function appendLinkedText(element, text, messageId) {
      const urlPattern = /https?:\/\/[^\s<]+|www\.[^\s<]+/gi;
      let cursor = 0;
      let match;
      while ((match = urlPattern.exec(text)) !== null) {
        element.append(document.createTextNode(text.slice(cursor, match.index)));
        const url = match[0];
        const linkButton = document.createElement("button");
        linkButton.type = "button";
        linkButton.className = "chat-text-link";
        linkButton.textContent = url;
        linkButton.addEventListener("click", () => onLinkClick(url, messageId));
        element.append(linkButton);
        cursor = match.index + match[0].length;
      }
      element.append(document.createTextNode(text.slice(cursor)));
    }

    function scrollToLatest() {
      messageList.scrollTop = messageList.scrollHeight;
    }

    function showTyping(durationMs) {
      clearTimeout(typingTimer);
      if (resolveTyping) resolveTyping();
      const existing = messageList.querySelector(".chat-typing");
      if (existing) existing.remove();
      const typing = document.createElement("div");
      typing.className = "chat-message-row is-incoming chat-typing chat-appear";
      typing.setAttribute("aria-label", "Kontakt schreibt");
      typing.innerHTML = '<div class="chat-bubble"><span></span><span></span><span></span></div>';
      messageList.append(typing);
      scrollToLatest();

      return new Promise((resolve) => {
        resolveTyping = resolve;
        typingTimer = window.setTimeout(() => {
          typing.remove();
          typingTimer = undefined;
          resolveTyping = undefined;
          resolve();
        }, Math.max(0, durationMs || 0));
      });
    }

    async function playScript(script, delayMs) {
      for (const message of script) {
        if (message.type === "incoming" && config.typingDurationMs > 0) {
          await showTyping(config.typingDurationMs);
        }
        await new Promise((resolve) => window.setTimeout(resolve, Math.max(0, delayMs || 0)));
        addMessage(message, true);
      }
    }

    function setReplyOptions(optionsList) {
      replyContainer.replaceChildren();
      replyContainer.hidden = !optionsList?.length;
      (optionsList || []).forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-reply-option";
        button.textContent = typeof option === "string" ? option : option.label;
        button.addEventListener("click", () => {
          const selected = typeof option === "string" ? option : option.value;
          if (typeof config.onReplySelected === "function") config.onReplySelected(selected);
        });
        replyContainer.append(button);
      });
    }

    container.querySelector(".chat-composer").addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) {
        if (typeof config.onVoiceClick === "function") config.onVoiceClick();
        return;
      }
      const message = {
        type: "outgoing",
        text,
        time: new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
        status: "sent"
      };
      addMessage(message, true);
      input.value = "";
      updateSendButton();
      if (typeof config.onMessageSent === "function") config.onMessageSent(message);
    });

    function updateSendButton() {
      const hasText = input.value.trim().length > 0;
      sendButton.innerHTML = hasText ? icon.send : icon.mic;
      sendButton.setAttribute("aria-label", hasText ? "Nachricht senden" : "Sprachnachricht");
    }

    input.addEventListener("input", updateSendButton);
    container.querySelector(".chat-back").addEventListener("click", () => config.onBack?.());
    container.querySelector(".chat-video").addEventListener("click", () => config.onVideoClick?.());
    container.querySelector(".chat-phone").addEventListener("click", () => config.onCallClick?.());
    container.querySelector(".chat-plus").addEventListener("click", () => config.onAttachmentClick?.());
    container.querySelector(".chat-camera").addEventListener("click", () => config.onCameraClick?.());
    container.querySelector(".chat-sticker").addEventListener("click", () => config.onStickerClick?.());

    (data.messages || []).forEach((message) => addMessage(message, false));
    setReplyOptions(config.replyOptions);

    return {
      addMessage,
      playScript,
      showTyping,
      setReplyOptions,
      scrollToLatest,
      getMessages: () => [...messages],
      destroy() {
        window.clearTimeout(clockTimer);
        window.clearTimeout(typingTimer);
        if (resolveTyping) resolveTyping();
      }
    };
  }

  window.createGameChat = createGameChat;
})();
