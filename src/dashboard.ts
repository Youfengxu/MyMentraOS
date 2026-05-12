import express from 'express';
import type { AuthenticatedRequest } from '@mentra/sdk';

export interface DashboardEvent {
  id: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  source?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface DashboardNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  source?: string;
  priority?: 'low' | 'normal' | 'high';
}

export interface RssItem {
  id: string;
  title: string;
  link?: string;
  source?: string;
  publishedAt?: string;
  summary?: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  source?: string;
}

interface AssistantResult {
  reply: string;
  raw?: unknown;
}

const DEFAULT_WAKE_PHRASES = ['mentra', 'assistant', 'computer'];

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function envList(name: string, fallback: string[]): string[] {
  const value = process.env[name];
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function decodeXml(input = ''): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function stripTags(input = ''): string {
  return decodeXml(input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}

function extractTag(block: string, tag: string): string | undefined {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]) : undefined;
}

function parseRss(xml: string, limit = 8): RssItem[] {
  const itemBlocks = [...xml.matchAll(/<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  return itemBlocks.slice(0, limit).map((block, index) => {
    const title = stripTags(extractTag(block, 'title') ?? `Feed item ${index + 1}`);
    const atomLink = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i)?.[1];
    const link = stripTags(extractTag(block, 'link') ?? atomLink ?? '');
    const publishedAt = stripTags(extractTag(block, 'pubDate') ?? extractTag(block, 'updated') ?? extractTag(block, 'published') ?? '');
    const summary = stripTags(extractTag(block, 'description') ?? extractTag(block, 'summary') ?? extractTag(block, 'content') ?? '');
    return {
      id: id('rss'),
      title,
      link: link || undefined,
      publishedAt: publishedAt || undefined,
      summary: summary ? summary.slice(0, 220) : undefined,
      source: process.env.RSS_FEED_LABEL || 'RSS',
    };
  });
}

async function fetchJsonArray<T>(url?: string): Promise<T[] | undefined> {
  if (!url) return undefined;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Request failed for ${url}: ${response.status}`);
  const data = await response.json();
  if (Array.isArray(data)) return data as T[];
  if (Array.isArray(data.items)) return data.items as T[];
  if (Array.isArray(data.events)) return data.events as T[];
  if (Array.isArray(data.notifications)) return data.notifications as T[];
  return undefined;
}

function parseJsonArray<T>(name: string): T[] | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const data = JSON.parse(value);
  return Array.isArray(data) ? data as T[] : undefined;
}

function sampleEvents(): DashboardEvent[] {
  const now = new Date();
  const addHours = (hours: number) => new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
  return [
    { id: 'sample-event-1', title: 'Morning standup', startsAt: addHours(2), location: 'Remote', source: 'sample', priority: 'normal' },
    { id: 'sample-event-2', title: 'Homelab maintenance window', startsAt: addHours(7), location: 'Rack / VPN', source: 'sample', priority: 'high' },
    { id: 'sample-event-3', title: 'Mentra dashboard review', startsAt: addHours(28), location: 'Desk', source: 'sample', priority: 'normal' },
  ];
}

function sampleNotifications(): DashboardNotification[] {
  return [
    { id: 'sample-notification-1', title: 'Dashboard online', body: 'Custom dashboard routes are active. Connect live sources in .env.', timestamp: new Date().toISOString(), source: 'dashboard', priority: 'normal' },
  ];
}

export class DashboardHub {
  private sseConnections = new Map<string, express.Response[]>();
  private localNotifications: DashboardNotification[] = [];
  private assistantMessages: AssistantMessage[] = [];
  private wakePhrases = envList('ASSISTANT_WAKE_PHRASES', DEFAULT_WAKE_PHRASES);

  setupRoutes(app: express.Express): void {
    app.use(express.json({ limit: '1mb' }));

    app.get('/api/dashboard', async (req: AuthenticatedRequest, res) => {
      try {
        const [events, notifications, rss] = await Promise.all([
          this.getEvents(),
          this.getNotifications(),
          this.getRssItems(),
        ]);
        res.json({
          userId: req.authUserId,
          generatedAt: new Date().toISOString(),
          events,
          notifications,
          rss,
          assistant: {
            wakePhrases: this.wakePhrases,
            messages: this.assistantMessages.slice(-12),
            configured: Boolean(process.env.HOMELAB_ASSISTANT_URL),
          },
        });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown dashboard error' });
      }
    });

    app.get('/api/events', async (_req, res) => res.json(await this.getEvents()));
    app.get('/api/notifications', async (_req, res) => res.json(await this.getNotifications()));
    app.get('/api/rss', async (_req, res) => res.json(await this.getRssItems()));

    app.post('/api/assistant', async (req: AuthenticatedRequest, res) => {
      const prompt = String(req.body?.prompt ?? '').trim();
      if (!prompt) {
        res.status(400).json({ error: 'prompt is required' });
        return;
      }
      try {
        const result = await this.handleAssistantCommand(prompt, req.authUserId ?? 'webview', 'webview');
        res.json(result);
      } catch (error) {
        res.status(502).json({ error: error instanceof Error ? error.message : 'Assistant request failed' });
      }
    });

    app.get('/api/stream', (req: AuthenticatedRequest, res) => {
      const userId = req.authUserId ?? 'anonymous';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      if (!this.sseConnections.has(userId)) this.sseConnections.set(userId, []);
      this.sseConnections.get(userId)!.push(res);
      res.write(`data: ${JSON.stringify({ type: 'connected', userId, timestamp: new Date().toISOString() })}\n\n`);
      req.on('close', () => this.removeConnection(userId, res));
    });
  }

  isWakeCommand(transcript: string): boolean {
    const normalized = transcript.toLowerCase();
    return this.wakePhrases.some((phrase) => normalized.startsWith(phrase) || normalized.includes(`hey ${phrase}`) || normalized.includes(`ok ${phrase}`));
  }

  stripWakePhrase(transcript: string): string {
    let command = transcript.trim();
    for (const phrase of this.wakePhrases) {
      command = command.replace(new RegExp(`^(hey|ok)?\\s*${phrase}[,!:.-]*\\s*`, 'i'), '');
    }
    return command.trim() || transcript.trim();
  }

  addNotification(notification: Omit<DashboardNotification, 'id' | 'timestamp'> & Partial<Pick<DashboardNotification, 'id' | 'timestamp'>>): DashboardNotification {
    const full: DashboardNotification = {
      id: notification.id ?? id('notification'),
      title: notification.title,
      body: notification.body,
      timestamp: notification.timestamp ?? new Date().toISOString(),
      source: notification.source ?? 'mentra',
      priority: notification.priority ?? 'normal',
    };
    this.localNotifications.unshift(full);
    this.localNotifications = this.localNotifications.slice(0, 30);
    this.broadcast({ type: 'notification', notification: full });
    return full;
  }

  async handleAssistantCommand(prompt: string, userId: string, source: string): Promise<AssistantResult> {
    const userMessage: AssistantMessage = { id: id('assistant_user'), role: 'user', text: prompt, timestamp: new Date().toISOString(), source };
    this.assistantMessages.push(userMessage);
    this.broadcast({ type: 'assistant:user', message: userMessage });

    const endpoint = process.env.HOMELAB_ASSISTANT_URL;
    if (!endpoint) {
      const reply = 'Homelab assistant endpoint is not configured. Set HOMELAB_ASSISTANT_URL in .env to enable live responses.';
      this.recordAssistantReply(reply, 'system');
      return { reply };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.ASSISTANT_TIMEOUT_MS ?? 15000));
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(process.env.HOMELAB_ASSISTANT_TOKEN ? { Authorization: `Bearer ${process.env.HOMELAB_ASSISTANT_TOKEN}` } : {}),
        },
        body: JSON.stringify({ prompt, userId, source, timestamp: new Date().toISOString() }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Assistant endpoint returned ${response.status}`);
      const raw = await response.json().catch(async () => ({ text: await response.text() }));
      const reply = String(raw.reply ?? raw.response ?? raw.text ?? raw.message ?? '').trim() || 'Assistant returned an empty response.';
      this.recordAssistantReply(reply, 'assistant');
      return { reply, raw };
    } finally {
      clearTimeout(timeout);
    }
  }

  closeUserConnections(userId: string): void {
    const connections = this.sseConnections.get(userId);
    if (connections) connections.forEach((res) => res.end());
    this.sseConnections.delete(userId);
  }

  broadcast(payload: unknown): void {
    const encoded = `data: ${JSON.stringify({ ...payload as object, timestamp: new Date().toISOString() })}\n\n`;
    for (const responses of this.sseConnections.values()) {
      responses.forEach((res) => res.write(encoded));
    }
  }

  private recordAssistantReply(reply: string, source: string): void {
    const message: AssistantMessage = { id: id('assistant_reply'), role: source === 'system' ? 'system' : 'assistant', text: reply, timestamp: new Date().toISOString(), source };
    this.assistantMessages.push(message);
    this.assistantMessages = this.assistantMessages.slice(-30);
    this.broadcast({ type: 'assistant:reply', message });
    this.addNotification({ title: 'Assistant response', body: reply.slice(0, 180), source: 'homelab-ai', priority: 'normal' });
  }

  private removeConnection(userId: string, response: express.Response): void {
    const connections = this.sseConnections.get(userId);
    if (!connections) return;
    const index = connections.indexOf(response);
    if (index >= 0) connections.splice(index, 1);
    if (connections.length === 0) this.sseConnections.delete(userId);
  }

  private async getEvents(): Promise<DashboardEvent[]> {
    const fromUrl = await fetchJsonArray<DashboardEvent>(process.env.DASHBOARD_EVENTS_URL).catch(() => undefined);
    const fromEnv = parseJsonArray<DashboardEvent>('DASHBOARD_EVENTS_JSON');
    return (fromUrl ?? fromEnv ?? sampleEvents())
      .map((event) => ({ ...event, id: event.id ?? id('event') }))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 10);
  }

  private async getNotifications(): Promise<DashboardNotification[]> {
    const fromUrl = await fetchJsonArray<DashboardNotification>(process.env.DASHBOARD_NOTIFICATIONS_URL).catch(() => undefined);
    const fromEnv = parseJsonArray<DashboardNotification>('DASHBOARD_NOTIFICATIONS_JSON');
    const external = (fromUrl ?? fromEnv ?? sampleNotifications()).map((item) => ({ ...item, id: item.id ?? id('external_notification') }));
    return [...this.localNotifications, ...external]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 12);
  }

  private async getRssItems(): Promise<RssItem[]> {
    const url = process.env.RSS_FEED_URL;
    if (!url) {
      return [{ id: 'rss-placeholder', title: 'Set RSS_FEED_URL in .env to load your feed', source: 'dashboard', summary: 'The dashboard is ready to consume any standard RSS or Atom feed.' }];
    }
    const response = await fetch(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, text/xml' } });
    if (!response.ok) throw new Error(`RSS request failed: ${response.status}`);
    const xml = await response.text();
    return parseRss(xml, 8);
  }
}
