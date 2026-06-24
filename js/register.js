const defaultApiBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:5050/api'
      : '/api';
    const API_BASE_URL = localStorage.getItem('calendarApiBase') || defaultApiBase;

    const msgEl = document.getElementById('msg');
    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const registerBtn = document.getElementById('registerBtn');

    function setMessage(text, ok = false) {
      msgEl.textContent = text;
      msgEl.className = ok ? 'msg ok' : 'msg';
    }

    async function parseResponseJsonSafe(response) {
      const rawText = await response.text();
      if (!rawText) {
        return { _rawText: '' };
      }

      try {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === 'object') {
          parsed._rawText = rawText;
        }
        return parsed;
      } catch {
        return {
          error: `Unexpected non-JSON response (HTTP ${response.status})`,
          _rawText: rawText
        };
      }
    }

    async function register() {
      const username = usernameEl.value.trim();
      const password = passwordEl.value;

      if (username.length < 3) {
        setMessage('Username must be at least 3 characters.');
        return;
      }

      if (password.length < 6) {
        setMessage('Password must be at least 6 characters.');
        return;
      }

      registerBtn.disabled = true;
      setMessage('Creating account...');

      try {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await parseResponseJsonSafe(response);
        if (!response.ok) {
          const fallback = data._rawText
            ? `Registration failed (HTTP ${response.status}): ${data._rawText.slice(0, 180)}`
            : `Registration failed (HTTP ${response.status})`;
          throw new Error(data.error || fallback);
        }

        setMessage('Account created. Redirecting to login...', true);
        setTimeout(() => {
          window.location.href = './studyCallendar.html';
        }, 900);
      } catch (error) {
        setMessage(error.message || 'Registration failed');
      } finally {
        registerBtn.disabled = false;
      }
    }

    registerBtn.addEventListener('click', register);
    passwordEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        register();
      }
    });
