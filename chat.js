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
    send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
    more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/></svg>',
    updates: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke-dasharray="4 2.5"/><circle cx="12" cy="12" r="4.5"/></svg>',
    communities: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><circle cx="17" cy="9.5" r="2.5"/><path d="M3 19c0-3.3 2.7-5.2 6-5.2s6 1.9 6 5.2M15.5 14.2c3 0 5.5 1.6 5.5 4.8"/></svg>',
    chats: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 1 3.4 6.5L3 20l1.4-4A8 8 0 0 1 4 12Z"/></svg>',
    you: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2.2 3.2-3.3 5.5-3.3s4.3 1.1 5.5 3.3"/></svg>'
  };

  const statusBarHtml = `
    <div class="chat-statusbar" aria-label="Gerätestatus">
      <strong class="chat-device-time"></strong>
      <div class="chat-status-icons">
        <svg class="chat-signal" viewBox="0 0 20 16" aria-hidden="true"><path d="M1 15h3V11H1zm5 0h3V8H6zm5 0h3V5h-3zm5 0h3V1h-3z"/></svg>
        <span class="chat-network"></span>
        <svg class="chat-battery" viewBox="0 0 40 20" role="img"><rect x="1" y="2" width="33" height="16" rx="4"/><path d="M36 7v6"/><text x="17" y="13" text-anchor="middle"></text></svg>
      </div>
    </div>
  `;

  const avatarColors = ["#1f9d6a", "#2f7fc4", "#c97a32", "#8a5cc2", "#c4506d", "#2e9aa6", "#6f8a2a"];

  // Füllt die Statusleiste und startet die Uhr; gibt eine Stop-Funktion zurück.
  function fillStatusBar(container, statusBar) {
    container.querySelector(".chat-network").textContent = statusBar?.network || "";
    container.querySelector(".chat-battery text").textContent =
      `${Number.isFinite(statusBar?.battery) ? statusBar.battery : ""}%`;

    const deviceTime = container.querySelector(".chat-device-time");
    let clockTimer;
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
    return () => window.clearTimeout(clockTimer);
  }

  function getInitials(name) {
    const words = String(name || "").trim().split(/[\s_-]+/).filter(Boolean);
    const initials = words.slice(0, 2).map((word) => word.slice(0, 1)).join("");
    return initials.toLocaleUpperCase("de") || "?";
  }

  function getAvatarColor(name) {
    let hash = 0;
    for (const char of String(name || "")) {
      hash = (hash * 31 + char.codePointAt(0)) % 100000;
    }
    return avatarColors[hash % avatarColors.length];
  }

  // Bild, falls vorhanden – sonst Initialen auf farbigem Kreis
  function fillAvatar(element, name, imageUrl) {
    function showInitials() {
      element.textContent = getInitials(name);
      element.style.background = getAvatarColor(name);
      element.style.color = "#fff";
    }
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = "";
      image.addEventListener("error", () => {
        image.remove();
        showInitials();
      }, { once: true });
      element.append(image);
    } else {
      showInitials();
    }
  }

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

    container.className = "game-chat";
    container.innerHTML = `
      ${statusBarHtml}
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

    const stopClock = fillStatusBar(container, data.statusBar);
    container.querySelector(".chat-unread").textContent = String(data.contact?.unreadCount ?? 0);
    container.querySelector(".chat-contact-name").textContent = data.contact?.name || "";
    fillAvatar(container.querySelector(".chat-avatar"), data.contact?.name, data.contact?.avatar);

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
        stopClock();
        window.clearTimeout(typingTimer);
        if (resolveTyping) resolveTyping();
      }
    };
  }

  // Chatübersicht: chats = [{ id, name, avatar, timestamp, time, preview, unreadCount }]
  function createChatList(container, options) {
    if (!container) {
      throw new Error("createChatList benötigt ein Element.");
    }

    const config = options || {};
    const chats = [...(config.chats || [])].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    const unreadChatCount = chats.filter((chat) => chat.unreadCount > 0).length;
    let filter = "all";

    container.className = "game-chat-list";
    container.innerHTML = `
      ${statusBarHtml}
      <header class="chat-list-header">
        <div class="chat-list-toolbar">
          <button type="button" class="chat-list-round chat-list-more">${icon.more}</button>
          <div class="chat-list-toolbar-actions">
            <button type="button" class="chat-icon-button chat-list-camera" aria-label="Kamera">${icon.camera}</button>
            <button type="button" class="chat-list-round chat-list-new" aria-label="Neuer Chat">${icon.plus}</button>
          </div>
        </div>
        <h2 class="chat-list-title">Chats</h2>
      </header>
      <div class="chat-list-scroll">
        <label class="chat-list-search">
          ${icon.search}
          <span class="visually-hidden">Chats durchsuchen</span>
          <input class="chat-list-search-input" type="search" placeholder="Suchen" autocomplete="off" />
        </label>
        <div class="chat-list-chips" role="group" aria-label="Chats filtern">
          <button type="button" class="chat-list-chip is-active" data-filter="all" aria-pressed="true">Alle</button>
          <button type="button" class="chat-list-chip" data-filter="unread" aria-pressed="false">Ungelesen<span class="chat-list-chip-count"></span></button>
          <button type="button" class="chat-list-chip" aria-pressed="false">Favoriten</button>
          <button type="button" class="chat-list-chip" aria-pressed="false">Gruppen</button>
        </div>
        <div class="chat-list-archived">
          <span class="chat-list-archived-icon">${icon.archive}</span>
          <span class="chat-list-archived-label">Archiviert</span>
          <span class="chat-list-archived-count"></span>
        </div>
        <ul class="chat-list-items"></ul>
        <p class="chat-list-empty" hidden></p>
      </div>
      <nav class="chat-list-tabbar" aria-label="Bereiche">
        <button type="button" class="chat-list-tab"><span class="chat-list-tab-icon">${icon.updates}</span><span>Aktuelles</span></button>
        <button type="button" class="chat-list-tab"><span class="chat-list-tab-icon">${icon.phone}</span><span>Anrufe</span></button>
        <button type="button" class="chat-list-tab"><span class="chat-list-tab-icon">${icon.communities}</span><span>Communitys</span></button>
        <button type="button" class="chat-list-tab chat-list-tab-chats is-active" aria-current="page"><span class="chat-list-tab-icon">${icon.chats}<span class="chat-list-tab-badge"></span></span><span>Chats</span></button>
        <button type="button" class="chat-list-tab"><span class="chat-list-tab-icon">${icon.you}</span><span>Du</span></button>
      </nav>
    `;

    const stopClock = fillStatusBar(container, config.statusBar);
    const scrollArea = container.querySelector(".chat-list-scroll");
    const searchInput = container.querySelector(".chat-list-search-input");
    const list = container.querySelector(".chat-list-items");
    const empty = container.querySelector(".chat-list-empty");
    const filterChips = [...container.querySelectorAll(".chat-list-chip[data-filter]")];

    container.querySelector(".chat-list-more").setAttribute("aria-label", config.closeLabel || "Schließen");
    container.querySelector(".chat-list-chip-count").textContent = unreadChatCount ? ` ${unreadChatCount}` : "";
    container.querySelector(".chat-list-tab-badge").textContent = unreadChatCount ? String(unreadChatCount) : "";
    container.querySelector(".chat-list-archived-count").textContent = String(config.archivedCount ?? 2);

    function createItem(chat) {
      const unread = chat.unreadCount > 0;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chat-list-item${unread ? " is-unread" : ""}`;
      button.addEventListener("click", () => config.onOpen?.(chat.id));

      const avatar = document.createElement("span");
      avatar.className = "chat-list-avatar";
      avatar.setAttribute("aria-hidden", "true");
      fillAvatar(avatar, chat.name, chat.avatar);

      const body = document.createElement("span");
      body.className = "chat-list-body";
      const top = document.createElement("span");
      top.className = "chat-list-top";
      const name = document.createElement("strong");
      name.className = "chat-list-name";
      name.textContent = chat.name || "";
      const time = document.createElement("time");
      time.className = "chat-list-time";
      time.textContent = chat.time || "";
      top.append(name, time);

      const bottom = document.createElement("span");
      bottom.className = "chat-list-bottom";
      const preview = document.createElement("span");
      preview.className = "chat-list-preview";
      preview.textContent = String(chat.preview || "").replace(/\s+/g, " ").trim();
      bottom.append(preview);
      if (unread) {
        const badge = document.createElement("span");
        badge.className = "chat-list-badge";
        badge.textContent = String(chat.unreadCount);
        badge.setAttribute("aria-label", `${chat.unreadCount} ungelesen`);
        bottom.append(badge);
      }

      body.append(top, bottom);
      button.append(avatar, body);
      item.append(button);
      return item;
    }

    function render() {
      const query = searchInput.value.trim().toLocaleLowerCase("de");
      const visible = chats.filter((chat) =>
        (filter !== "unread" || chat.unreadCount > 0) &&
        (!query || `${chat.name || ""} ${chat.preview || ""}`.toLocaleLowerCase("de").includes(query))
      );
      list.replaceChildren(...visible.map(createItem));
      empty.hidden = visible.length > 0;
      empty.textContent = chats.length
        ? (filter === "unread" && !query ? "Keine ungelesenen Chats." : "Keine passenden Chats gefunden.")
        : (config.emptyText || "Noch keine Chats.");
    }

    function setFilter(value) {
      filter = value;
      filterChips.forEach((chip) => {
        const active = chip.dataset.filter === value;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", String(active));
      });
      render();
    }

    searchInput.addEventListener("input", render);
    filterChips.forEach((chip) => chip.addEventListener("click", () => setFilter(chip.dataset.filter)));
    container.querySelector(".chat-list-more").addEventListener("click", () => config.onClose?.());
    container.querySelector(".chat-list-camera").addEventListener("click", () => config.onCameraClick?.());
    container.querySelector(".chat-list-new").addEventListener("click", () => config.onNewChatClick?.());
    container.querySelector(".chat-list-tab-chats").addEventListener("click", () => {
      searchInput.value = "";
      setFilter("all");
      scrollArea.scrollTop = 0;
    });

    render();

    return {
      setFilter,
      destroy() {
        stopClock();
      }
    };
  }

  window.createGameChat = createGameChat;
  window.createChatList = createChatList;
})();
