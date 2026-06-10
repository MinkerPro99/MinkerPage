import argparse
import json
import os
import re
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from urllib.parse import quote_plus

import requests


BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
CONFIG_PATH = BASE_DIR / "pc_agent_config.json"
EXAMPLE_CONFIG_PATH = BASE_DIR / "pc_agent_config.example.json"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
DEFAULT_BRIDGE_URL = "https://minkerpage.ch/api/ignite-setup"

SAFE_ACTIONS = {
    "open_app",
    "open_url",
    "web_search",
    "youtube_search",
    "youtube_channel",
    "open_folder",
    "run_script",
    "sort_folder",
    "shutdown_pc",
    "lock_pc",
}

SITE_ALIASES = {
    "youtube": "https://www.youtube.com",
    "you tube": "https://www.youtube.com",
    "twitch": "https://www.twitch.tv",
    "reddit": "https://www.reddit.com",
    "github": "https://github.com",
    "gmail": "https://mail.google.com",
    "google mail": "https://mail.google.com",
    "google": "https://www.google.com",
    "chatgpt": "https://chatgpt.com",
    "netflix": "https://www.netflix.com",
    "spotify": "https://open.spotify.com",
    "steam": "https://store.steampowered.com",
}


class AgentError(Exception):
    pass


def load_env_files() -> None:
    for path in (PROJECT_DIR / ".env", BASE_DIR / ".env"):
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def load_config() -> dict:
    path = CONFIG_PATH if CONFIG_PATH.exists() else EXAMPLE_CONFIG_PATH
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def configured_names(config: dict, key: str) -> list[str]:
    return sorted(config.get(key, {}).keys())


def expand_path(value: str) -> str:
    expanded = os.path.expandvars(value)
    return expanded.replace("%CD%", str(BASE_DIR))


def split_command_line(command: str) -> list[str]:
    # Config entries are trusted local data; this keeps quoted paths intact.
    import shlex

    expanded = expand_path(command)
    exe_match = re.match(r"^(.+?\.exe)(?:\s+(.*))?$", expanded, flags=re.IGNORECASE)
    if exe_match:
        exe = exe_match.group(1).strip('"')
        args = shlex.split(exe_match.group(2) or "", posix=False)
        return [exe] + args
    return shlex.split(expanded, posix=False)


def first_existing_command(candidates: list[str]) -> list[str]:
    for candidate in candidates:
        parts = split_command_line(candidate)
        if not parts:
            continue
        exe = parts[0].strip('"')
        if Path(exe).exists():
            return parts
    raise AgentError(f"No configured executable was found: {candidates}")


def first_configured_command(candidates: list[str]) -> list[str]:
    if not candidates:
        return []
    return split_command_line(candidates[0])


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def classify_command(text: str, config: dict) -> dict:
    groq_action = classify_command_with_groq(text, config)
    if groq_action:
        return groq_action
    return classify_command_with_rules(text, config)


def classify_command_with_groq(text: str, config: dict) -> dict | None:
    groq_key = os.getenv("GROQ_API_KEY", "")
    if not groq_key:
        return None

    prompt = f"""
You are the planner for a local Windows PC assistant named Jarvis.
Return exactly one JSON object and nothing else.

Allowed action types and schemas:
- {{"type":"open_app","app":"one configured app name"}}
- {{"type":"open_url","url":"https://...","browser":"optional configured browser app name"}}
- {{"type":"web_search","query":"..."}}
- {{"type":"youtube_search","query":"..."}}
- {{"type":"youtube_channel","channel":"..."}}
- {{"type":"open_folder","folder":"one configured folder name"}}
- {{"type":"run_script","script":"one configured script name"}}
- {{"type":"sort_folder","folder":"one configured folder name","mode":"by_type"}}
- {{"type":"shutdown_pc"}}
- {{"type":"lock_pc"}}

Configured apps: {configured_names(config, "apps")}
Configured folders: {configured_names(config, "folders")}
Configured scripts: {configured_names(config, "scripts")}

Rules:
- Use only the allowed action types.
- Do not invent local file paths.
- Prefer configured apps/folders/scripts when the user names one.
- For websites not listed in config, infer a normal public URL, e.g. "open twitch" -> "https://www.twitch.tv".
- "Sort my downloads folder" means {{"type":"sort_folder","folder":"downloads","mode":"by_type"}}.
- If the user asks for unsafe filesystem changes such as deleting files, return {{"type":"unsupported","reason":"..."}}.

User command: {text}
""".strip()

    try:
        response = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
            json={
                "model": GROQ_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "max_tokens": 250,
                "response_format": {"type": "json_object"},
            },
            timeout=12,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        action = json.loads(content)
        if action.get("type") == "unsupported":
            raise AgentError(action.get("reason", "Command is unsupported"))
        return validate_action(action, config)
    except AgentError:
        raise
    except Exception as error:
        print(f"[Jarvis PC Agent] Groq planner unavailable, falling back to rules: {error}", file=sys.stderr)
        return None


