import { AppServer, AppSession, DashboardMode, PhoneNotification, StreamType } from "@mentra/sdk";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? "org.dev.mydashboard";
const API_KEY = process.env.API_KEY ?? "c4ae82f14390528161b4d36292f37afb654cb3b2f34435cf6e017659d79c20ac";
const PORT = parseInt(process.env.PORT ?? "3001", 10);

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

function buildContent(mode: DashboardMode | string, lastNotification: PhoneNotification | null): string {
  const app = lastNotification?.app ?? "";
  const truncatedApp = app.length > 27 ? app.slice(0, 24) + "..." : app;
  const notifLine = lastNotification
    ? `${truncatedApp}: ${lastNotification.title} — ${lastNotification.content}`
    : "No notifications";

  if (mode === DashboardMode.EXPANDED) {
    return `${getTime()} · ${getDate()}\n${notifLine}`;
  }
  return `${notifLine}`;
}

// ---------------------------------------------------------------------------
// Per-user session state
// ---------------------------------------------------------------------------

interface SessionState {
  tickerInterval: ReturnType<typeof setInterval> | null;
  lastNotification: PhoneNotification | null;
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

    const state: SessionState = { tickerInterval: null, lastNotification: null };

    // ------------------------------------------------------------------
    // Pre-populate content immediately so it is cached in the cloud
    // before the user looks up.  The dashboard will show it as soon as
    // the mode becomes "main" or "expanded", with no extra round-trip.
    // ------------------------------------------------------------------
    writeToDashboard(session, DashboardMode.MAIN, state);
    writeToDashboard(session, DashboardMode.EXPANDED, state);

    // ------------------------------------------------------------------
    // Track the most recent phone notification.
    // ------------------------------------------------------------------
    session.subscribe(StreamType.PHONE_NOTIFICATION);
    console.log(`[custom-dashboard] Subscribed to phone notifications`);

    session.events.onPhoneNotifications((notification) => {
      console.log(`[custom-dashboard] Notification received — app: ${notification.app}, title: ${notification.title}, content: ${notification.content}`);
      state.lastNotification = notification;
      writeToDashboard(session, DashboardMode.MAIN, state);
      writeToDashboard(session, DashboardMode.EXPANDED, state);
    });

    // ------------------------------------------------------------------
    // React to dashboard mode changes.
    // Fires when the user looks up (mode → "main" or "expanded") and
    // when they look back down (mode → "none").
    // ------------------------------------------------------------------
    session.dashboard.content.onModeChange((mode) => {
      if (mode === "none") {
        stopTicker(state);
        return;
      }

      // Push content immediately when the dashboard opens…
      writeToDashboard(session, mode, state);

      // …then refresh every second so the clock stays current.
      stopTicker(state);
      state.tickerInterval = setInterval(() => {
        writeToDashboard(session, mode, state);
      }, 1000);
    });
  }

  protected async onStop(_sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`[custom-dashboard] Session stopped — user: ${userId}, reason: ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

function writeToDashboard(session: AppSession, mode: DashboardMode | string, state: SessionState): void {
  const content = buildContent(mode, state.lastNotification);

  if (mode === DashboardMode.EXPANDED) {
    session.dashboard.content.writeToExpanded(content);
  } else {
    session.dashboard.content.writeToMain(content);
  }
}

function stopTicker(state: SessionState): void {
  if (state.tickerInterval !== null) {
    clearInterval(state.tickerInterval);
    state.tickerInterval = null;
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
