// Design philosophy: Cybernetic Swiss Modernism. This controller keeps interactions precise, stateful, and restrained so the interface feels like a technical command surface.
const state = {
  events: [],
  notifications: [],
  rss: [],
  assistantMessages: [],
  recognition: null,
};

const $ = (selector) => document.querySelector(selector);
const dateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

function relativeTime(iso) {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 60) return relativeFormatter.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 36) return relativeFormatter.format(hours, 'hour');
  return dateFormatter.format(new Date(iso));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function itemShell(inner, priority = 'normal') {
  return `<div class="item priority-${escapeHtml(priority)}">${inner}</div>`;
}

function renderEvents(events) {
  const target = $('#events-list');
  if (!events?.length) {
    target.innerHTML = '<div class="empty">No upcoming events configured.</div>';
    return;
  }
  target.innerHTML = events.map((event) => itemShell(`
    <strong>${escapeHtml(event.title)}</strong>
    <span class="meta">${escapeHtml(dateFormatter.format(new Date(event.startsAt)))}${event.location ? ` · ${escapeHtml(event.location)}` : ''}</span>
    <span class="meta">${escapeHtml(event.source || 'calendar')}</span>
  `, event.priority)).join('');
}

function renderNotifications(notifications) {
  const target = $('#notifications-list');
  if (!notifications?.length) {
    target.innerHTML = '<div class="empty">No notifications yet.</div>';
    return;
  }
  target.innerHTML = notifications.map((notification) => itemShell(`
    <strong>${escapeHtml(notification.title)}</strong>
    <span>${escapeHtml(notification.body)}</span>
    <span class="meta">${escapeHtml(notification.source || 'dashboard')} · ${escapeHtml(relativeTime(notification.timestamp))}</span>
  `, notification.priority)).join('');
}

function renderRss(items) {
  const target = $('#rss-list');
  if (!items?.length) {
    target.innerHTML = '<div class="empty">No feed items found.</div>';
    return;
  }
  target.innerHTML = items.map((item) => itemShell(`
    <strong>${item.link ? `<a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>` : escapeHtml(item.title)}</strong>
    ${item.summary ? `<span>${escapeHtml(item.summary)}</span>` : ''}
    <span class="meta">${escapeHtml(item.source || 'RSS')}${item.publishedAt ? ` · ${escapeHtml(relativeTime(item.publishedAt))}` : ''}</span>
  `)).join('');
}

function renderAssistantLog(messages = state.assistantMessages) {
  const log = $('#assistant-log');
  if (!messages.length) {
    log.innerHTML = '<div class="message system">Assistant activity will appear here.</div>';
    return;
  }
  log.innerHTML = messages.slice(-8).map((message) => `
    <div class="message ${escapeHtml(message.role)}">
      <strong>${escapeHtml(message.role)}</strong>
      <div>${escapeHtml(message.text)}</div>
      <span class="meta">${escapeHtml(relativeTime(message.timestamp))}</span>
    </div>
  `).join('');
  log.scrollTop = log.scrollHeight;
}

function setAssistantState(label, listening = false) {
  $('#assistant-state').textContent = label;
  document.body.classList.toggle('listening', listening);
}

async function refreshDashboard() {
  const response = await fetch('/api/dashboard', { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Dashboard API failed: ${response.status}`);
  const data = await response.json();
  state.events = data.events || [];
  state.notifications = data.notifications || [];
  state.rss = data.rss || [];
  state.assistantMessages = data.assistant?.messages || [];
  renderEvents(state.events);
  renderNotifications(state.notifications);
  renderRss(state.rss);
  renderAssistantLog();
  if (!data.assistant?.configured) {
    $('#assistant-hint').textContent = 'Set HOMELAB_ASSISTANT_URL to connect your homelab assistant.';
  }
}

async function sendAssistantPrompt(prompt) {
  const trimmed = prompt.trim();
  if (!trimmed) return;
  setAssistantState('Thinking', true);
  state.assistantMessages.push({ role: 'user', text: trimmed, timestamp: new Date().toISOString() });
  renderAssistantLog();

  const response = await fetch('/api/assistant', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ prompt: trimmed }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Assistant request failed');
  state.assistantMessages.push({ role: 'assistant', text: data.reply, timestamp: new Date().toISOString() });
  renderAssistantLog();
  setAssistantState('Answered', false);
}

function connectStream() {
  const stream = new EventSource('/api/stream');
  stream.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === 'notification') {
      state.notifications.unshift(payload.notification);
      renderNotifications(state.notifications.slice(0, 12));
    }
    if (payload.type === 'transcription') {
      $('#transcript-line').textContent = payload.transcript.text || 'Listening…';
      if (!payload.transcript.isFinal) setAssistantState('Listening', true);
    }
    if (payload.type === 'assistant:user' || payload.type === 'assistant:reply') {
      state.assistantMessages.push(payload.message);
      renderAssistantLog();
      setAssistantState(payload.type === 'assistant:reply' ? 'Answered' : 'Thinking', payload.type !== 'assistant:reply');
    }
    if (payload.type === 'refresh-requested') refreshDashboard().catch(console.error);
  };
  stream.onerror = () => setAssistantState('Reconnecting', false);
}

function setupAssistantForm() {
  const form = $('#assistant-form');
  const input = $('#assistant-input');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await sendAssistantPrompt(input.value);
      input.value = '';
    } catch (error) {
      setAssistantState('Error', false);
      state.assistantMessages.push({ role: 'system', text: error.message, timestamp: new Date().toISOString() });
      renderAssistantLog();
    }
  });
}

function setupBrowserVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceButton = $('#voice-button');
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.textContent = 'No voice API';
    return;
  }
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = navigator.language || 'en-US';
  state.recognition = recognition;

  recognition.onstart = () => setAssistantState('Listening', true);
  recognition.onerror = () => setAssistantState('Voice error', false);
  recognition.onend = () => setAssistantState('Idle', false);
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ');
    $('#assistant-input').value = transcript;
    $('#transcript-line').textContent = transcript;
    const last = event.results[event.results.length - 1];
    if (last.isFinal) sendAssistantPrompt(transcript).catch(console.error);
  };

  voiceButton.addEventListener('click', () => recognition.start());
}

window.addEventListener('DOMContentLoaded', () => {
  setupAssistantForm();
  setupBrowserVoice();
  connectStream();
  refreshDashboard().catch((error) => {
    console.error(error);
    $('.dashboard-grid').insertAdjacentHTML('afterbegin', `<div class="item priority-high">${escapeHtml(error.message)}</div>`);
  });
  setInterval(() => refreshDashboard().catch(console.error), 120000);
});
