import { AppServer, AppSession, DashboardMode, PhoneNotification, StreamType } from "@mentra/sdk";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? "org.dev.mydashboard";
const API_KEY = process.env.API_KEY ?? "c4ae82f14390528161b4d36292f37afb654cb3b2f34435cf6e017659d79c20ac";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

// ---------------------------------------------------------------------------
// Display constants  (4 lines × 22 chars)
// ---------------------------------------------------------------------------

const LINE_WIDTH = 22;
const SCROLL_INTERVAL_MS = 3000; // ms between each 2-line content scroll step

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function truncate(text: string | null | undefined): string {
  return (text ?? "").slice(0, LINE_WIDTH);
}

// Word-wrap text into lines of at most LINE_WIDTH chars.
// Long words with no spaces are broken into LINE_WIDTH chunks.
function wrapLines(text: string): string[] {
  if (!text) return [""];
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(" ")) {
    // Break any word longer than LINE_WIDTH into chunks first.
    const chunks: string[] = [];
    let w = word;
    while (w.length > LINE_WIDTH) {
      chunks.push(w.slice(0, LINE_WIDTH));
      w = w.slice(LINE_WIDTH);
    }
    if (w.length > 0) chunks.push(w);

    for (const chunk of chunks) {
      if (current === "") {
        current = chunk;
      } else if (current.length + 1 + chunk.length <= LINE_WIDTH) {
        current += " " + chunk;
      } else {
        lines.push(current);
        current = chunk;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTime(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDate(): string {
  return new Date().toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildContent(mode: DashboardMode | string, lastNotification: PhoneNotification | null, lineOffset: number): string {
  if (!lastNotification) {
    if (mode === DashboardMode.EXPANDED) {
      return `${getTime()} - ${getDate()}\nNo notifications`;
    }
    return "No notifications";
  }

  const titleLine = truncate(lastNotification.title);

  const contentLines = wrapLines(lastNotification.content);
  const len  = contentLines.length;
  const idx  = lineOffset % len;
  const row1 = contentLines[idx] ?? "";
  const row2 = len > 1 ? (contentLines[(idx + 1) % len] ?? "") : "";
  const row3 = len > 2 ? (contentLines[(idx + 2) % len] ?? "") : "";

  if (mode === DashboardMode.EXPANDED) {
    // line 1: time/date  line 2: title  lines 3-4: content (scrolling)
    return `${getTime()} - ${getDate()}\n${titleLine}\n${row1}\n${row2}`;
  }
  // MAIN: line 1: title  lines 2-4: content (scrolling)
  return `${titleLine}\n${row1}\n${row2}\n${row3}`;
}

// ---------------------------------------------------------------------------
// Per-user session state
// ---------------------------------------------------------------------------

interface SessionState {
  tickerInterval: ReturnType<typeof setInterval> | null;
  lastNotification: PhoneNotification | null;
  lineOffset: number; // which pair of content lines is currently shown
}

// ---------------------------------------------------------------------------
// App server
// ---------------------------------------------------------------------------

class CustomDashboardApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: API_KEY,
      port: PORT,
    });
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`[custom-dashboard] Session started — user: ${userId}, session: ${sessionId}`);

    const state: SessionState = { tickerInterval: null, lastNotification: null, lineOffset: 0 };

    // ------------------------------------------------------------------
    // Track the most recent phone notification.
    // ------------------------------------------------------------------
    session.subscribe(StreamType.PHONE_NOTIFICATION);
    console.log(`[custom-dashboard] Subscribed to phone notifications`);

    session.events.onPhoneNotifications((notification) => {
      console.log(`[custom-dashboard] Notification received: ${JSON.stringify(notification)}`);
      state.lastNotification = notification;
      state.lineOffset = 0;
      writeToDashboard(session, DashboardMode.MAIN, state);
      writeToDashboard(session, DashboardMode.EXPANDED, state);
    });

    // ------------------------------------------------------------------
    // Persistent ticker: advances content by 3 lines every SCROLL_INTERVAL_MS
    // and pushes both views regardless of whether the user is looking.
    // ------------------------------------------------------------------
    writeToDashboard(session, DashboardMode.MAIN, state);
    writeToDashboard(session, DashboardMode.EXPANDED, state);

    state.tickerInterval = setInterval(() => {
      state.lineOffset += 3;
      writeToDashboard(session, DashboardMode.MAIN, state);
      writeToDashboard(session, DashboardMode.EXPANDED, state);
    }, SCROLL_INTERVAL_MS);
  }

  protected async onStop(_sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`[custom-dashboard] Session stopped — user: ${userId}, reason: ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

function writeToDashboard(session: AppSession, mode: DashboardMode | string, state: SessionState): void {
  try {
    const content = buildContent(mode, state.lastNotification, state.lineOffset);
    if (mode === DashboardMode.EXPANDED) {
      session.dashboard.content.writeToExpanded(content);
    } else {
      session.dashboard.content.writeToMain(content);
    }
  } catch (err) {
    console.error(`[custom-dashboard] writeToDashboard error (${mode}):`, err);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const app = new CustomDashboardApp();

app.start().then(() => {
  console.log(`[custom-dashboard] Running on port ${PORT}`);
  console.log(`[custom-dashboard] Package: ${PACKAGE_NAME}`);
});
