// ===================== CONFIGURATION =====================
// Keep your FastAPI server running at this address.
// If you deploy the backend, replace this with your deployed API URL.
const API_BASE_URL = "http://localhost:8000";
const CHAT_ENDPOINT = `${API_BASE_URL}/chat`;
const RESUME_ENDPOINT = `${API_BASE_URL}/resume/download`;
const STORAGE_KEY = "abhinav_resume_assistant_chats_v1";

// ===================== ELEMENTS =====================
const $ = (id) => document.getElementById(id);
const welcomeScreen = $("welcomeScreen");
const chatScreen = $("chatScreen");
const welcomeComposerWrap = $("welcomeComposerWrap");
const welcomeInput = $("welcomeInput");
const chatInput = $("chatInput");
const messagesElement = $("messages");
const historyList = $("historyList");
const chatTitle = $("chatTitle");
const welcomeError = $("welcomeError");
const errorMessage = $("errorMessage");

let chats = loadChats();
let activeChatId = chats[0]?.id || null;
let isSending = false;
let historyVisible = true;
let typeTimer = null;
let pendingTypeId = null;

// ===================== CHAT STORAGE =====================
function loadChats() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch (error) {
    console.warn("Could not load chat history:", error);
    return [];
  }
}

function saveChats() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
}

function createChat() {
  const chat = {
    id: crypto.randomUUID(),
    title: "New conversation",
    createdAt: Date.now(),
    messages: []
  };

  chats.unshift(chat);
  activeChatId = chat.id;
  saveChats();
  render();
  closeMobileSidebar();
  welcomeInput.focus();
}

function getActiveChat() {
  return chats.find(chat => chat.id === activeChatId) || null;
}

function updateChat(chatId, callback) {
  chats = chats.map(chat => chat.id === chatId ? callback(chat) : chat);
  saveChats();
}

// ===================== RENDERING =====================
function render() {
  const chat = getActiveChat();
  const hasMessages = Boolean(chat && chat.messages.length);

  welcomeScreen.classList.toggle("hidden", hasMessages);
  welcomeComposerWrap.classList.toggle("hidden", hasMessages);
  chatScreen.classList.toggle("hidden", !hasMessages);

  renderHistory();
  renderChips(hasMessages);

  if (hasMessages) {
    chatTitle.textContent = chat.title;
    renderMessages(chat);
  }
}

function renderHistory() {
  historyList.innerHTML = "";

  if (!chats.length) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Your conversations will appear here.";
    historyList.appendChild(empty);
    return;
  }

  chats.forEach(chat => {
    const row = document.createElement("div");
    row.className = `history-row ${chat.id === activeChatId ? "selected" : ""}`;

    const openButton = document.createElement("button");
    openButton.className = "history-open";
    openButton.type = "button";

    const icon = document.createElement("span");
    icon.textContent = "◉";
    const title = document.createElement("span");
    title.textContent = chat.title;

    openButton.append(icon, title);
    openButton.addEventListener("click", () => {
      activeChatId = chat.id;
      render();
      closeMobileSidebar();
    });

    const deleteButton = document.createElement("button");
    deleteButton.className = "history-delete";
    deleteButton.type = "button";
    deleteButton.title = "Delete conversation";
    deleteButton.textContent = "⌫";
    deleteButton.addEventListener("click", () => deleteChat(chat.id));

    row.append(openButton, deleteButton);
    historyList.appendChild(row);
  });
}

function renderMessages(chat) {
  clearInterval(typeTimer);
  messagesElement.innerHTML = "";

  chat.messages.forEach(message => {
    const row = document.createElement("div");
    const typing = message.id === pendingTypeId;
    if (typing) pendingTypeId = null;
    row.className = `message-row ${message.role}${typing ? " fresh" : ""}`;

    const avatar = document.createElement("div");
    avatar.className = `message-avatar ${message.role === "assistant" ? "ai" : ""}`;
    avatar.textContent = message.role === "assistant" ? "✳" : "♙";

    const body = document.createElement("div");
    body.className = "message-body";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const sender = document.createElement("strong");
    sender.textContent = message.role === "assistant" ? "Abhinav AI" : "You";

    const time = document.createElement("time");
    time.textContent = new Date(message.time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    meta.append(sender, time);

    if (message.role === "assistant") {
      const copy = document.createElement("button");
      copy.className = "copy-btn";
      copy.type = "button";
      copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(message.content); copy.textContent = "Copied ✓"; }
        catch { copy.textContent = "Copy failed"; }
        setTimeout(() => (copy.textContent = "Copy"), 1500);
      });
      meta.append(copy);
    }

    const text = document.createElement("div");
    text.className = "message-text";
    // textContent is intentional: AI output is displayed as plain text,
    // not injected as HTML.
    if (typing) typewrite(text, message.content);
    else text.textContent = message.content;

    body.append(meta, text);
    row.append(avatar, body);
    messagesElement.appendChild(row);
  });

  messagesElement.scrollTop = messagesElement.scrollHeight;
  updateScrollBtn();
}

