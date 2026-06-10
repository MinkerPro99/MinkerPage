# Jarvis PC Agent

Local Windows command agent for Jarvis.

## Local Test

```powershell
.\.venv\Scripts\python.exe jarvis\pc_agent.py --dry-run --text "open twitch"
.\.venv\Scripts\python.exe jarvis\pc_agent.py --text "open twitch"
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
- `shutdown_pc`
- `lock_pc`

