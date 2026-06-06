import asyncio
import datetime as dt
import io
import os
import re
import secrets
from datetime import datetime
from typing import Any

# Load .env if present
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())

import requests as http_requests
from flask import Flask, jsonify, request, send_file
from mysql.connector import Error, pooling
from werkzeug.security import check_password_hash, generate_password_hash

#TEST
# DB_CONFIG = {
#     "host": os.getenv("DB_HOST", "127.0.0.1"),
#     "port": int(os.getenv("DB_PORT", "3306")),
#     "user": os.getenv("DB_USER", "root"),
#     "password": os.getenv("DB_PASSWORD", "Init1234"),
#     "database": os.getenv("DB_NAME", "minker_calendar_test"),
# }

#PROD
DB_CONFIG = {
    "host": os.getenv("DB_HOST", "127.0.0.1"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER", "minker_api2"),
    "password": os.getenv("DB_PASSWORD", "Init.12345!"),
    "database": os.getenv("DB_NAME", "minker_calendar_prod2"),
}

APP_PORT = int(os.getenv("APP_PORT", "5050"))
TOKEN_DAYS = int(os.getenv("TOKEN_DAYS", "30"))

app = Flask(__name__)

pool = pooling.MySQLConnectionPool(
    pool_name="minker_calendar_pool",
    pool_size=5,
    **DB_CONFIG,
)


def json_error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


def parse_iso_date(date_value: str) -> datetime.date:
    return datetime.strptime(date_value, "%Y-%m-%d").date()


def parse_bearer_token() -> str | None:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    return auth.split(" ", 1)[1].strip() or None


def get_authenticated_user_id() -> int | None:
    token = parse_bearer_token()
    if not token:
        return None

    conn = None
    cursor = None
    try:
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT user_id
            FROM auth_tokens
            WHERE token = %s
              AND expires_at > UTC_TIMESTAMP()
            LIMIT 1
            """,
            (token,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return int(row["user_id"])
    except Error:
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


def require_auth_user_id() -> int:
    user_id = get_authenticated_user_id()
    if not user_id:
        raise PermissionError("Unauthorized")
    return user_id


@app.after_request
def add_cors_headers(response):
    # Allows local browser testing from static pages while developing.
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        return ("", 204)
    return None


@app.route("/api/health-db", methods=["GET"])
def health_db():
    try:
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT 1 AS ok, CURRENT_TIMESTAMP AS now_ts")
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return jsonify({"ok": True, "db": row})
    except Error as exc:
        return json_error(f"DB connection failed: {exc}", 500)


@app.route("/api/auth/register", methods=["POST"])
def register_user():
    data: dict[str, Any] = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    if len(username) < 3:
        return json_error("username must be at least 3 characters")
    if len(password) < 6:
        return json_error("password must be at least 6 characters")

    conn = None
    cursor = None
    try:
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("SELECT user_id FROM users WHERE username = %s LIMIT 1", (username,))
        if cursor.fetchone():
            return json_error("username already exists", 409)

        pwd_hash = generate_password_hash(password)
        cursor.execute(
            """
            INSERT INTO users (username, password_hash)
            VALUES (%s, %s)
            """,
            (username, pwd_hash),
        )
        conn.commit()
        return jsonify({"ok": True, "user_id": cursor.lastrowid, "username": username}), 201
    except Error as exc:
        return json_error(f"Failed to register user: {exc}", 500)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/api/auth/login", methods=["POST"])
def login_user():
    data: dict[str, Any] = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    conn = None
    cursor = None
    try:
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT user_id, username, password_hash
            FROM users
            WHERE username = %s
            LIMIT 1
            """,
            (username,),
        )
        row = cursor.fetchone()
        if not row or not check_password_hash(row["password_hash"], password):
            return json_error("invalid username or password", 401)

        token = secrets.token_urlsafe(48)
        cursor.execute(
            """
            INSERT INTO auth_tokens (user_id, token, expires_at)
            VALUES (%s, %s, DATE_ADD(UTC_TIMESTAMP(), INTERVAL %s DAY))
            """,
            (row["user_id"], token, TOKEN_DAYS),
        )
        conn.commit()

        return jsonify(
            {
                "ok": True,
                "token": token,
                "expires_in_days": TOKEN_DAYS,
                "user": {"user_id": row["user_id"], "username": row["username"]},
            }
        )
    except Error as exc:
        return json_error(f"Failed to login: {exc}", 500)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/api/auth/me", methods=["GET"])
