import { AppServer, AppSession, DashboardMode } from "@mentra/sdk";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? "org.dev.mydashboard";
const API_KEY = process.env.API_KEY ?? "";
const PORT = parseInt(process.env.PORT ?? "7020", 10);

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

function buildContent(mode: DashboardMode | string): string {
  if (mode === DashboardMode.EXPANDED) {
    // Expanded mode has more room — add extra detail.
    return `${getTime()} · ${getDate()} | Your custom content here`;
  }
  // Main mode — keep it short, it shares space with other dashboard cards.
  return `${getTime()} · ${getDate()}`;
}

// ---------------------------------------------------------------------------
// Per-user session state
// ---------------------------------------------------------------------------

interface SessionState {
  tickerInterval: ReturnType<typeof setInterval> | null;
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

  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string
  ): Promise<void> {
    console.log(`[custom-dashboard] Session started — user: ${userId}, session: ${sessionId}`);

    const state: SessionState = { tickerInterval: null };

    // ------------------------------------------------------------------
    // React to dashboard mode changes.
    // Fires when the user looks up (mode → "main" or "expanded") and
    // when they look back down (mode → "none").
    // writeToMain() / writeToExpanded() submit content as a card inside
    // the existing dashboard — no conflict with the system dashboard.
    // ------------------------------------------------------------------
    session.dashboard.content.onModeChange((mode) => {
      if (mode === "none") {
        stopTicker(state);
        return;
      }

      // Push content immediately when the dashboard opens…
      writeToDashboard(session, mode);

      // …then refresh every second so the clock stays current.
      stopTicker(state);
      state.tickerInterval = setInterval(() => {
        writeToDashboard(session, mode);
      }, 1000);
    });
  }

  protected async onStop(
    _sessionId: string,
    userId: string,
    reason: string
  ): Promise<void> {
    console.log(`[custom-dashboard] Session stopped — user: ${userId}, reason: ${reason}`);
  }
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

function writeToDashboard(session: AppSession, mode: DashboardMode | string): void {
  const content = buildContent(mode);

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
