import { ToolCall, AppServer, AppSession } from '@mentra/sdk';
import path from 'path';
import { setupExpressRoutes } from './webview';
import { handleToolCall } from './tools';
import { DashboardHub } from './dashboard';

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in environment'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in environment'); })();
const PORT = parseInt(process.env.PORT || '3000');

class CustomMentraDashboardApp extends AppServer {
  /** Map to store active user sessions */
  private userSessionsMap = new Map<string, AppSession>();
  private dashboardHub = new DashboardHub();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
      publicDir: path.join(__dirname, '../public'),
    });

    setupExpressRoutes(this, this.dashboardHub);
  }

  /**
   * Handles tool calls from the MentraOS system.
   */
  protected async onToolCall(toolCall: ToolCall): Promise<string | undefined> {
    return handleToolCall(
      toolCall,
      toolCall.userId,
      this.userSessionsMap.get(toolCall.userId),
      this.dashboardHub,
    );
  }

  /**
   * Handles new user sessions, transcriptions, and dashboard updates.
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    this.userSessionsMap.set(userId, session);

    this.dashboardHub.addNotification({
      title: 'Mentra session connected',
      body: `Session ${sessionId.slice(0, 8)} is active and listening for assistant wake phrases.`,
      source: 'mentra-session',
      priority: 'normal',
    });

    session.layouts.showTextWall('Custom dashboard loaded. Say “Mentra” followed by a command to call your homelab assistant.');

    const transcriptionHandler = session.events.onTranscription(async (data) => {
      this.dashboardHub.broadcast({
        type: 'transcription',
        transcript: {
          text: data.text,
          isFinal: data.isFinal,
          userId,
        },
      });

      if (!data.isFinal) return;

      const text = data.text.trim();
      if (!text) return;

      this.dashboardHub.addNotification({
        title: 'Voice transcript',
        body: text,
        source: 'mentra-transcription',
        priority: 'low',
      });

      if (!this.dashboardHub.isWakeCommand(text)) {
        return;
      }

      const command = this.dashboardHub.stripWakePhrase(text);
      session.layouts.showTextWall(`Assistant: ${command}`);

      try {
        const result = await this.dashboardHub.handleAssistantCommand(command, userId, 'mentra-transcription');
        session.layouts.showTextWall(result.reply.slice(0, 480));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Assistant request failed';
        this.dashboardHub.addNotification({
          title: 'Assistant error',
          body: message,
          source: 'homelab-ai',
          priority: 'high',
        });
        session.layouts.showTextWall(`Assistant error: ${message}`);
      }
    });

    this.addCleanupHandler(transcriptionHandler);

    session.settings.onValueChange('show_live_transcription', (newValue: boolean, oldValue: boolean) => {
      this.dashboardHub.addNotification({
        title: 'Transcription setting changed',
        body: `Live transcription changed from ${oldValue} to ${newValue}.`,
        source: 'settings',
        priority: 'low',
      });
    });

    session.events.onDisconnected(() => {
      this.userSessionsMap.delete(userId);
      this.dashboardHub.closeUserConnections(userId);
      this.dashboardHub.addNotification({
        title: 'Mentra session disconnected',
        body: `Session ${sessionId.slice(0, 8)} ended.`,
        source: 'mentra-session',
        priority: 'normal',
      });
    });
  }
}

// Start the server
const app = new CustomMentraDashboardApp();
app.start().catch(console.error);