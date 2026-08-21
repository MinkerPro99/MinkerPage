// Configuration
    const defaultApiBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
      ? 'http://127.0.0.1:5050/api'
      : '/api';

    const CONFIG = {
      API_BASE_URL: localStorage.getItem('calendarApiBase') || defaultApiBase
    };

    // Global variables
    let calendar;
    let accessToken = null;
    let userProfile = null;
    let selectedEvent = null;
    let selectedDateRange = null;
    let formOpenTime = 0;
    let loggedIn = false;
    const DONE_MARKER = '\u2063\u2064\u2063';

    function parseEventTitle(rawTitle = '') {
      const titleText = String(rawTitle || '');
      const isDone = titleText.includes(DONE_MARKER);
      const visibleTitle = titleText.split(DONE_MARKER).join('').trim();
      const normalized = visibleTitle.toLowerCase();
      const isExam = normalized.includes('prüfung') || normalized.includes('pruefung');
      const isVacation = normalized.includes('ferien');
      return {
        rawTitle: titleText,
        visibleTitle,
        isDone,
        isExam,
        isVacation
      };
    }

    function withDoneMarker(title, done) {
      const cleanTitle = String(title || '').split(DONE_MARKER).join('').trim();
      return done ? `${cleanTitle}${DONE_MARKER}` : cleanTitle;
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
      if (token) {
        accessToken = token;
        return true;
      }
      return false;
    }

    async function apiFetch(path, options = {}) {
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
        ...options,
        headers
      });

      if (response.status === 401) {
        clearStoredAuth();
        if (loggedIn) {
          showMessage('Session expired. Please login again.', 'error');
          logout();
        }
      }

      return response;
    }

    async function parseResponseJsonSafe(response) {
      const rawText = await response.text();
      if (!rawText) {
        return {};
      }

      try {
        return JSON.parse(rawText);
      } catch {
        return {
          error: `Unexpected non-JSON response (HTTP ${response.status})`,
          raw: rawText
        };
      }
    }

    async function checkExistingAuth() {
      if (!getStoredAccessToken()) {
        return;
      }

      const success = await fetchUserProfile();
      if (success) {
        await loginUser();
      } else {
        clearStoredAuth();
      }
    }

    async function fetchUserProfile() {
      try {
        if (!accessToken) {
          throw new Error('No auth token available');
        }

        const response = await apiFetch('/auth/me', { method: 'GET' });
        if (!response.ok) {
          throw new Error(`Failed to fetch user profile: ${response.status}`);
        }

        const data = await parseResponseJsonSafe(response);
        userProfile = data.user || null;
        updateUserInfo();
        return true;
      } catch (error) {
        console.error('Error fetching user profile:', error);
        return false;
      }
    }

    function updateUserInfo() {
      const userNameEl = document.getElementById('userName');
      if (!userNameEl) {
        return;
      }

      if (userProfile) {
        userNameEl.textContent = userProfile.username;
      } else {
        userNameEl.textContent = 'Unknown user';
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
      updateUserInfo();
      return true;
    }

    // Fetch all-day events from local API
    async function fetchCalendarEvents() {
      try {
        const normalizeApiDate = (value) => {
          if (!value) return '';
          if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return value;
          }
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) {
            return '';
          }
          return d.toISOString().slice(0, 10);
        };

        const response = await apiFetch('/events', {
          method: 'GET'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch events');
        }

        const data = await parseResponseJsonSafe(response);
        return (data.events || []).map(event => ({
          id: String(event.event_id),
          summary: event.title,
          start: { date: normalizeApiDate(event.start_date) },
          end: { date: normalizeApiDate(event.end_date) },
          description: event.description,
          colorHex: event.color_hex
        }));
      } catch (error) {
        console.error('Error fetching events:', error);
        showMessage('Failed to fetch calendar events', 'error');
        return [];
      }
    }

    async function createEvent(title, startDate, endDate) {
      return createEventAllDay(title, startDate, endDate);
    }

    async function createEventAllDay(title, startDate, endDate) {
      try {
        if (!title) throw new Error('Event title is required');
        if (!startDate) throw new Error('Start date is required');
        if (!endDate) endDate = startDate;

        const response = await apiFetch('/events', {
          method: 'POST',
          body: JSON.stringify({
            title,
            start_date: startDate,
            end_date: endDate,
            description: 'Created via Study Calendar',
            color_hex: '#a600cf'
          })
        });

        const data = await parseResponseJsonSafe(response);
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create event');
        }

        showMessage('Event created successfully!', 'success');
        await refreshCalendar();
        return data;
      } catch (error) {
        console.error('Error creating event:', error);
        showMessage('Failed to create event: ' + error.message, 'error');
        return null;
      }
    }

    async function updateEvent(eventId, updatedData) {
      try {
        const title = updatedData?.summary || 'Untitled';
        const startDate = updatedData?.start?.date;
        const endDate = updatedData?.end?.date || startDate;

        const response = await apiFetch(`/events/${eventId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title,
            start_date: startDate,
            end_date: endDate,
            description: updatedData?.description || null,
            color_hex: '#a600cf'
          })
        });

        const data = await parseResponseJsonSafe(response);
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update event');
        }

        showMessage('Event updated successfully!', 'success');
        await refreshCalendar();
        return true;
      } catch (error) {
        console.error('Error updating event:', error);
        showMessage('Failed to update event: ' + error.message, 'error');
        return false;
      }
    }

    async function deleteEventWithoutConfirm(eventId) {
      try {
        const response = await apiFetch(`/events/${eventId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          const data = await parseResponseJsonSafe(response);
          throw new Error(data.error || 'Failed to delete event');
        }

        showMessage('Event deleted successfully!', 'success');
        await refreshCalendar();
        return true;
      } catch (error) {
        console.error('Error deleting event:', error);
        showMessage('Failed to delete event: ' + error.message, 'error');
        return false;
      }
    }

    async function deleteEvent(eventId) {
      try {
        if (!confirm('Are you sure you want to delete this event?')) return false;
        return deleteEventWithoutConfirm(eventId);
      } catch (error) {
        console.error('Error deleting event:', error);
        showMessage('Failed to delete event: ' + error.message, 'error');
        return false;
      }
    }

    async function refreshCalendar() {
      if (calendar) {
        calendar.destroy();
      }
      await initializeCalendar();
    }

    async function initializeCalendar() {
      try {
        console.log('=== Starting calendar initialization ===');
        const calendarEl = document.getElementById('calendar');
        
        if (!calendarEl) {
          showMessage('Calendar element not found', 'error');
          return;
        }

        const events = await fetchCalendarEvents();

        const addOneDayIso = (dateValue) => {
          if (!dateValue) return dateValue;
          const formatLocalDate = (date) => {
            const yyyy = date.getFullYear();
            const mm = String(date.getMonth() + 1).padStart(2, '0');
            const dd = String(date.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
          };
          const d = /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
            ? new Date(dateValue + 'T00:00:00')
            : new Date(dateValue);
          if (Number.isNaN(d.getTime())) {
            return '';
          }
          d.setDate(d.getDate() + 1);
          return formatLocalDate(d);
        };
        
        const formattedEvents = events.map(event => {
          const titleMeta = parseEventTitle(event.summary || '');
          const isExam = titleMeta.isExam;
          const isVacation = titleMeta.isVacation;
          const isDone = titleMeta.isDone && !isExam && !isVacation;
          
          const eventColor = isVacation
            ? 'rgba(46, 204, 113, 0.2)'
            : (isExam ? 'rgba(241, 155, 6, 0.2)' : (isDone ? 'rgba(166, 0, 207, 0.08)' : 'rgba(166, 0, 207, 0.2)'));
          const borderCtx = isVacation
            ? '#2ecc71'
            : (isExam ? '#f19b06' : (isDone ? 'rgba(166, 0, 207, 0.45)' : '#a600cf'));

          return {
            id: event.id,
            title: titleMeta.visibleTitle || 'No title',
            start: event.start.dateTime || event.start.date,
            end: event.end.dateTime || addOneDayIso(event.end.date),
            backgroundColor: eventColor,
            borderColor: borderCtx,
            extendedProps: {
              dbEventId: event.id,
              description: event.description,
              location: event.location,
              rawSummary: titleMeta.rawTitle,
              isDone,
              isExam,
              isVacation
            }
          };
        });

        if (calendar) {
          calendar.destroy();
          calendar = null;
        }
        
        calendar = new FullCalendar.Calendar(calendarEl, {
          initialView: 'dayGridMonth',
          firstDay: 1,
          headerToolbar: {
            left: 'prev,next today addEventBtn',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
          },
          customButtons: {
            addEventBtn: {
              text: '+ Add Event',
              click: function() {
                showEventForm();
              }
            }
          },
          height: 'auto',
          contentHeight: 'auto',
          selectable: true,
          select: function(info) {
            selectedDateRange = {
              start: info.start,
              end: info.end
            };
            showEventForm();
          },
          dateClick: function(info) {
            try {
              selectedDateRange = { start: info.date, end: info.date };
              showEventForm();
            } catch (e) {
              console.error('dateClick handler error:', e);
            }
          },
          eventClick: function(info) {
            handleEventClick(info);
          },
          events: formattedEvents
        });

        calendar.render();
        displayUpcomingEvents(events);
      } catch (error) {
        console.error('ERROR in initializeCalendar:', error);
        showMessage('Failed to initialize calendar: ' + error.message, 'error');
      }
    }

    function displayUpcomingEvents(events) {
      const upcomingContainer = document.getElementById('upcomingEvents');
      const now = new Date();
      
      const upcomingEvents = events
        .filter(event => new Date(event.start.dateTime || event.start.date) > now)
        .sort((a, b) => new Date(a.start.dateTime || a.start.date) - new Date(b.start.dateTime || b.start.date))
        .slice(0, 10);

      if (upcomingEvents.length === 0) {
        upcomingContainer.innerHTML = '<p style="color: #64748b; font-weight: 500;">No upcoming events inside registry.</p>';
        return;
      }

      upcomingContainer.innerHTML = upcomingEvents.map(event => {
        const startTime = new Date(event.start.dateTime || event.start.date);
        const timeStr = event.start.dateTime 
          ? startTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : startTime.toLocaleString('en-US', { month: 'short', day: 'numeric' });

        const titleMeta = parseEventTitle(event.summary || '');
        const isExam = titleMeta.isExam;
        const isVacation = titleMeta.isVacation;
        const isDone = titleMeta.isDone && !isExam && !isVacation;
        const visibleTitle = titleMeta.visibleTitle || 'No title';

        if (isExam) {
          return `
            <div class="event-item-exam">
              <strong>${visibleTitle}</strong>
              <div class="event-item-time">${timeStr}</div>
            </div>
          `;
        } else if (isVacation) {
          return `
            <div class="event-item-vacation">
              <strong>${visibleTitle}</strong>
              <div class="event-item-time">${timeStr}</div>
            </div>
          `;
        } else {
          return `
            <div class="event-item${isDone ? ' event-item-done' : ''}">
              <strong>${visibleTitle}</strong>
              <div class="event-item-time">${timeStr}</div>
            </div>
          `;
        }
      }).join('');
    }

    function handleEventClick(info) {
      const event = info.event;
      selectedEvent = event;
      showEventForm(event);
    }

    function handleDateSelect(info) {
      selectedDateRange = {
        start: info.start,
        end: info.end
      };
      showEventForm();
    }

    function showEventForm(event = null) {
      const now = Date.now();
      if (now - formOpenTime < 100) {
        return;
      }
      formOpenTime = now;
      
      const eventMeta = event
        ? parseEventTitle(event.extendedProps?.rawSummary || event.title || '')
        : parseEventTitle('');
      const title = event ? eventMeta.visibleTitle : '';
      const canToggleDone = Boolean(event) && !eventMeta.isExam && !eventMeta.isVacation;
      const isDoneTask = Boolean(eventMeta.isDone) && canToggleDone;
      const dateToLocalYYYYMMDD = (d) => {
        if (!d) return '';
        const date = new Date(d);
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      };
      const getLocalDateString = () => dateToLocalYYYYMMDD(new Date());
      const subtractOneDay = (isoDate) => {
        if (!isoDate) return '';
        const d = new Date(isoDate + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        return dateToLocalYYYYMMDD(d);
      };

      const startDate = event ? dateToLocalYYYYMMDD(event.start) : (selectedDateRange ? dateToLocalYYYYMMDD(selectedDateRange.start) : getLocalDateString());
      let endDate = startDate;
      if (event && event.end) {
        const ed = subtractOneDay(dateToLocalYYYYMMDD(event.end));
        endDate = ed || startDate;
      }

      const isMultiDay = event && event.end
        ? (dateToLocalYYYYMMDD(event.end) !== dateToLocalYYYYMMDD(event.start))
        : false;
      const isAllDay = true;

      const modal = document.createElement('div');
      modal.className = 'event-modal-overlay';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.6);
        backdrop-filter: blur(8px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
      `;

      const form = document.createElement('div');
      form.className = 'event-modal';
      form.style.cssText = `
        background: #1e1e28;
        border: 1px solid rgba(255, 255, 255, 0.08);
        padding: 30px;
        border-radius: 16px;
        box-shadow: 0 15px 40px rgba(0,0,0,0.6);
        max-width: 480px;
        width: 90%;
        color: #ffffff;
      `;

      form.innerHTML = `
        <h3 style="margin-top: 0; color: #ffffff; font-weight: 700; margin-bottom: 20px;">${event ? 'Edit Event' : 'Create Event'}</h3>
        
        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 6px; color: #94a3b8; font-weight: 500; font-size: 14px;">Event Title</label>
          <input type="text" id="eventTitle" value="${title}" placeholder="Enter event title" style="
            width: 100%;
            padding: 10px 12px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(0,0,0,0.25);
            color: #ffffff;
            border-radius: 8px;
            box-sizing: border-box;
          ">
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 6px; color: #94a3b8; font-weight: 500; font-size: 14px;">Start Date</label>
          <input type="date" id="eventStart" value="${startDate}" style="
            width: 100%;
            padding: 10px 12px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(0,0,0,0.25);
            color: #ffffff;
            border-radius: 8px;
            box-sizing: border-box;
          ">
        </div>

        <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
          <input type="checkbox" id="multiDayCheckbox" ${isMultiDay ? 'checked' : ''} style="cursor: pointer; accent-color: #a600cf;">
          <label for="multiDayCheckbox" style="color: #94a3b8; cursor: pointer; margin: 0; font-size: 14px;">Multiple days</label>
        </div>

        <div id="endDateContainer" style="margin-bottom: 20px; display: ${isMultiDay ? 'block' : 'none'};">
          <label style="display: block; margin-bottom: 6px; color: #94a3b8; font-weight: 500; font-size: 14px;">End Date</label>
          <input type="date" id="eventEnd" value="${endDate}" style="
            width: 100%;
            padding: 10px 12px;
            border: 1px solid rgba(255,255,255,0.1);
            background: rgba(0,0,0,0.25);
            color: #ffffff;
            border-radius: 8px;
            box-sizing: border-box;
          ">
        </div>

        <div class="event-modal-buttons" style="display: flex; gap: 10px;">
          <button id="saveEventBtn" style="
            flex: 1;
            padding: 11px;
            background: #a600cf;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
            transition: opacity 0.2s;
          ">Save Event</button>
          <button id="cancelBtn" style="
            flex: 1;
            padding: 11px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.08);
            color: white;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
          ">Cancel</button>
          ${canToggleDone ? `<button id="toggleDoneBtn" style="
            flex: 0.9;
            padding: 11px;
            background: ${isDoneTask ? '#f59e0b' : '#16a34a'};
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 700;
          ">${isDoneTask ? 'Undo' : 'Done'}</button>` : ''}
          ${event ? `<button id="deleteEventBtn" style="
            flex: 0.8;
            padding: 11px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-weight: 600;
          ">Delete</button>` : ''}
        </div>
      `;

      modal.appendChild(form);
      document.body.appendChild(modal);

      const saveEventBtn = form.querySelector('#saveEventBtn');
      const cancelBtn = form.querySelector('#cancelBtn');
      const deleteBtn = form.querySelector('#deleteEventBtn');
      const toggleDoneBtn = form.querySelector('#toggleDoneBtn');
      const multiDayCheckbox = form.querySelector('#multiDayCheckbox');
      const endDateContainer = form.querySelector('#endDateContainer');

      if (multiDayCheckbox) {
        multiDayCheckbox.addEventListener('change', () => {
          if (multiDayCheckbox.checked) {
            endDateContainer.style.display = 'block';
          } else {
            endDateContainer.style.display = 'none';
            const eventEnd = form.querySelector('#eventEnd');
            const eventStart = form.querySelector('#eventStart');
            if (eventEnd && eventStart) {
              eventEnd.value = eventStart.value;
            }
          }
        });
      }

      if (saveEventBtn) {
        saveEventBtn.addEventListener('click', async () => {
          try {
            const titleInput = form.querySelector('#eventTitle').value;
            const startDateInput = form.querySelector('#eventStart').value;
            let endDateInput = form.querySelector('#eventEnd').value;

            if (!titleInput || !startDateInput) {
              showMessage('Please fill in all fields', 'error');
              return;
            }

            if (!multiDayCheckbox.checked) {
              endDateInput = startDateInput;
            }

            if (!endDateInput) {
              showMessage('Please select an end date', 'error');
              return;
            }

            if (event) {
              const keepDoneFlag = Boolean(event.extendedProps?.isDone);
              const eventData = {
                summary: withDoneMarker(titleInput, keepDoneFlag),
                start: { date: startDateInput },
                end: { date: endDateInput }
              };
              await updateEvent(event.id, eventData);
            } else {
              await createEventAllDay(titleInput, startDateInput, endDateInput);
            }

            if (modal && modal.parentNode) {
              modal.parentNode.removeChild(modal);
            }
            selectedDateRange = null;
            selectedEvent = null;
          } catch (e) {
            console.error('Error saving event:', e);
            showMessage('Error saving event: ' + e.message, 'error');
          }
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          try {
            if (modal && modal.parentNode) {
              modal.parentNode.removeChild(modal);
            }
            selectedDateRange = null;
            selectedEvent = null;
          } catch (e) {
            console.error('Error closing modal:', e);
            if (modal) modal.style.display = 'none';
          }
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
          if (confirm('Are you sure you want to delete this event?')) {
            await deleteEventWithoutConfirm(event.id);
            if (modal && modal.parentNode) {
              modal.parentNode.removeChild(modal);
            }
          }
        });
      }

      if (toggleDoneBtn && event) {
        toggleDoneBtn.addEventListener('click', async () => {
          try {
            const titleInput = form.querySelector('#eventTitle').value;
            const startDateInput = form.querySelector('#eventStart').value;
            let endDateInput = form.querySelector('#eventEnd').value;

            if (!titleInput || !startDateInput) {
              showMessage('Please fill in all fields', 'error');
              return;
            }

            if (!multiDayCheckbox.checked) {
              endDateInput = startDateInput;
            }

            if (!endDateInput) {
              showMessage('Please select an end date', 'error');
              return;
            }

            const nextDoneState = !Boolean(event.extendedProps?.isDone);
            const eventData = {
              summary: withDoneMarker(titleInput, nextDoneState),
              start: { date: startDateInput },
              end: { date: endDateInput }
            };

            const updated = await updateEvent(event.id, eventData);
            if (updated && modal && modal.parentNode) {
              modal.parentNode.removeChild(modal);
            }
          } catch (e) {
            console.error('Error toggling done state:', e);
            showMessage('Error updating task status: ' + e.message, 'error');
          }
        });
      }
    }

    function handleDatesSet(info) {
      console.log('Calendar dates changed', info);
    }

    function showMessage(message, type = 'info') {
      const container = document.getElementById('messageContainer');
      const messageClass = type === 'error' ? 'error-message' : 'success-message';
      container.innerHTML = `<div class="${messageClass}">${message}</div>`;
      setTimeout(() => {
        container.innerHTML = '';
      }, 5000);
    }

    async function loginUser() {
      try {
        loggedIn = true;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('calendarScreen').style.display = 'block';

        if (!await fetchUserProfile()) {
          showMessage('Failed to authenticate. Please log in again.', 'error');
          setTimeout(() => logout(), 2000);
          return;
        }

        await initializeCalendar();
        showMessage('Welcome! Your calendar is loaded.', 'success');
      } catch (error) {
        console.error('Login error:', error);
        showMessage('Login failed: ' + error.message, 'error');
        setTimeout(() => logout(), 2000);
      }
    }

    function logout() {
      clearStoredAuth();
      userProfile = null;
      loggedIn = false;
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('calendarScreen').style.display = 'none';
      document.getElementById('messageContainer').innerHTML = '';
      if (calendar) calendar.destroy();

      showMessage('Logged out successfully.', 'success');
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
        showMessage('Please log in first.', 'error');
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
          body: JSON.stringify({ new_username: newUsername, confirm_username: confirmUsername })
        });
        const data = await parseResponseJsonSafe(response);
        if (!response.ok) {
          setSettingsMessage(data.error || 'Failed to update username.');
          return;
        }
        userProfile.username = data.username || userProfile.username;
        updateUserInfo();
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
      const loginErrorMessage = document.getElementById('loginErrorMessage');

      function showLoginError(message) {
        if (loginErrorMessage) {
          loginErrorMessage.textContent = message;
          loginErrorMessage.style.display = 'block';
        }
      }

      function clearLoginError() {
        if (loginErrorMessage) {
          loginErrorMessage.style.display = 'none';
        }
      }

      usernameInput?.addEventListener('input', clearLoginError);
      passwordInput?.addEventListener('input', clearLoginError);

      if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
          try {
            clearLoginError();
            const username = (usernameInput?.value || '').trim();
            const password = passwordInput?.value || '';

            if (!username || !password) {
              showLoginError('Please enter both username and password');
              return;
            }

            loginBtn.disabled = true;
            loginBtn.textContent = 'Logging in...';

            await loginWithPassword(username, password);
            await loginUser();
          } catch (error) {
            const errorMsg = error.message || 'Login failed. Please try again.';
            showLoginError(errorMsg);
          } finally {
            if (loginBtn) {
              loginBtn.disabled = false;
              loginBtn.textContent = 'Login';
            }
          }
        });
      }

      if (passwordInput) {
        passwordInput.addEventListener('keydown', async (e) => {
          if (e.key === 'Enter') {
            loginBtn?.click();
          }
        });
      }

      await checkExistingAuth();
      document.getElementById('logoutBtn').addEventListener('click', logout);
      document.getElementById('settingsBtn')?.addEventListener('click', openSettingsModal);
      document.getElementById('forgotPasswordBtn')?.addEventListener('click', openForgotPasswordModal);
      initializePWAInstall();
    });

    let deferredPrompt;
    function isRunningAsInstalledPWA() {
      return window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: fullscreen)').matches
        || window.navigator.standalone === true
        || document.referrer.includes('android-app://');
    }

    function initializePWAInstall() {
      const installBtn = document.getElementById('installBtn');
      if (!installBtn) {
        return;
      }

      const hideInstallButton = () => {
        installBtn.style.display = 'none';
      };

      if (isRunningAsInstalledPWA()) {
        hideInstallButton();
        return;
      }

      installBtn.addEventListener('click', installPWA);
      
      window.addEventListener('beforeinstallprompt', (e) => {
        if (isRunningAsInstalledPWA()) {
          hideInstallButton();
          return;
        }

        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'block';
      });

      window.addEventListener('appinstalled', () => {
        hideInstallButton();
        deferredPrompt = null;
      });

      window.matchMedia('(display-mode: standalone)').addEventListener('change', (event) => {
        if (event.matches) hideInstallButton();
      });
    }

    async function installPWA() {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to install prompt: ${outcome}`);
        deferredPrompt = null;
        document.getElementById('installBtn').style.display = 'none';
      }
    }

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          console.log('Service Worker registered:', reg);
        }).catch(err => {
          console.log('Service Worker registration failed:', err);
        });
      });
    }
