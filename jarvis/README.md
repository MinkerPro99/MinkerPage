# Jarvis PC Agent

Local Windows command agent for Jarvis.

## Local Test

```powershell
.\.venv\Scripts\python.exe jarvis\pc_agent.py --dry-run --text "open twitch"
.\.venv\Scripts\python.exe jarvis\pc_agent.py --dry-run --text "sort my downloads folder"
.\.venv\Scripts\python.exe jarvis\pc_agent.py --text "open twitch"
```

## Groq Planner

For smarter command planning, create `jarvis\.env`:

```env
GROQ_API_KEY=your_key_here
JARVIS_COMMAND_TOKEN=same_secret_as_server
JARVIS_BRIDGE_URL=https://minkerpage.ch/api/ignite-setup
```

Without the key, the agent falls back to local rules.

## Listen For Server Commands

```powershell
.\.venv\Scripts\python.exe jarvis\pc_agent.py --listen
```

Test by posting a command to the server:

```powershell
$token = "same_secret_as_server"
Invoke-RestMethod -Method Post `
  -Uri "https://minkerpage.ch/api/ignite-setup/command" `
  -Headers @{ "X-Jarvis-Token" = $token } `
  -ContentType "application/json" `
  -Body '{"text":"open twitch"}'
```

## Private Config

Copy `pc_agent_config.example.json` to `pc_agent_config.json` and adjust app/folder/script paths.
The private config is ignored by git.

## Supported Action Types

- `open_app`
- `open_url`
- `web_search`
- `youtube_search`
- `youtube_channel`
- `open_folder`
- `run_script`
- `sort_folder`
- `shutdown_pc`
- `lock_pc`
