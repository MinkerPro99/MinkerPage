import asyncio
import datetime
import os
import tempfile
import textwrap

import numpy as np
import sounddevice as sd
from kokoro_onnx import Kokoro

# ── Voice config ──────────────────────────────────────────────────────────────
VOICE  = "am_michael"   # Deep American male (Kokoro)
SPEED  = 0.9            # Slightly slower for Jarvis calm delivery

# ── Dates ─────────────────────────────────────────────────────────────────────
GTA6_RELEASE = datetime.date(2026, 11, 19)

# ── Ollama config ─────────────────────────────────────────────────────────────
OLLAMA_MODEL   = "llama3.2"
OLLAMA_ENABLED = True        # Set False to skip AI and use the template

# ── Weather ────────────────────────────────────────────────────────────────────
WEATHER_CITY = "Mettmenstetten"      # Change to your city

# ── Calendar ───────────────────────────────────────────────────────────────────
CALENDAR_API = "https://minkerpage.ch/api"
from jarvis.secrets import CALENDAR_USERNAME, CALENDAR_PASSWORD


def _ordinal(n: int) -> str:
    if 11 <= n <= 13:
        return f"{n}th"
    return f"{n}{['th','st','nd','rd','th'][min(n % 10, 4)]}"


def _format_date(d: datetime.date) -> str:
    """e.g. 'Friday, June 5th'"""
    return d.strftime("%A, %B ") + _ordinal(d.day)


def _clean_temperature(raw: str) -> str:
    """Turn '+16°C, feels like +14°C' into '16 degrees, feels like 14 degrees'."""
    import re
    result = re.sub(r'\+(-?\d+)°C', lambda m: f"{m.group(1)} degrees", raw)
    result = re.sub(r'(-\d+)°C', lambda m: f"minus {m.group(1)[1:]} degrees", result)
    return result


def _time_of_day() -> str:
    hour = datetime.datetime.now().hour
    if hour < 12:   return "morning"
    if hour < 17:   return "afternoon"
    if hour < 21:   return "evening"
    return "night"


def _gta6_line() -> str:
    days = (GTA6_RELEASE - datetime.date.today()).days
    if days > 0:
        return f"Grand Theft Auto 6 is releasing in {days} days."
    return "Grand Theft Auto 6 has already been released."


def _template_greeting() -> str:
    """Fallback greeting when Ollama is unavailable."""
    import random
    tod   = _time_of_day()
    gta6  = _gta6_line()
    openers = [
        f"Good {tod}, sir. All subsystems have passed diagnostics. You may proceed.",
        f"Good {tod}, sir. I've been expecting you. Everything is in order.",
        f"Good {tod}, sir. Reactor stable, network secure, and your battlestation is primed.",
    ]
    return f"{random.choice(openers)} {gta6} All systems are online."


def _fetch_weather() -> str:
    """Get today's weather summary via wttr.in."""
    try:
        import requests
        response = requests.get(
            f"https://wttr.in/{WEATHER_CITY}?format=%C,+%t,+feels+like+%f",
            headers={"User-Agent": "curl/7.0"},
            timeout=8,
        )
        return _clean_temperature(response.text.strip())
    except Exception as e:
        print(f"[Jarvis] Weather fetch failed: {e}")
        return ""


