# Custom Mentra OS Dashboard — Deployment Guide

This guide walks you through deploying the custom dashboard replacement for Mentra OS, including integration with your homelab AI assistant, event sources, and notification feeds.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Environment Configuration](#environment-configuration)
4. [Registering with Mentra OS](#registering-with-mentra-os)
5. [Configuring Data Sources](#configuring-data-sources)
6. [Homelab Assistant Integration](#homelab-assistant-integration)
7. [Running the App](#running-the-app)
8. [Testing the Dashboard](#testing-the-dashboard)
9. [Security Best Practices](#security-best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before you begin, ensure you have the following:

- **Bun** installed ([bun.sh](https://bun.sh/docs/installation))
- **Node.js** 18+ (for npm/npx compatibility)
- **Git** for version control
- **ngrok** or another tunnel service for exposing your local server to the internet
- **Mentra OS** installed on your phone ([mentra.glass/install](https://mentra.glass/install))
- A **GitHub account** to fork or clone the repository
- A **self-hosted AI assistant** running on your homelab (optional but recommended)

---

## Initial Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Youfengxu/MyMentraOS.git
cd MyMentraOS
git checkout test  # Switch to the test branch with the dashboard
```

### 2. Install Dependencies

```bash
bun install
```

This installs the Mentra SDK, Express, EJS, and WebSocket dependencies.

### 3. Validate the Build

```bash
npm run typecheck
```

This ensures all TypeScript types are correct before deployment.

---

## Environment Configuration

### 1. Create a `.env` File

Copy the example environment file and customize it:

```bash
cp .env.example .env
```

### 2. Required Variables

| Variable | Value | Example |
|---|---|---|
| `PORT` | Port for the Express server | `3000` |
| `PACKAGE_NAME` | Unique package identifier | `com.youfengxu.mentra-dashboard` |
| `MENTRAOS_API_KEY` | API key from Mentra Console | `sk_live_...` |

### 3. Optional Dashboard Variables

Add these to customize the dashboard experience:

```bash
# Dashboard title
DASHBOARD_TITLE="My Command Center"

# Event source (calendar API or static JSON)
DASHBOARD_EVENTS_URL="https://api.example.com/events"
DASHBOARD_EVENTS_JSON='[{"id":"e1","title":"Team Sync","startsAt":"2026-05-12T16:00:00Z"}]'

# Notification source
DASHBOARD_NOTIFICATIONS_URL="https://api.example.com/notifications"
DASHBOARD_NOTIFICATIONS_JSON='[{"id":"n1","title":"Build Complete","body":"Dashboard passed tests","timestamp":"2026-05-12T16:00:00Z"}]'

# RSS feed
RSS_FEED_URL="https://news.ycombinator.com/rss"
RSS_FEED_LABEL="Hacker News"

# Voice assistant wake phrases (comma-separated)
ASSISTANT_WAKE_PHRASES="mentra,assistant,computer"

# Homelab assistant (required for voice assistant feature)
HOMELAB_ASSISTANT_URL="https://homelab.example.com/api/chat"
HOMELAB_ASSISTANT_TOKEN="your-secret-token"
ASSISTANT_TIMEOUT_MS="15000"
```

### 4. Keep Secrets Safe

**Never commit `.env` to version control.** Add it to `.gitignore`:

```bash
echo ".env" >> .gitignore
```

---

## Registering with Mentra OS

### 1. Create an App in Mentra Console

1. Navigate to [console.mentra.glass](https://console.mentra.glass/)
2. Sign in with your Mentra OS account
3. Click **"Create App"**
4. Enter a unique package name (e.g., `com.youfengxu.mentra-dashboard`)
5. For **"Public URL"**, use your ngrok static URL or public server address
6. Click **"Create"** and copy the API key

### 2. Update Your `.env` File

```bash
MENTRAOS_API_KEY="your_api_key_from_console"
PACKAGE_NAME="com.youfengxu.mentra-dashboard"
```

### 3. Import the App Configuration

1. In the Mentra Console, go to **Configuration Management**
2. Click **"Import app_config.json"**
3. Select the `app_config.json` file from the repository root
4. Review the tools and settings:
   - **ask_homelab_assistant**: Routes voice commands to your homelab AI
   - **refresh_dashboard**: Refreshes the webview data

---

## Configuring Data Sources

### Events API

The dashboard can pull upcoming events from an HTTP endpoint or use static JSON.

**Option A: HTTP Endpoint**

```bash
DASHBOARD_EVENTS_URL="https://api.example.com/events"
```

Expected response:

```json
{
  "events": [
    {
      "id": "event-1",
      "title": "Team Sync",
      "startsAt": "2026-05-12T16:00:00Z",
      "endsAt": "2026-05-12T16:30:00Z",
      "location": "Remote",
      "source": "calendar",
      "priority": "normal"
    }
  ]
}
```

**Option B: Static JSON**

```bash
DASHBOARD_EVENTS_JSON='[{"id":"e1","title":"Meeting","startsAt":"2026-05-12T16:00:00Z"}]'
```

### Notifications API

Similar to events, notifications can come from an HTTP endpoint or static JSON.

**Option A: HTTP Endpoint**

```bash
DASHBOARD_NOTIFICATIONS_URL="https://api.example.com/notifications"
```

Expected response:

```json
{
  "notifications": [
    {
      "id": "notification-1",
      "title": "Build Complete",
      "body": "The dashboard app passed typecheck.",
      "timestamp": "2026-05-12T16:00:00Z",
      "source": "homelab",
      "priority": "normal"
    }
  ]
}
```

**Option B: Static JSON**

```bash
DASHBOARD_NOTIFICATIONS_JSON='[{"id":"n1","title":"Alert","body":"System healthy","timestamp":"2026-05-12T16:00:00Z"}]'
```

### RSS Feed

Point to any RSS or Atom feed URL:

```bash
RSS_FEED_URL="https://news.ycombinator.com/rss"
RSS_FEED_LABEL="Hacker News"
```

The dashboard automatically parses and displays the latest items.

---

## Homelab Assistant Integration

### 1. Prepare Your Assistant Endpoint

Your homelab assistant must expose an HTTPS endpoint that accepts JSON POST requests. The endpoint should:

- Accept POST requests with a JSON body containing `prompt`, `userId`, `source`, and `timestamp`
- Return a JSON response with a `reply`, `response`, `text`, or `message` field
- Support optional bearer token authentication
- Handle timeouts gracefully (default 15 seconds)

### 2. Example Assistant Endpoint (Python Flask)

```python
from flask import Flask, request, jsonify
import os

app = Flask(__name__)
TOKEN = os.getenv("ASSISTANT_TOKEN")

@app.route("/api/chat", methods=["POST"])
def chat():
    # Verify bearer token if configured
    auth_header = request.headers.get("Authorization", "")
    if TOKEN and not auth_header.startswith(f"Bearer {TOKEN}"):
        return jsonify({"error": "Unauthorized"}), 401
    
    data = request.json
    prompt = data.get("prompt", "")
    user_id = data.get("userId", "")
    source = data.get("source", "")
    
    # Your AI logic here (e.g., call LLM, query database)
    reply = f"You asked: {prompt}"
    
    return jsonify({"reply": reply})

if __name__ == "__main__":
    app.run(ssl_context="adhoc", host="0.0.0.0", port=5000)
```

### 3. Configure the Dashboard to Use Your Assistant

```bash
HOMELAB_ASSISTANT_URL="https://homelab.example.com:5000/api/chat"
HOMELAB_ASSISTANT_TOKEN="your-secret-token"
ASSISTANT_TIMEOUT_MS="15000"
```

### 4. Test the Connection

Once the dashboard is running, try the voice assistant:

1. Open the dashboard webview in Mentra OS
2. Click the **microphone button** or say **"Mentra, ask assistant"**
3. Speak your question (e.g., "What time is my next meeting?")
4. The dashboard should display the assistant's response

---

## Running the App

### 1. Start the Development Server

```bash
bun run dev
```

The server starts on `http://localhost:3000` (or your configured `PORT`).

### 2. Expose to the Internet with ngrok

In a separate terminal:

```bash
ngrok http --url=<YOUR_NGROK_STATIC_URL> 3000
```

Replace `<YOUR_NGROK_STATIC_URL>` with your static ngrok URL from the dashboard.

### 3. Verify the Server is Running

```bash
curl http://localhost:3000/webview
```

You should receive the dashboard HTML.

---

## Testing the Dashboard

### 1. Access the Dashboard Locally

Open your browser and navigate to:

```
http://localhost:3000/webview
```

You should see:
- **Events panel** (if configured)
- **Notifications panel** (if configured)
- **RSS feed panel** (if configured)
- **Assistant log** and voice input controls

### 2. Test Each Component

| Component | Test Action | Expected Result |
|---|---|---|
| Events | Check if upcoming events display | Events appear with time and location |
| Notifications | Trigger a notification from your source | Notification appears in the list |
| RSS Feed | Check the feed URL | Latest articles display |
| Voice Input | Click microphone and speak | Transcript appears, then assistant responds |
| Text Input | Type a question and press Enter | Assistant responds with an answer |

### 3. Test Voice Assistant Integration

1. Say **"Mentra, ask assistant"** followed by your question
2. The Mentra OS app transcribes your speech
3. The dashboard receives the transcription and routes it to your homelab assistant
4. The response appears in the assistant log

### 4. Monitor Logs

Check the server logs for errors:

```bash
# View recent logs
tail -f .manus-logs/devserver.log
```

---

## Security Best Practices

### 1. Use HTTPS Everywhere

- Always use HTTPS for your homelab assistant endpoint
- Use a self-signed certificate for development, but a valid certificate for production
- Enable HSTS headers to enforce HTTPS

### 2. Protect Your API Keys

- Store `MENTRAOS_API_KEY` and `HOMELAB_ASSISTANT_TOKEN` in environment variables only
- Never commit `.env` to version control
- Rotate tokens regularly
- Use separate tokens for development and production

### 3. Validate Input

The dashboard server validates all incoming requests:

- Event and notification payloads are type-checked
- Assistant prompts are sanitized before display
- RSS feeds are parsed safely

### 4. Rate Limiting

Consider adding rate limiting to your homelab assistant endpoint to prevent abuse:

```python
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

@app.route("/api/chat", methods=["POST"])
@limiter.limit("10 per minute")
def chat():
    # ... your code
```

### 5. CORS Configuration

If your event/notification APIs are on different domains, ensure CORS is properly configured:

```bash
# Example: Allow requests from your Mentra app domain
Access-Control-Allow-Origin: https://your-mentra-domain.com
Access-Control-Allow-Methods: GET, POST
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Troubleshooting

### Issue: Dashboard shows "No upcoming events configured"

**Cause**: Event source is not configured or returning empty data.

**Solution**:
1. Check that `DASHBOARD_EVENTS_URL` or `DASHBOARD_EVENTS_JSON` is set
2. Verify the endpoint is reachable: `curl $DASHBOARD_EVENTS_URL`
3. Ensure the response matches the expected JSON schema
4. Check server logs for parsing errors

### Issue: Voice assistant is not responding

**Cause**: Homelab assistant endpoint is unreachable or misconfigured.

**Solution**:
1. Verify `HOMELAB_ASSISTANT_URL` is correct and HTTPS
2. Test the endpoint manually:
   ```bash
   curl -X POST https://homelab.example.com/api/chat \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $HOMELAB_ASSISTANT_TOKEN" \
     -d '{"prompt":"hello","userId":"test","source":"test"}'
   ```
3. Check that the assistant service is running
4. Verify the bearer token is correct (if required)
5. Check the `ASSISTANT_TIMEOUT_MS` setting (increase if needed)

### Issue: RSS feed is not loading

**Cause**: Feed URL is invalid or the feed is malformed.

**Solution**:
1. Verify the RSS feed URL is correct: `curl $RSS_FEED_URL`
2. Ensure the feed is valid XML/Atom format
3. Check that the feed is publicly accessible
4. Try a different feed URL to test

### Issue: Mentra OS app crashes when opening the webview

**Cause**: Server is not running or the public URL is incorrect.

**Solution**:
1. Verify the server is running: `ps aux | grep bun`
2. Check that ngrok is forwarding correctly: `ngrok status`
3. Verify the public URL in the Mentra Console matches your ngrok URL
4. Check server logs for errors: `tail -f .manus-logs/devserver.log`
5. Restart the server: `bun run dev`

### Issue: "Permission denied" when pushing to GitHub

**Cause**: SSH key is not configured or GitHub authentication failed.

**Solution**:
1. Use the GitHub CLI: `gh auth status`
2. If not authenticated, run: `gh auth login`
3. Or use HTTPS with a personal access token:
   ```bash
   git remote set-url origin https://github.com/Youfengxu/MyMentraOS.git
   ```

### Issue: TypeScript validation fails with "cannot be used as a value"

**Cause**: Incorrect import statement for Express or other modules.

**Solution**:
1. Ensure imports are not marked as `type`-only:
   ```typescript
   // Wrong
   import type express from 'express';
   
   // Correct
   import express from 'express';
   ```
2. Run validation again: `npm run typecheck`

---

## Next Steps

Once your dashboard is deployed and working:

1. **Customize the UI**: Edit `/src/views/webview.ejs` and `/public/css/style.css`
2. **Add more data sources**: Extend `/src/dashboard.ts` to pull from additional APIs
3. **Enhance the assistant**: Improve your homelab assistant's responses
4. **Set up monitoring**: Add logging and alerts for production
5. **Create a CI/CD pipeline**: Automate testing and deployment

---

## Support

For issues or questions:

1. Check the [Mentra OS documentation](https://docs.mentra.glass/)
2. Review the [app_config.json](./app_config.json) for tool definitions
3. Check the [README.md](./README.md) for configuration details
4. Review server logs in `.manus-logs/devserver.log`

---

**Last Updated**: May 12, 2026

**Dashboard Version**: 1.0.0 (test branch)
