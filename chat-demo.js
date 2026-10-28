const chat = createGameChat(document.getElementById("game-chat"), {
  data: window.chatDemoData,
  onLinkClick(url, messageId) {
    window.alert(`Spiel-Event: Link in Nachricht ${messageId}\n${url}`);
  },
  onMessageSent(message) {
    console.info("Spieler-Nachricht:", message);
  },
  onBack() {
    console.info("Zurück zum Spiel");
  }
});

window.gameChat = chat;