def who_am_i():
    user_id = get_authenticated_user_id()
    if not user_id:
        return json_error("Unauthorized", 401)

    conn = None
    cursor = None
    try:
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT user_id, username, created_at FROM users WHERE user_id = %s LIMIT 1",
            (user_id,),
        )
        row = cursor.fetchone()
        if not row:
            return json_error("User not found", 404)
        return jsonify({"ok": True, "user": row})
    except Error as exc:
        return json_error(f"Failed to fetch profile: {exc}", 500)
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


@app.route("/api/events", methods=["GET"])
def list_events():
    try:
        user_id = require_auth_user_id()
    except PermissionError:
        return json_error("Unauthorized", 401)

    start = request.args.get("start")
    end = request.args.get("end")

    try:
        conn = pool.get_connection()
        cursor = conn.cursor(dictionary=True)

        if start and end:
            parse_iso_date(start)
            parse_iso_date(end)
            sql = """
                SELECT event_id, title, start_date, end_date, description, color_hex, created_at, updated_at
                FROM calendar_events
                WHERE user_id = %s
                  AND start_date <= %s
                  AND end_date >= %s
                ORDER BY start_date, event_id
            """
            cursor.execute(sql, (user_id, end, start))
        else:
            sql = """
                SELECT event_id, title, start_date, end_date, description, color_hex, created_at, updated_at
                FROM calendar_events
                WHERE user_id = %s
                ORDER BY start_date, event_id
            """
            cursor.execute(sql, (user_id,))

        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify({"ok": True, "events": rows})
    except ValueError:
        return json_error("Invalid date format. Use YYYY-MM-DD.")
    except Error as exc:
        return json_error(f"Failed to fetch events: {exc}", 500)


@app.route("/api/events", methods=["POST"])
def create_event():
    try:
        user_id = require_auth_user_id()
    except PermissionError:
        return json_error("Unauthorized", 401)

    data: dict[str, Any] = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    description = data.get("description")
    color_hex = data.get("color_hex")

    if not title:
        return json_error("title is required")
    if not start_date:
        return json_error("start_date is required")
    if not end_date:
        end_date = start_date

    try:
        s_date = parse_iso_date(start_date)
        e_date = parse_iso_date(end_date)
        if e_date < s_date:
            return json_error("end_date must be >= start_date")

        conn = pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO calendar_events (user_id, title, start_date, end_date, description, color_hex)
            VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (user_id, title, start_date, end_date, description, color_hex),
        )
        conn.commit()
        new_id = cursor.lastrowid
        cursor.close()
        conn.close()
        return jsonify({"ok": True, "event_id": new_id}), 201
    except ValueError:
        return json_error("Invalid date format. Use YYYY-MM-DD.")
    except Error as exc:
        return json_error(f"Failed to create event: {exc}", 500)