def validate_action(action: dict, config: dict) -> dict:
    action_type = action.get("type")
    if action_type not in SAFE_ACTIONS:
        raise AgentError(f"Action type is not allowed: {action_type}")

    if action_type == "open_app":
        action["app"] = normalize(action.get("app", ""))
        if action["app"] not in config.get("apps", {}):
            raise AgentError(f"App is not configured: {action['app']}")

    if action_type == "open_folder":
        action["folder"] = normalize(action.get("folder", ""))
        if action["folder"] not in config.get("folders", {}):
            raise AgentError(f"Folder is not configured: {action['folder']}")

    if action_type == "sort_folder":
        action["folder"] = normalize(action.get("folder", ""))
        action["mode"] = action.get("mode") or "by_type"
        if action["folder"] not in config.get("folders", {}):
            raise AgentError(f"Folder is not configured: {action['folder']}")
        if action["mode"] != "by_type":
            raise AgentError(f"Sort mode is not allowed: {action['mode']}")

    if action_type == "run_script":
        action["script"] = normalize(action.get("script", ""))
        if action["script"] not in config.get("scripts", {}):
            raise AgentError(f"Script is not configured: {action['script']}")

    if action_type == "open_url":
        action["url"] = ensure_url(action.get("url", ""))
        if action.get("browser"):
            action["browser"] = normalize(action["browser"])

    return action


def classify_command_with_rules(text: str, config: dict) -> dict:
    command = normalize(text)

    if re.search(r"\b(lock|lock screen)\b", command):
        return {"type": "lock_pc"}

    if re.search(r"\b(shut down|shutdown|power off)\b", command):
        if "setup" in command or "power" in command:
            return {"type": "run_script", "script": "shutdown setup"}
        return {"type": "shutdown_pc"}

    if re.search(r"\b(sort|organize|organise|clean up)\b", command):
        for folder_name in sorted(config.get("folders", {}), key=len, reverse=True):
            if folder_name in command:
                return {"type": "sort_folder", "folder": folder_name, "mode": "by_type"}

    youtube_match = re.search(r"(?:youtube|you tube).*?(?:channel|locate|find|search for|search)\s+(.+)$", command)
    if youtube_match:
        query = cleanup_query(youtube_match.group(1))
        if "channel" in command or "locate" in command or "minkerpro99" in query.lower():
            return {"type": "youtube_channel", "channel": query}
        return {"type": "youtube_search", "query": query}

    if "youtube" in command or "you tube" in command:
        return {"type": "open_url", "url": "https://www.youtube.com", "browser": config["defaults"].get("browser")}

    site_action = classify_site_command(command, config)
    if site_action:
        return site_action

    for app_name in sorted(config.get("apps", {}), key=len, reverse=True):
        if app_name in command:
            return {"type": "open_app", "app": app_name}

    for folder_name in sorted(config.get("folders", {}), key=len, reverse=True):
        if folder_name in command:
            return {"type": "open_folder", "folder": folder_name}

    search_match = re.search(r"(?:search|google|look up)\s+(.+)$", command)
    if search_match:
        return {"type": "web_search", "query": cleanup_query(search_match.group(1))}

    open_url_match = re.search(r"(?:open|visit|go to)\s+((?:https?://)?[\w.-]+\.[a-z]{2,}.*)$", command)
    if open_url_match:
        return {"type": "open_url", "url": ensure_url(open_url_match.group(1))}

    raise AgentError(f"I do not know how to safely execute: {text}")


def classify_site_command(command: str, config: dict) -> dict | None:
    open_match = re.search(r"\b(?:open|visit|go to|navigate to|load)\s+(.+)$", command)
    if not open_match:
        return None

    target = cleanup_target(open_match.group(1), config)
    if not target:
        return None

    browser = config["defaults"].get("browser")
    if target in config.get("apps", {}):
        return {"type": "open_app", "app": target}

    return {"type": "open_url", "url": resolve_site_url(target), "browser": browser}


