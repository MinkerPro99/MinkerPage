import argparse
import json
import os
import re
import subprocess
import sys
import webbrowser
from pathlib import Path
from urllib.parse import quote_plus


BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "pc_agent_config.json"
EXAMPLE_CONFIG_PATH = BASE_DIR / "pc_agent_config.example.json"

SAFE_ACTIONS = {
    "open_app",
    "open_url",
    "web_search",
    "youtube_search",
    "youtube_channel",
    "open_folder",
    "run_script",
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


def load_config() -> dict:
    path = CONFIG_PATH if CONFIG_PATH.exists() else EXAMPLE_CONFIG_PATH
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


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
    command = normalize(text)

    if re.search(r"\b(lock|lock screen)\b", command):
        return {"type": "lock_pc"}

    if re.search(r"\b(shut down|shutdown|power off)\b", command):
        if "setup" in command or "power" in command:
            return {"type": "run_script", "script": "shutdown setup"}
        return {"type": "shutdown_pc"}

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
    action_type = action.get("type")
    if action_type not in SAFE_ACTIONS:
        raise AgentError(f"Action type is not allowed: {action_type}")

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


def launch(command: list[str], dry_run: bool) -> dict:
    if not command:
        raise AgentError("Empty launch command")
    if dry_run:
        return {"ok": True, "would_run": command}
    subprocess.Popen(command, cwd=str(BASE_DIR), shell=False)
    return {"ok": True, "started": command}


def main() -> int:
    parser = argparse.ArgumentParser(description="Jarvis PC command agent")
    parser.add_argument("--text", help="Natural language command to classify and execute")
    parser.add_argument("--action", help="JSON action to execute directly")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen without executing")
    args = parser.parse_args()

    config = load_config()

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


if __name__ == "__main__":
    raise SystemExit(main())