@app.route("/api/events/<int:event_id>", methods=["PUT"])
def update_event(event_id: int):
    try:
        user_id = require_auth_user_id()
    except PermissionError:
        return json_error("Unauthorized", 401)

    data: dict[str, Any] = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    description = data.get("description")
    color_hex = data.get("color_hex")

    if not title:
        return json_error("title is required")
    if not start_date:
        return json_error("start_date is required")
    if not end_date:
        end_date = start_date

    try:
        s_date = parse_iso_date(start_date)
        e_date = parse_iso_date(end_date)
        if e_date < s_date:
            return json_error("end_date must be >= start_date")

        conn = pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE calendar_events
            SET title = %s, start_date = %s, end_date = %s, description = %s, color_hex = %s
            WHERE event_id = %s AND user_id = %s
            """,
            (title, start_date, end_date, description, color_hex, event_id, user_id),
        )
        conn.commit()
        updated_rows = cursor.rowcount
        cursor.close()
        conn.close()

        if updated_rows == 0:
            return json_error("Event not found", 404)

        return jsonify({"ok": True, "updated": True})
    except ValueError:
        return json_error("Invalid date format. Use YYYY-MM-DD.")
    except Error as exc:
        return json_error(f"Failed to update event: {exc}", 500)


@app.route("/api/events/<int:event_id>", methods=["DELETE"])
def delete_event(event_id: int):
    try:
        user_id = require_auth_user_id()
    except PermissionError:
        return json_error("Unauthorized", 401)

    try:
        conn = pool.get_connection()
        cursor = conn.cursor()
        cursor.execute(
            "DELETE FROM calendar_events WHERE event_id = %s AND user_id = %s",
            (event_id, user_id),
        )
        conn.commit()
        deleted_rows = cursor.rowcount
        cursor.close()
        conn.close()

        if deleted_rows == 0:
            return json_error("Event not found", 404)

        return jsonify({"ok": True, "deleted": True})
    except Error as exc:
        return json_error(f"Failed to delete event: {exc}", 500)


# ── Jarvis TTS preview ────────────────────────────────────────────────────────

JARVIS_VOICE   = "en-US-ChristopherNeural"
JARVIS_RATE    = "-10%"
JARVIS_PITCH   = "-5Hz"
WEATHER_CITY   = "Mettmenstetten"
GTA6_RELEASE   = dt.date(2026, 11, 19)

MODULE_NAMES = {
    "M": "Math", "F": "French", "D": "German",
    "GS": "History", "Phys": "Physics", "E": "English",
}

def _jarvis_ordinal(n: int) -> str:
    if 11 <= n <= 13: return f"{n}th"
    return f"{n}{['th','st','nd','rd','th'][min(n % 10, 4)]}"

def _jarvis_format_date(d: dt.date) -> str:
    return d.strftime("%A, %B ") + _jarvis_ordinal(d.day)

def _jarvis_expand_title(title: str) -> str:
    title = re.sub(r'\bM(\d+)\b', lambda m: f"IT Module {m.group(1)}", title)
    title = re.sub(
        r'\b(' + '|'.join(re.escape(k) for k in sorted(MODULE_NAMES, key=len, reverse=True)) + r')\b(?= -| –|$)',
        lambda m: MODULE_NAMES[m.group(1)], title
    )
    for de, en in {"Prüfung": "Exam", "Aufgaben": "Tasks", "erstellen": "create",
                   "abgeben": "submit", "Kapitel": "Chapter", "Rotes buch": "Red book", "und": "and"}.items():
        title = re.sub(re.escape(de), en, title, flags=re.IGNORECASE)
    return title

def _jarvis_weather() -> str:
    try:
        r = http_requests.get(
            f"https://wttr.in/{WEATHER_CITY}?format=%C,+%t,+feels+like+%f",
            headers={"User-Agent": "curl/7.0"}, timeout=8
        )
        raw = r.text.strip()
        raw = re.sub(r'\+(-?\d+)°C', lambda m: f"{m.group(1)} degrees", raw)
        raw = re.sub(r'(-\d+)°C', lambda m: f"minus {m.group(1)[1:]} degrees", raw)
        return raw
    except Exception:
        return ""

def _jarvis_calendar(user_id: int) -> str:
    try:
        today = dt.date.today()
        end   = today + dt.timedelta(days=7)
        conn   = pool.get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT title, start_date, description FROM calendar_events
            WHERE user_id = %s AND start_date >= %s AND start_date <= %s
            ORDER BY start_date, event_id
        """, (user_id, today.isoformat(), end.isoformat()))
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        if not rows:
            return "No upcoming events in the next 7 days."
        lines = []
        for row in rows:
            title = _jarvis_expand_title(row["title"])
            d     = row["start_date"]
            date  = d.date() if hasattr(d, 'date') else dt.date.fromisoformat(str(d)[:10])
            lines.append(f"{_jarvis_format_date(date)}: {title}")
        return "\n".join(f"- {l}" for l in lines)
    except Exception as e:
        return ""

