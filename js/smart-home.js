// Config fallback setups
    const ALLOWED_USERNAME = 'minkerpro99';
    const defaultApiBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://127.0.0.1:5050/api' : '/api';
    const CONFIG = { API_BASE_URL: localStorage.getItem('calendarApiBase') || defaultApiBase };

    let accessToken = null;
    let userProfile = null;
    let booting = false;

    function normalizeUsername(value) {
      return (value || '').trim().toLowerCase();
    }

    function setStoredAuth(token) {
      accessToken = token;
      localStorage.setItem('calendarAuthToken', token);
    }

    function clearStoredAuth() {
      accessToken = null;
      localStorage.removeItem('calendarAuthToken');
    }

    function getStoredAccessToken() {
      const token = localStorage.getItem('calendarAuthToken');
      if (token) accessToken = token;
      return token;
    }

    async function parseResponseJsonSafe(response) {
      try { return await response.json(); } catch (error) { return {}; }
    }

    async function apiFetch(path, options = {}) {
      const headers = { ...(options.headers || {}) };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      return fetch(`${CONFIG.API_BASE_URL}${path}`, { ...options, headers });
    }

    function setLoginError(message) {
      const loginErrorMessage = document.getElementById('loginErrorMessage');
      if (!loginErrorMessage) return;
      loginErrorMessage.textContent = message;
      loginErrorMessage.style.display = 'block';
    }

    function clearLoginError() {
      const loginErrorMessage = document.getElementById('loginErrorMessage');
      if (!loginErrorMessage) return;
      loginErrorMessage.textContent = '';
      loginErrorMessage.style.display = 'none';
    }

    function logSequence(message) {
      const log = document.getElementById('sequenceLog');
      if (!log) return;
      if (log.textContent === 'Waiting for boot command...') {
        log.textContent = '';
      }
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      log.textContent = `${log.textContent ? `${log.textContent}\n` : ''}[${timestamp}] ${message}`;
      log.scrollTop = log.scrollHeight;
    }

    function updateSequenceStep(index, state, label) {
      const step = document.querySelector(`.step[data-step="${index}"]`);
      if (!step) return;
      step.classList.remove('running', 'done', 'error');
      if (state) step.classList.add(state);
      const status = step.querySelector('small');
      if (status) status.textContent = label;
    }

    function updateAuthorizedState() {
      const isAuthorized = normalizeUsername(userProfile?.username) === ALLOWED_USERNAME;
      const userName = document.getElementById('userName');
      if (userName) userName.textContent = userProfile?.username || 'Unknown user';
      document.getElementById('bootZone')?.classList.toggle('hidden', !isAuthorized);
      document.getElementById('accessDenied')?.classList.toggle('hidden', isAuthorized);
    }

    async function fetchUserProfile() {
      if (!accessToken) return false;
      try {
        const response = await apiFetch('/auth/me', { method: 'GET' });
        if (!response.ok) throw new Error(`Failed to fetch user profile: ${response.status}`);
        const data = await parseResponseJsonSafe(response);
        userProfile = data.user || null;
        updateAuthorizedState();
        return true;
      } catch (error) {
        console.error('Error fetching user profile:', error);
        return false;
      }
    }

    async function loginWithPassword(username, password) {
      const response = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await parseResponseJsonSafe(response);
      if (!response.ok || !data.token) {
        throw new Error(data.error || 'Invalid username or password');
      }
      setStoredAuth(data.token);
      userProfile = data.user || null;
      updateAuthorizedState();
      return true;
    }

    async function checkExistingAuth() {
      if (!getStoredAccessToken()) return;
      const success = await fetchUserProfile();
      if (!success) clearStoredAuth();
    }

    function setViewLoggedIn() {
      document.getElementById('loginScreen')?.classList.add('hidden');
      document.getElementById('homeScreen')?.classList.remove('hidden');
      document.getElementById('homeScreen').style.display = 'flex';
    }

    function setViewLoggedOut() {
      document.getElementById('loginScreen')?.classList.remove('hidden');
      document.getElementById('homeScreen')?.classList.add('hidden');
      document.getElementById('homeScreen').style.display = 'none';
    }

    function isAuthorizedUser() {
      return normalizeUsername(userProfile?.username) === ALLOWED_USERNAME;
    }
    async function runSmartHomeSequence() {
      if (booting || !isAuthorizedUser()) return;

      booting = true;
      document.getElementById('bootBtn').disabled = true;

      updateSequenceStep(0, 'running', 'Running');
      updateSequenceStep(1, null, 'Pending');
      updateSequenceStep(2, null, 'Pending');

      logSequence('🚀 Jarvis Protocol initialization payload sent...');

      try {
        updateSequenceStep(0, 'running', 'Running');
        const res = await fetch('/api/ignite-setup', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('calendarAuthToken')}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        updateSequenceStep(0, 'done', 'Done');
        logSequence('⚡ Scene Execution 1: Power ON Complete.');

        updateSequenceStep(1, 'done', 'Done');

        updateSequenceStep(2, 'done', 'Done');
        logSequence('🖥️ Scene Execution 2: PC Trigger Complete.');
        logSequence('🎯 All systems operational. Battlestation fully awake! GG.');

      } catch (error) {
        updateSequenceStep(0, 'error', 'Failed');
        updateSequenceStep(1, 'error', 'Aborted');
        updateSequenceStep(2, 'error', 'Aborted');
        logSequence(`❌ Sequence termination failure: ${error.message}`);
        console.error('Sequence routing crash:', error);
      } finally {
        booting = false;
        document.getElementById('bootBtn').disabled = false;
      }
    }

    async function loginUser() {
      setViewLoggedIn();
      if (!await fetchUserProfile()) {
        clearStoredAuth();
        setViewLoggedOut();
        setLoginError('Failed to authenticate. Please log in again.');
        return;
      }
      if (!isAuthorizedUser()) {
        document.getElementById('accessDenied')?.classList.remove('hidden');
        document.getElementById('bootZone')?.classList.add('hidden');
        logSequence('Signed in, but this page is restricted to MinkerPro99.');
        return;
      }
      document.getElementById('accessDenied')?.classList.add('hidden');
      document.getElementById('bootZone')?.classList.remove('hidden');
      logSequence('Smart Home unlocked. Boot system ready.');
    }

    function logout() {
      clearStoredAuth();
      userProfile = null;
      booting = false;
      document.getElementById('sequenceLog').textContent = 'Waiting for boot command...';
      document.querySelectorAll('.step').forEach((step) => {
        step.classList.remove('running', 'done', 'error');
        const status = step.querySelector('small');
        if (status) status.textContent = 'Pending';
      });
      setViewLoggedOut();
      clearLoginError();
      updateAuthorizedState();
    }

    function openForgotPasswordModal() {
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;';
      modal.innerHTML = `
        <div style="width:min(420px,100%);background:#1f1f2a;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:18px;color:#fff;display:grid;gap:10px;">
          <h3 style="margin:0;">Reset password</h3>
          <input id="resetEmail" type="email" placeholder="Email" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          <button id="sendResetCode" class="login-btn" type="button">Send reset code</button>
          <input id="resetCode" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          <input id="resetPasswordA" type="password" placeholder="New password" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          <input id="resetPasswordB" type="password" placeholder="Repeat new password" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          <button id="confirmReset" class="login-btn" type="button">Reset password</button>
          <button id="closeReset" class="login-btn" type="button" style="background:#333;">Close</button>
          <div id="resetMsg" style="font-size:13px;color:#c4b5fd;"></div>
        </div>
      `;
      document.body.appendChild(modal);

      const msg = modal.querySelector('#resetMsg');
      const setModalMessage = (text) => { msg.textContent = text; };
      modal.querySelector('#closeReset')?.addEventListener('click', () => modal.remove());

      modal.querySelector('#sendResetCode')?.addEventListener('click', async () => {
        const email = (modal.querySelector('#resetEmail')?.value || '').trim();
        if (!email) {
          setModalMessage('Please enter your email.');
          return;
        }
        setModalMessage('Sending...');
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth/password/forgot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await parseResponseJsonSafe(response);
        setModalMessage(data.message || data.error || 'Request sent.');
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
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth/password/reset`, {
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
      });
    }

    function openSettingsModal() {
      if (!accessToken || !userProfile) {
        setLoginError('Please log in first.');
        return;
      }

      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;justify-content:center;align-items:center;z-index:10000;padding:16px;';
      modal.innerHTML = `
        <div style="width:min(520px,100%);max-height:90vh;overflow:auto;background:#1f1f2a;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:18px;color:#fff;display:grid;gap:12px;">
          <h3 style="margin:0;">Account settings</h3>
          <div style="font-size:12px;color:#c4b5fd;">Link an email first to unlock username and password changes.</div>
          <label style="display:grid;gap:6px;">
            <span>Email</span>
            <input id="settingsEmail" type="email" placeholder="Email" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          </label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="sendEmailCodeBtn" class="login-btn" type="button" style="width:auto;padding:10px 14px;">Send code</button>
            <input id="emailCodeInput" type="text" inputmode="numeric" maxlength="6" placeholder="6-digit code" style="flex:1;min-width:140px;padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
            <button id="verifyEmailBtn" class="login-btn" type="button" style="width:auto;padding:10px 14px;">Verify email</button>
          </div>
          <hr style="border-color:rgba(255,255,255,.1);">
          <label style="display:grid;gap:6px;">
            <span>New username</span>
            <input id="newUsernameA" type="text" placeholder="New username" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          </label>
          <label style="display:grid;gap:6px;">
            <span>Repeat new username</span>
            <input id="newUsernameB" type="text" placeholder="Repeat new username" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          </label>
          <button id="updateUsernameBtn" class="login-btn" type="button">Update username</button>
          <hr style="border-color:rgba(255,255,255,.1);">
          <label style="display:grid;gap:6px;">
            <span>Old password</span>
            <input id="oldPassword" type="password" placeholder="Old password" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          </label>
          <label style="display:grid;gap:6px;">
            <span>New password</span>
            <input id="newPasswordA" type="password" placeholder="New password" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          </label>
          <label style="display:grid;gap:6px;">
            <span>Repeat new password</span>
            <input id="newPasswordB" type="password" placeholder="Repeat new password" style="padding:10px;border-radius:8px;border:1px solid #444;background:#12121a;color:#fff;">
          </label>
          <button id="updatePasswordBtn" class="login-btn" type="button">Update password</button>
          <button id="closeSettingsBtn" class="login-btn" type="button" style="background:#333;">Close</button>
          <div id="settingsMsg" style="font-size:13px;color:#c4b5fd;"></div>
        </div>
      `;
      document.body.appendChild(modal);

      const messageEl = modal.querySelector('#settingsMsg');
      const emailInput = modal.querySelector('#settingsEmail');
      const setSettingsMessage = (text) => { messageEl.textContent = text; };
      emailInput.value = userProfile?.email || '';

      const toggleCredentialFields = () => {
        const linked = Boolean(userProfile?.email);
        ['newUsernameA', 'newUsernameB', 'updateUsernameBtn', 'oldPassword', 'newPasswordA', 'newPasswordB', 'updatePasswordBtn']
          .forEach((id) => {
            const el = modal.querySelector(`#${id}`);
            if (el) el.disabled = !linked;
          });
      };
      toggleCredentialFields();

      modal.querySelector('#closeSettingsBtn')?.addEventListener('click', () => modal.remove());

      modal.querySelector('#sendEmailCodeBtn')?.addEventListener('click', async () => {
        const email = (emailInput.value || '').trim();
        if (!email) {
          setSettingsMessage('Please enter an email.');
          return;
        }
        setSettingsMessage('Sending verification code...');
        const response = await apiFetch('/auth/email/request-link-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await parseResponseJsonSafe(response);
        setSettingsMessage(data.message || data.error || 'Request sent.');
      });

      modal.querySelector('#verifyEmailBtn')?.addEventListener('click', async () => {
        const email = (emailInput.value || '').trim();
        const code = (modal.querySelector('#emailCodeInput')?.value || '').trim();
        if (!email || !code) {
          setSettingsMessage('Please provide email and code.');
          return;
        }
        setSettingsMessage('Verifying...');
        const response = await apiFetch('/auth/email/verify-link-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code })
        });
        const data = await parseResponseJsonSafe(response);
        if (!response.ok) {
          setSettingsMessage(data.error || 'Verification failed.');
          return;
        }
        userProfile.email = data.email;
        setSettingsMessage('Email linked successfully.');
        toggleCredentialFields();
      });

      modal.querySelector('#updateUsernameBtn')?.addEventListener('click', async () => {
        const newUsername = (modal.querySelector('#newUsernameA')?.value || '').trim();
        const confirmUsername = (modal.querySelector('#newUsernameB')?.value || '').trim();
        if (!newUsername || !confirmUsername) {
          setSettingsMessage('Please fill both username fields.');
          return;
        }
        setSettingsMessage('Updating username...');
        const response = await apiFetch('/auth/settings/username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ new_username: newUsername, confirm_username: confirmUsername })
        });
        const data = await parseResponseJsonSafe(response);
        if (!response.ok) {
          setSettingsMessage(data.error || 'Failed to update username.');
          return;
        }
        userProfile.username = data.username || userProfile.username;
        updateAuthorizedState();
        setSettingsMessage('Username updated.');
      });

      modal.querySelector('#updatePasswordBtn')?.addEventListener('click', async () => {
        const oldPassword = modal.querySelector('#oldPassword')?.value || '';
        const newPassword = modal.querySelector('#newPasswordA')?.value || '';
        const confirmPassword = modal.querySelector('#newPasswordB')?.value || '';
        if (!oldPassword || !newPassword || !confirmPassword) {
          setSettingsMessage('Please fill all password fields.');
          return;
        }
        setSettingsMessage('Updating password...');
        const response = await apiFetch('/auth/settings/password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ old_password: oldPassword, new_password: newPassword, confirm_password: confirmPassword })
        });
        const data = await parseResponseJsonSafe(response);
        if (!response.ok) {
          setSettingsMessage(data.error || 'Failed to update password.');
          return;
        }
        setSettingsMessage('Password updated.');
      });
    }

    document.addEventListener('DOMContentLoaded', async () => {
      const loginBtn = document.getElementById('loginBtn');
      const usernameInput = document.getElementById('usernameInput');
      const passwordInput = document.getElementById('passwordInput');
      const bootBtn = document.getElementById('bootBtn');

      usernameInput?.addEventListener('input', clearLoginError);
      passwordInput?.addEventListener('input', clearLoginError);

      loginBtn?.addEventListener('click', async () => {
        try {
          clearLoginError();
          const username = (usernameInput?.value || '').trim();
          const password = passwordInput?.value || '';
          if (!username || !password) {
            setLoginError('Please enter both username and password');
            return;
          }
          loginBtn.disabled = true;
          loginBtn.textContent = 'Logging in...';
          await loginWithPassword(username, password);
          await loginUser();
        } catch (error) {
          setLoginError(error.message || 'Login failed. Please try again.');
        } finally {
          loginBtn.disabled = false;
          loginBtn.textContent = 'Login';
        }
      });

      passwordInput?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          loginBtn?.click();
        }
      });

      bootBtn?.addEventListener('click', runSmartHomeSequence);
      document.getElementById('logoutBtn')?.addEventListener('click', logout);
      document.getElementById('settingsBtn')?.addEventListener('click', openSettingsModal);
      document.getElementById('forgotPasswordBtn')?.addEventListener('click', openForgotPasswordModal);

      await checkExistingAuth();
      if (accessToken && userProfile) {
        setViewLoggedIn();
        updateAuthorizedState();
        if (isAuthorizedUser()) {
          document.getElementById('bootZone')?.classList.remove('hidden');
          logSequence('Smart Home unlocked from existing session.');
        } else {
          document.getElementById('accessDenied')?.classList.remove('hidden');
          logSequence('Signed in, but this page is restricted to MinkerPro99.');
        }
      } else {
        setViewLoggedOut();
        updateAuthorizedState();
      }
    });