function showTyping() {
  const row = document.createElement("div");
  row.className = "message-row";
  row.id = "typingIndicator";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar ai";
  avatar.textContent = "✳";

  const body = document.createElement("div");
  body.className = "message-body";
  const meta = document.createElement("div");
  meta.className = "message-meta";
  const name = document.createElement("strong");
  name.textContent = "Abhinav AI";
  const status = document.createElement("time");
  status.textContent = "Thinking…";
  meta.append(name, status);

  const dots = document.createElement("div");
  dots.className = "typing";
  dots.innerHTML = "<i></i><i></i><i></i>";
  body.append(meta, dots);
  row.append(avatar, body);
  messagesElement.appendChild(row);
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function removeTyping() {
  $("typingIndicator")?.remove();
}

// ===================== SEND MESSAGE / API =====================
async function sendMessage(rawQuestion, sourceInput) {
  const question = rawQuestion.trim();
  if (!question || isSending) return;

  let chat = getActiveChat();
  if (!chat) {
    chat = {
      id: crypto.randomUUID(),
      title: "New conversation",
      createdAt: Date.now(),
      messages: []
    };
    chats.unshift(chat);
    activeChatId = chat.id;
  }

  const chatId = chat.id;
  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: question,
    time: Date.now()
  };

  updateChat(chatId, current => ({
    ...current,
    title: current.messages.length
      ? current.title
      : (question.length > 38 ? question.slice(0, 38) + "…" : question),
    messages: [...current.messages, userMessage]
  }));

  if (sourceInput) { sourceInput.value = ""; autosize(sourceInput); }
  hideError();
  isSending = true;
  setSendButtonsDisabled(true);
  render();
  showTyping();

  try {
    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question })
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body.detail || JSON.stringify(body);
      } catch {
        detail = await response.text();
      }
      throw new Error(`API returned ${response.status}: ${detail || response.statusText}`);
    }

    const data = await response.json();
    if (typeof data.answer !== "string" || !data.answer.trim()) {
      throw new Error("The backend response does not contain a valid 'answer' field.");
    }

    const answerId = crypto.randomUUID();
    pendingTypeId = answerId;
    updateChat(chatId, current => ({
      ...current,
      messages: [...current.messages, {
        id: answerId,
        role: "assistant",
        content: data.answer,
        time: Date.now()
      }]
    }));
  } catch (error) {
    console.error("Chat API error:", error);
    const friendlyMessage = error instanceof TypeError
      ? "Cannot connect to the FastAPI backend. Make sure it is running at " + API_BASE_URL + " and CORS is enabled."
      : error.message;

    showError(friendlyMessage);
    updateChat(chatId, current => ({
      ...current,
      messages: [...current.messages, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "I couldn't connect to the resume service. Please check the backend connection and try again.",
        time: Date.now()
      }]
    }));
  } finally {
    removeTyping();
    isSending = false;
    setSendButtonsDisabled(false);
    render();
    if (getActiveChat()?.id === chatId) chatInput.focus();
  }
}

function setSendButtonsDisabled(disabled) {
  $("sendButton").disabled = disabled;
  $("welcomeSend").disabled = disabled;
}

function showError(message) {
  const chat = getActiveChat();
  const target = chat && chat.messages.length ? errorMessage : welcomeError;
  target.textContent = message;
  target.classList.remove("hidden");
}

function hideError() {
  welcomeError.classList.add("hidden");
  errorMessage.classList.add("hidden");
}

// ===================== CHAT ACTIONS =====================
function deleteChat(chatId) {
  chats = chats.filter(chat => chat.id !== chatId);
  if (activeChatId === chatId) activeChatId = chats[0]?.id || null;
  saveChats();
  render();
}

function downloadResume() {
  // This route is added to the FastAPI backend in the instructions.
  window.open(RESUME_ENDPOINT, "_blank", "noopener,noreferrer");
}

function submitWelcome() {
  sendMessage(welcomeInput.value, welcomeInput);
}

function submitChat() {
  sendMessage(chatInput.value, chatInput);
}

function handleEnter(event, callback) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    callback();
  }
}

// ===================== MOBILE SIDEBAR =====================
function openMobileSidebar() {
  $("sidebar").classList.add("open");
  $("mobileOverlay").classList.add("show");
}

function closeMobileSidebar() {
  $("sidebar").classList.remove("open");
  $("mobileOverlay").classList.remove("show");
}