def _jarvis_build_script(user_id: int) -> str:
    now      = dt.datetime.now()
    hour     = now.hour
    tod      = "morning" if hour < 12 else "afternoon" if hour < 17 else "evening" if hour < 21 else "night"
    day_str  = _jarvis_format_date(now.date()) + now.strftime(" at %I:%M %p").replace(" 0", " ").lstrip()
    days     = (GTA6_RELEASE - now.date()).days
    gta6     = f"Grand Theft Auto 6 is releasing in {days} days." if days > 0 else "Grand Theft Auto 6 has already been released."
    weather  = _jarvis_weather()
    calendar = _jarvis_calendar(user_id)

    groq_key = os.getenv("GROQ_API_KEY", "")
    if groq_key:
        try:
            news = _jarvis_fetch_news()
            news_section     = f"Current gaming headlines: {news}" if news else ""
            weather_section  = f"Today's weather in {WEATHER_CITY}: {weather}" if weather else ""
            calendar_section = f"Upcoming study calendar events (next 7 days):\n{calendar}"
            prompt = f"""You are JARVIS, Tony Stark's AI. Write a single short spoken greeting (4-5 sentences, no more).
Today is {day_str}. Use the exact day names provided for calendar events — do not infer "tomorrow" or "next week" yourself.
Context:
- Current date and time: {day_str}
- {weather_section}
- {calendar_section}
- {news_section}
- GTA 6 aside: {gta6}
Rules:
            - Start with "Good {tod} sir."
            - You MUST say that all systems are online, as you run after system start.
            - Naturally mention the date and time early on.
            - Briefly mention the weather in one clause.
            - Read out ALL calendar events listed, grouped by day, using the exact day names given. Do not skip any.
            - Pick ONE gaming headline and slip it in briefly.
            - You MUST include the GTA 6 fact as a short aside — this is mandatory, do not skip it.
            - End with a short offer of assistance as a statement, not a question.
            - Tone: calm, dry wit, slightly formal. No asterisks, no markdown, plain text only."""

            resp = http_requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json={"model": "llama-3.1-8b-instant", "messages": [{"role": "user", "content": prompt}], "max_tokens": 400},
                timeout=15,
            )
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"].strip()
            if text:
                return text
        except Exception as e:
            print(f"[Jarvis] Groq failed: {e}")

    # Fallback template
    import random
    openers = [
        f"Good {tod}, sir. It is {day_str}.",
        f"Good {tod}, sir. I've been expecting you. It is {day_str}.",
    ]
    parts = [random.choice(openers)]
    if weather:
        parts.append(f"Weather in {WEATHER_CITY}: {weather}.")
    parts.append(f"Upcoming schedule: {calendar}")
    parts.append(gta6)
    parts.append("All systems online.")
    return "  ".join(parts)


def _jarvis_fetch_news(n: int = 3) -> str:
    try:
        import xml.etree.ElementTree as ET
        r     = http_requests.get("https://www.pcgamer.com/rss/", headers={"User-Agent": "Mozilla/5.0"}, timeout=8)
        root  = ET.fromstring(r.content)
        items = root.findall(".//item")[:n]
        return " | ".join(i.findtext("title", "").strip() for i in items if i.findtext("title"))
    except Exception:
        return ""

async def _jarvis_synthesise(text: str) -> bytes:
    import edge_tts
    buf = io.BytesIO()
    communicate = edge_tts.Communicate(text, JARVIS_VOICE, rate=JARVIS_RATE, pitch=JARVIS_PITCH)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    buf.seek(0)
    return buf.read()

@app.route("/api/jarvis/greet", methods=["GET"])
def jarvis_greet():
    user_id = get_authenticated_user_id()
    if not user_id:
        return json_error("Unauthorized", 401)
    try:
        script = _jarvis_build_script(user_id)
        audio  = asyncio.run(_jarvis_synthesise(script))
        return send_file(io.BytesIO(audio), mimetype="audio/mpeg", as_attachment=False)
    except Exception as e:
        return json_error(f"Jarvis failed: {e}", 500)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=APP_PORT, debug=True)