def cleanup_target(value: str, config: dict) -> str:
    value = re.sub(r"\b(?:in|on|with|using)\s+(?:" + "|".join(re.escape(k) for k in config.get("apps", {})) + r")\b", "", value, flags=re.IGNORECASE)
    value = re.sub(r"\b(?:please|website|site|page|app)\b", "", value, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", value).strip(" .")


def resolve_site_url(target: str) -> str:
    normalized = normalize(target).lstrip("@")
    if normalized in SITE_ALIASES:
        return SITE_ALIASES[normalized]
    if re.match(r"^https?://", target, flags=re.IGNORECASE):
        return target
    if re.match(r"^[\w.-]+\.[a-z]{2,}(?:/.*)?$", target, flags=re.IGNORECASE):
        return ensure_url(target)
    slug = re.sub(r"[^a-z0-9-]+", "", normalized.replace(" ", ""))
    if slug:
        return f"https://www.{slug}.com"
    raise AgentError(f"Could not resolve website: {target}")


def cleanup_query(value: str) -> str:
    value = re.sub(r"\b(on|in|with|using|please)\b", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"^\s*(?:the\s+)?channel\s+", "", value, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", value).strip(" .")


def ensure_url(url: str) -> str:
    if re.match(r"^https?://", url, flags=re.IGNORECASE):
        return url
    return f"https://{url}"


def browser_command(config: dict, browser_name: str | None, url: str, dry_run: bool = False) -> list[str] | None:
    if not browser_name:
        return None
    apps = config.get("apps", {})
    if browser_name not in apps:
        return None
    command = first_configured_command(apps[browser_name]) if dry_run else first_existing_command(apps[browser_name])
    return command + [url]


def execute_action(action: dict, config: dict, dry_run: bool = False) -> dict:
    action = validate_action(action, config)
    action_type = action.get("type")

    if action_type == "open_app":
        app = normalize(action.get("app", ""))
        candidates = config.get("apps", {}).get(app, [])
        command = first_configured_command(candidates) if dry_run else first_existing_command(candidates)
        return launch(command, dry_run)

    if action_type == "open_folder":
        folder = normalize(action.get("folder", ""))
        path = expand_path(config.get("folders", {}).get(folder, ""))
        if not path or not Path(path).exists():
            raise AgentError(f"Folder is not configured or missing: {folder}")
        return launch(["explorer.exe", path], dry_run)

    if action_type == "run_script":
        script = normalize(action.get("script", ""))
        command = config.get("scripts", {}).get(script)
        if not command:
            raise AgentError(f"Script is not configured: {script}")
        return launch(split_command_line(command), dry_run)

    if action_type == "sort_folder":
        return sort_folder(config, action["folder"], dry_run)

    if action_type == "open_url":
        url = ensure_url(action["url"])
        command = browser_command(config, action.get("browser") or config["defaults"].get("browser"), url, dry_run)
        if command:
            return launch(command, dry_run)
        if dry_run:
            return {"ok": True, "would_open": url}
        webbrowser.open(url)
        return {"ok": True, "opened": url}

    if action_type == "web_search":
        query = action["query"]
        template = config["defaults"].get("search_engine", "https://www.google.com/search?q={query}")
        return execute_action({"type": "open_url", "url": template.format(query=quote_plus(query))}, config, dry_run)

    if action_type == "youtube_search":
        query = quote_plus(action["query"])
        url = f"https://www.youtube.com/results?search_query={query}"
        return execute_action({"type": "open_url", "url": url, "browser": config["defaults"].get("browser")}, config, dry_run)

    if action_type == "youtube_channel":
        channel = action["channel"].strip().lstrip("@")
        url = f"https://www.youtube.com/@{quote_plus(channel)}"
        return execute_action({"type": "open_url", "url": url, "browser": config["defaults"].get("browser")}, config, dry_run)

    if action_type == "lock_pc":
        return launch(["rundll32.exe", "user32.dll,LockWorkStation"], dry_run)

    if action_type == "shutdown_pc":
        return launch(["C:\\Windows\\System32\\shutdown.exe", "/s", "/t", "0"], dry_run)

    raise AgentError(f"Unhandled action: {action_type}")


def sort_folder(config: dict, folder_name: str, dry_run: bool) -> dict:
    root = Path(expand_path(config["folders"][folder_name])).resolve()
    if not root.exists() or not root.is_dir():
        raise AgentError(f"Folder does not exist: {root}")

    categories = config.get("sort_categories", default_sort_categories())
    planned = []

    for item in root.iterdir():
        if not item.is_file():
            continue
        category = category_for_file(item, categories)
        destination_dir = root / category
        destination = unique_destination(destination_dir / item.name)
        if item.resolve() == destination.resolve():
            continue
        planned.append({"from": str(item), "to": str(destination)})

    if dry_run:
        return {"ok": True, "planned_count": len(planned), "preview": planned[:25]}

    for move in planned:
        destination = Path(move["to"])
        destination.parent.mkdir(exist_ok=True)
        Path(move["from"]).replace(destination)

    return {"ok": True, "moved": len(planned)}


def default_sort_categories() -> dict:
    return {
        "Images": [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"],
        "Documents": [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md"],
        "Videos": [".mp4", ".mkv", ".mov", ".avi", ".webm"],
        "Audio": [".mp3", ".wav", ".flac", ".m4a", ".ogg"],
        "Archives": [".zip", ".rar", ".7z", ".tar", ".gz"],
        "Installers": [".exe", ".msi", ".dmg", ".iso"],
        "Code": [".py", ".js", ".ts", ".html", ".css", ".json", ".xml", ".yml", ".yaml"],
        "Other": [],
    }


def category_for_file(path: Path, categories: dict) -> str:
    suffix = path.suffix.lower()
    for category, extensions in categories.items():
        if suffix in [ext.lower() for ext in extensions]:
            return category
    return "Other"


def unique_destination(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 2
    while True:
        candidate = parent / f"{stem} ({counter}){suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def launch(command: list[str], dry_run: bool) -> dict:
    if not command:
        raise AgentError("Empty launch command")
    if dry_run:
        return {"ok": True, "would_run": command}
    subprocess.Popen(command, cwd=str(BASE_DIR), shell=False)
    return {"ok": True, "started": command}


def main() -> int:
    load_env_files()
    parser = argparse.ArgumentParser(description="Jarvis PC command agent")
    parser.add_argument("--text", help="Natural language command to classify and execute")
    parser.add_argument("--action", help="JSON action to execute directly")
    parser.add_argument("--listen", action="store_true", help="Poll the Jarvis server for commands")
    parser.add_argument("--server", default=os.getenv("JARVIS_BRIDGE_URL", DEFAULT_BRIDGE_URL), help="Jarvis bridge base URL")
    parser.add_argument("--token", default=os.getenv("JARVIS_COMMAND_TOKEN", ""), help="Jarvis command bridge token")
    parser.add_argument("--interval", type=float, default=float(os.getenv("JARVIS_POLL_INTERVAL", "2.0")), help="Polling interval in seconds")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen without executing")
    args = parser.parse_args()

    config = load_config()

    if args.listen:
        return listen_for_commands(config, args.server, args.token, args.interval, args.dry_run)

    try:
        if args.action:
            action = json.loads(args.action)
        elif args.text:
            action = classify_command(args.text, config)
        else:
            parser.error("Provide --text or --action")

        result = execute_action(action, config, args.dry_run)
        print(json.dumps({"ok": True, "action": action, "result": result}, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, indent=2), file=sys.stderr)
        return 1


def bridge_headers(token: str) -> dict:
    if not token:
        raise AgentError("JARVIS_COMMAND_TOKEN is missing")
    return {"X-Jarvis-Token": token}


def listen_for_commands(config: dict, server: str, token: str, interval: float, dry_run: bool) -> int:
    server = server.rstrip("/")
    print(f"[Jarvis PC Agent] Listening at {server}")

    while True:
        try:
            response = requests.get(
                f"{server}/agent/poll",
                headers=bridge_headers(token),
                timeout=20,
            )
            response.raise_for_status()
            command = response.json().get("command")
            if not command:
                time.sleep(interval)
                continue

            command_id = command["id"]
            text = command["text"]
            print(f"[Jarvis PC Agent] Command {command_id}: {text}")
            result_payload = handle_remote_command(text, config, dry_run)
            result_payload["commandId"] = command_id

            requests.post(
                f"{server}/agent/result",
                headers=bridge_headers(token),
                json=result_payload,
                timeout=20,
            ).raise_for_status()
        except KeyboardInterrupt:
            print("\n[Jarvis PC Agent] Stopped.")
            return 0
        except Exception as error:
            print(f"[Jarvis PC Agent] Bridge error: {error}", file=sys.stderr)
            time.sleep(max(interval, 5))


def handle_remote_command(text: str, config: dict, dry_run: bool) -> dict:
    try:
        action = classify_command(text, config)
        result = execute_action(action, config, dry_run)
        return {"ok": True, "action": action, "result": result}
    except Exception as error:
        return {"ok": False, "error": str(error)}


if __name__ == "__main__":
    raise SystemExit(main())