// ===================== EVENT LISTENERS =====================
$("newChatButton").addEventListener("click", createChat);
$("newChatInline").addEventListener("click", createChat);
$("sendButton").addEventListener("click", submitChat);
$("welcomeSend").addEventListener("click", submitWelcome);
$("downloadNav").addEventListener("click", downloadResume);
$("downloadTop").addEventListener("click", downloadResume);
$("openSidebar").addEventListener("click", openMobileSidebar);
$("closeSidebar").addEventListener("click", closeMobileSidebar);
$("mobileOverlay").addEventListener("click", closeMobileSidebar);

$("welcomeInput").addEventListener("keydown", event => handleEnter(event, submitWelcome));
$("chatInput").addEventListener("keydown", event => handleEnter(event, submitChat));

$("promptGrid").addEventListener("click", event => {
  const button = event.target.closest("[data-prompt]");
  if (button) sendMessage(button.dataset.prompt, null);
});

$("toggleHistory").addEventListener("click", () => {
  historyVisible = !historyVisible;
  historyList.classList.toggle("hidden", !historyVisible);
  $("toggleHistory").textContent = historyVisible ? "⌄" : "›";
});

document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    createChat();
  }
  if (event.key === "Escape") closeMobileSidebar();
});

// ===================== INTERACTIVITY =====================
function typewrite(el, full) {
  let i = 0;
  const step = Math.max(2, Math.ceil(full.length / 160));
  typeTimer = setInterval(() => {
    i += step;
    el.textContent = full.slice(0, i);
    const near = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight < 160;
    if (near) messagesElement.scrollTop = messagesElement.scrollHeight;
    if (i >= full.length) { clearInterval(typeTimer); typeTimer = null; }
  }, 16);
}

function autosize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 130) + "px";
  el.closest(".composer")?.classList.toggle("has-text", Boolean(el.value.trim()));
}
[welcomeInput, chatInput].forEach(el => el.addEventListener("input", () => autosize(el)));

const FOLLOW_UPS = [
  "What projects has Abhinav built?",
  "Which technologies does he know best?",
  "What kind of role is he looking for?",
  "Summarize his profile in 3 lines."
];
function renderChips(hasMessages) {
  const box = $("chips");
  box.innerHTML = "";
  if (!hasMessages || isSending) return;
  FOLLOW_UPS.forEach(q => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip";
    b.textContent = q;
    b.addEventListener("click", () => sendMessage(q, null));
    box.appendChild(b);
  });
}

function updateScrollBtn() {
  const far = messagesElement.scrollHeight - messagesElement.scrollTop - messagesElement.clientHeight > 120;
  $("scrollBottom").classList.toggle("hidden", !far);
}
messagesElement.addEventListener("scroll", updateScrollBtn);
$("scrollBottom").addEventListener("click", () =>
  messagesElement.scrollTo({ top: messagesElement.scrollHeight, behavior: "smooth" }));

// cursor-follow glow on cards
document.addEventListener("pointermove", e => {
  const card = e.target.closest?.(".prompt-card, .stat-card");
  if (!card) return;
  const r = card.getBoundingClientRect();
  card.style.setProperty("--mx", (e.clientX - r.left) + "px");
  card.style.setProperty("--my", (e.clientY - r.top) + "px");
});

// ===================== COLOUR THEMES =====================
const THEMES = { emerald: 0, ocean: 80, violet: 130, rose: 200, amber: -95 };
const THEME_KEY = "abhinav_resume_theme_v1";
function applyTheme(name) {
  if (!(name in THEMES)) name = "emerald";
  document.documentElement.style.setProperty("--hue", THEMES[name] + "deg");
  document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("active", s.dataset.theme === name));
  try { localStorage.setItem(THEME_KEY, name); } catch { }
}
$("themePicker").addEventListener("click", e => {
  const s = e.target.closest(".swatch");
  if (s) applyTheme(s.dataset.theme);
});
let savedTheme = "emerald";
try { savedTheme = localStorage.getItem(THEME_KEY) || "emerald"; } catch { }
applyTheme(savedTheme);

// soft spotlight that follows the cursor
let glowFrame = 0;
document.addEventListener("pointermove", e => {
  if (glowFrame) return;
  glowFrame = requestAnimationFrame(() => {
    glowFrame = 0;
    const root = document.documentElement.style;
    root.setProperty("--gx", e.clientX + "px");
    root.setProperty("--gy", e.clientY + "px");
  });
});

// click ripple
document.addEventListener("pointerdown", e => {
  const btn = e.target.closest(".send-button, .new-chat-button, .download-button, .prompt-card, .chip, .small-new-chat");
  if (!btn || btn.disabled) return;
  const r = btn.getBoundingClientRect();
  const size = Math.max(r.width, r.height) * 1.6;
  const dot = document.createElement("span");
  dot.className = "ripple";
  dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
  btn.appendChild(dot);
  dot.addEventListener("animationend", () => dot.remove());
});

// Initial page render
render();
welcomeInput.focus();
