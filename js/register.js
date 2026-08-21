const defaultApiBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://127.0.0.1:5050/api'
  : '/api';
const API_BASE_URL = localStorage.getItem('calendarApiBase') || defaultApiBase;

const msgEl = document.getElementById('msg');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const registerBtn = document.getElementById('registerBtn');
const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');

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

async function copyInputValue(input, setMessage, successMessage = 'Code copied.') {
  const value = (input?.value || '').trim();
  if (!value) {
    setMessage('Enter or paste the code first.');
    return;
  }

  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      input.focus();
      input.select();
      document.execCommand('copy');
    }
    setMessage(successMessage);
  } catch (error) {
    setMessage('Could not copy automatically. Select the code and copy it manually.');
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

function openForgotPasswordModal() {
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;';
  modal.innerHTML = `
    <div style="width:min(420px,100%);background:#1f1f2a;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:18px;color:#fff;display:grid;gap:10px;">
      <h3 style="margin:0;">Reset password</h3>
      <input id="resetEmail" type="email" placeholder="Email" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
      <button id="sendResetCode" class="login-btn" type="button">Send reset code</button>
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;">
        <input id="resetCode" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" style="min-width:0;padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
        <button id="copyResetCodeBtn" class="login-btn" type="button" style="width:auto;padding:10px 12px;white-space:nowrap;">Copy</button>
      </div>
      <input id="resetPasswordA" type="password" placeholder="New password" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
      <input id="resetPasswordB" type="password" placeholder="Repeat new password" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
      <button id="confirmReset" class="login-btn" type="button">Reset password</button>
      <button id="closeReset" class="login-btn" type="button" style="background:#333;">Close</button>
      <div id="resetMsg" style="font-size:13px;color:#c4b5fd;"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const msg = modal.querySelector('#resetMsg');
  const setModalMessage = (text) => {
    msg.textContent = text;
  };

  modal.querySelector('#closeReset')?.addEventListener('click', () => modal.remove());

  modal.querySelector('#copyResetCodeBtn')?.addEventListener('click', () => {
    copyInputValue(modal.querySelector('#resetCode'), setModalMessage);
  });

  modal.querySelector('#sendResetCode')?.addEventListener('click', async () => {
    const email = (modal.querySelector('#resetEmail')?.value || '').trim();
    if (!email) {
      setModalMessage('Please enter your email.');
      return;
    }

    setModalMessage('Sending...');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password/forgot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await parseResponseJsonSafe(response);
      setModalMessage(data.message || data.error || 'Request sent.');
    } catch (error) {
      setModalMessage(error.message || 'Could not send reset code.');
    }
  });

  modal.querySelector('#confirmReset')?.addEventListener('click', async () => {
    const email = (modal.querySelector('#resetEmail')?.value || '').trim();
    const code = (modal.querySelector('#resetCode')?.value || '').trim();
    const newPassword = modal.querySelector('#resetPasswordA')?.value || '';
    const confirmPassword = modal.querySelector('#resetPasswordB')?.value || '';
    if (!email || !code || !newPassword || !confirmPassword) {
      setModalMessage('Please complete all fields.');
      return;
    }

    setModalMessage('Resetting...');
    try {
      const response = await fetch(`${API_BASE_URL}/auth/password/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, new_password: newPassword, confirm_password: confirmPassword })
      });
      const data = await parseResponseJsonSafe(response);
      if (!response.ok) {
        setModalMessage(data.error || 'Password reset failed.');
        return;
      }
      setModalMessage('Password reset successful. You can now log in.');
    } catch (error) {
      setModalMessage(error.message || 'Password reset failed.');
    }
  });
}

registerBtn.addEventListener('click', register);
passwordEl.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    register();
  }
});
forgotPasswordBtn?.addEventListener('click', openForgotPasswordModal);
