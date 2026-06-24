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