def _fetch_calendar_events() -> str:
    """Login to calendar API and fetch upcoming events in the next 7 days."""
    try:
        import requests

        # Log in to get a fresh token
        login = requests.post(
            f"{CALENDAR_API}/auth/login",
            json={"username": CALENDAR_USERNAME, "password": CALENDAR_PASSWORD},
            timeout=10,
        )
        login.raise_for_status()
        token = login.json().get("token")
        if not token:
            print("[Jarvis] Calendar login returned no token.")
            return ""

        # Fetch events for the next 7 days
        today = datetime.date.today()
        end   = today + datetime.timedelta(days=7)
        response = requests.get(
            f"{CALENDAR_API}/events",
            params={"start": today.isoformat(), "end": end.isoformat()},
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        data   = response.json()
        events = data.get("events", [])
        if not events:
            return "No upcoming events in the next 7 days."
        lines = []
        for e in events:
            title = e.get("title", "Untitled")
            start = e.get("start_date", "")
            end_d = e.get("end_date", "")
            desc  = e.get("description", "")
            try:
                # Handle both "2026-06-08" and "2026-06-08T00:00:00" formats
                start_date = datetime.date.fromisoformat(str(start)[:10])
                end_date   = datetime.date.fromisoformat(str(end_d)[:10])
                start_fmt  = _format_date(start_date)
                end_fmt    = _format_date(end_date)
                entry = f"{title} ({start_fmt} to {end_fmt})"
            except (ValueError, TypeError):
                entry = f"{title} ({start} to {end_d})"
            if desc:
                entry += f": {desc}"
            lines.append(entry)
        return "; ".join(lines)
    except Exception as e:
        print(f"[Jarvis] Calendar fetch failed: {e}")
        return ""


def _fetch_gaming_news(n: int = 3) -> str:
    """Grab top n headlines from IGN's RSS feed."""
    try:
        import requests
        import xml.etree.ElementTree as ET
        headers  = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        response = requests.get(
            "https://www.pcgamer.com/rss/",
            headers=headers, timeout=10,
        )
        root  = ET.fromstring(response.content)
        items = root.findall(".//item")[:n]
        headlines = [item.findtext("title", "").strip() for item in items if item.findtext("title")]
        return " | ".join(headlines)
    except Exception as e:
        print(f"[Jarvis] News fetch failed: {e}")
        return ""


def _ai_greeting() -> str:
    """Generate a dynamic greeting via a local Ollama model."""
    try:
        import requests
        tod      = _time_of_day()
        gta6     = _gta6_line()
        news     = _fetch_gaming_news()
        weather  = _fetch_weather()
        calendar = _fetch_calendar_events()
        now      = datetime.datetime.now()
        date_str = _format_date(now.date()) + now.strftime(" at %I:%M %p").lstrip(" 0").replace(" 0", " ")

        news_section     = f"Current gaming headlines: {news}" if news else ""
        weather_section  = f"Today's weather in {WEATHER_CITY}: {weather}" if weather else ""
        calendar_section = f"Upcoming study calendar events (next 7 days): {calendar}" if calendar else ""

        prompt   = textwrap.dedent(f"""
            You are JARVIS, Tony Stark's AI. Write a single short spoken greeting (4-5 sentences, no more).
            Today is {date_str}. Use the exact day names provided for calendar events — do not infer "tomorrow" or "next week" yourself.
            Context you have available (use what's relevant naturally):
            - Current date and time: {date_str}
            - {weather_section}
            - {calendar_section}
            - {news_section}
            - GTA 6 aside: {gta6}
            Rules:
            - Start with "Good {tod}, sir."
            - Naturally mention the date and time early on.
            - Briefly mention the weather in one clause.
            - Summarise the upcoming calendar events conversationally — translate any German titles or descriptions to English naturally.
            - Pick ONE gaming headline and slip it in briefly.
            - You MUST include the GTA 6 fact as a short aside — this is mandatory, do not skip it.
            - End with a short offer of assistance as a statement, not a question.
            - Tone: calm, dry wit, slightly formal. No asterisks, no markdown, plain text only.
        """).strip()

        response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": OLLAMA_MODEL, "prompt": prompt, "stream": False},
            timeout=60,
        )
        response.raise_for_status()
        text = response.json().get("response", "").strip()
        if text:
            return text
    except Exception as e:
        print(f"[Jarvis] Ollama unavailable ({e}), using template.")
    return _template_greeting()


def build_greeting() -> str:
    return _ai_greeting() if OLLAMA_ENABLED else _template_greeting()


def speak(text: str) -> None:
    kokoro = Kokoro("jarvis/kokoro-v1.0.onnx", "jarvis/voices-v1.0.bin")
    samples, sample_rate = kokoro.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    sd.play(samples, sample_rate)
    sd.wait()


def main() -> None:
    print("[Jarvis] Generating greeting...")
    greeting = build_greeting()
    print(f"[Jarvis] {greeting}\n")
    speak(greeting)


if __name__ == "__main__":
    main()
