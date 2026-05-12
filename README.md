# MentraOS-Extended-Example-App

### Install MentraOS on your phone

MentraOS install links: [mentra.glass/install](https://mentra.glass/install)

### (Easiest way to get started) Set up ngrok

1. `brew install ngrok`

2. Make an ngrok account

3. [Use ngrok to make a static address/URL](https://dashboard.ngrok.com/)

### Register your APP with MentraOS

<img width="181" alt="image" src="https://github.com/user-attachments/assets/36192c2b-e1ba-423b-90de-47ff8cd91318" />

1. Navigate to [console.mentra.glass](https://console.mentra.glass/)

2. Click "Sign In", and log in with the same account you're using for MentraOS

3. Click "Create App"

4. Set a unique package name like `com.yourName.yourAppName`

5. For "Public URL", enter your Ngrok's static URL or the public URL of your server

6. After the app is created, you will be given an API key. Copy this key and use it in the `.env` file below.

7. You can now add settings and tools to your app via the MentraOS Developer Console.  Let's upload this example's `app_config.json` file by clicking the "Import app_config.json" button under **Configuration Management**:

    ![Import app config](https://github.com/user-attachments/assets/14736150-7f02-43db-8b29-bbe918a4086b)

### Get your APP running!

1. [Install bun](https://bun.sh/docs/installation)

2. Create a new repo from this template using the `Use this template` dropdown in the upper right or the following command: `gh repo create --template Mentra-Community/MentraOS-Extended-Example-App`

    ![Create repo from template](https://github.com/user-attachments/assets/c10e14e8-2dc5-4dfa-adac-dd334c1b73a5)

3. Clone your new repo locally: `git clone <your-repo-url>`

4. cd into your repo, then type `bun install`

5. Set up your environment variables:
   * Create a `.env` file in the root directory by copying the example: `cp .env.example .env`
   * Edit the `.env` file with your app details:
     ```
     PORT=3000
     PACKAGE_NAME=com.yourName.yourAppName
     MENTRAOS_API_KEY=your_api_key_from_console
     ```
   * Make sure the `PACKAGE_NAME` matches what you registered in the MentraOS Console
   * Get your `MENTRAOS_API_KEY` from the MentraOS Developer Console

6. Run your app with `bun run dev`

7. To expose your app to the internet (and thus MentraOS) with ngrok, run: `ngrok http --url=<YOUR_NGROK_URL_HERE> 3000`
    * `3000` is the port. It must match what is in the app config. For example, if you entered `port: 8080`, use `8080` for ngrok instead.


### Next Steps

Check out the full documentation at [docs.mentra.glass](https://docs.mentra.glass/core-concepts)

#### Subscribing to events

You can listen for transcriptions, translations, settings updates, and other events within the onSession function.

#### Authenticated Webview

The app can provide an authenticated webview endpoint for users:

- Access the webview at `/webview`
- Authentication is handled automatically for MentraOS users
- The current MentraOS user is available at request.authUserId
- Create a web interface that allows users to interact with your app's functionality

#### Tool Calls

Your app can respond to tool calls via `handleToolCall` in your code:

- Define custom tools that can be called by MentraOS
- Each tool takes specific parameters and returns a result
- Tools can perform operations on your application's data
- Properly handle authentication and validation in your tool implementations


## Custom Dashboard Replacement

This fork replaces the stock example webview with a custom command dashboard at `/webview`. The dashboard now shows upcoming events, recent notifications, an RSS feed, live Mentra transcription activity, and a voice-activated assistant bridge to a self-hosted homelab AI service.

### Dashboard data sources

Configure these environment variables in your local runtime environment. Keep tokens private and do not commit them to the repository.

| Variable | Purpose | Expected shape |
|---|---|---|
| `DASHBOARD_TITLE` | Optional title displayed in the webview. | Plain string. |
| `DASHBOARD_EVENTS_URL` | Optional HTTP JSON endpoint for upcoming events. | Array or object with `events` array. |
| `DASHBOARD_EVENTS_JSON` | Optional inline fallback events. | JSON array of event objects. |
| `DASHBOARD_NOTIFICATIONS_URL` | Optional HTTP JSON endpoint for external notifications. | Array or object with `notifications` array. |
| `DASHBOARD_NOTIFICATIONS_JSON` | Optional inline fallback notifications. | JSON array of notification objects. |
| `RSS_FEED_URL` | RSS or Atom feed URL shown in the dashboard. | Standard RSS/Atom XML URL. |
| `RSS_FEED_LABEL` | Optional label for the RSS panel. | Plain string. |
| `ASSISTANT_WAKE_PHRASES` | Optional comma-separated wake phrases. | Example: `mentra,assistant,computer`. |
| `HOMELAB_ASSISTANT_URL` | Required for live assistant responses. | Publicly reachable HTTPS endpoint that accepts JSON POSTs. |
| `HOMELAB_ASSISTANT_TOKEN` | Optional bearer token for the assistant endpoint. | Secret token string. |
| `ASSISTANT_TIMEOUT_MS` | Optional assistant request timeout. | Milliseconds, default `15000`. |

Event objects should use this shape:

```json
{
  "id": "event-1",
  "title": "Team sync",
  "startsAt": "2026-05-12T16:00:00.000Z",
  "endsAt": "2026-05-12T16:30:00.000Z",
  "location": "Remote",
  "source": "calendar",
  "priority": "normal"
}
```

Notification objects should use this shape:

```json
{
  "id": "notification-1",
  "title": "Build complete",
  "body": "The dashboard app passed typecheck.",
  "timestamp": "2026-05-12T16:00:00.000Z",
  "source": "homelab",
  "priority": "normal"
}
```

### Homelab assistant endpoint contract

The dashboard server posts assistant commands to `HOMELAB_ASSISTANT_URL` as JSON. A final Mentra transcription beginning with a wake phrase, such as `Mentra summarize my day`, triggers the same assistant flow as the webview command form.

Request body:

```json
{
  "prompt": "summarize my day",
  "userId": "mentra-user-id",
  "source": "mentra-transcription",
  "timestamp": "2026-05-12T16:00:00.000Z"
}
```

The assistant service may respond with any of these keys: `reply`, `response`, `text`, or `message`.

```json
{
  "reply": "You have three events today and one high-priority homelab maintenance window."
}
```

### MentraOS tools

The app configuration now defines two tools:

| Tool | Activation phrases | Behavior |
|---|---|---|
| `ask_homelab_assistant` | `ask assistant`, `ask homelab`, `ask my assistant`, `talk to assistant` | Sends a tool-provided `prompt` to the homelab assistant. |
| `refresh_dashboard` | `refresh dashboard`, `reload dashboard` | Broadcasts a live refresh request to the web dashboard. |

### Validation

This repo now includes a repeatable TypeScript check:

```bash
npm run typecheck
```

The app still uses Bun for runtime commands from the original template:

```bash
bun install
bun run dev
```

If you prefer not to expose your homelab assistant directly, place a small HTTPS reverse proxy in front of it and require `HOMELAB_ASSISTANT_TOKEN` as a bearer token.
