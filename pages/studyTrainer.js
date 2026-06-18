const defaultApiBase = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://127.0.0.1:5050/api'
  : '/api';

const CONFIG = {
  API_BASE_URL: localStorage.getItem('calendarApiBase') || defaultApiBase
};

let accessToken = null;
let userProfile = null;
let allEvents = [];
let subjects = [];
let selectedFiles = [];
let selectedSubjectId = '';
let activeExam = null;
let masterySaveTimer = null;

const loginScreen = document.getElementById('loginScreen');
const trainerScreen = document.getElementById('trainerScreen');
const messageContainer = document.getElementById('messageContainer');

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
  if (!token) return false;
  accessToken = token;
  return true;
}

function showMessage(message, type = 'success') {
  messageContainer.textContent = message;
  messageContainer.className = `message ${type}`;
  setTimeout(() => {
    messageContainer.textContent = '';
    messageContainer.className = 'message';
  }, 5000);
}

function showLoginError(message) {
  const el = document.getElementById('loginErrorMessage');
  el.textContent = message;
  el.style.display = 'block';
}

function clearLoginError() {
  const el = document.getElementById('loginErrorMessage');
  el.textContent = '';
  el.style.display = 'none';
}

async function parseResponseJsonSafe(response) {
  const rawText = await response.text();
  if (!rawText) return {};
  try {
    return JSON.parse(rawText);
  } catch {
    return { error: `Unexpected non-JSON response (HTTP ${response.status})` };
  }
}

async function apiFetch(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`${CONFIG.API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 401) logout();
  return response;
}

async function loginWithPassword(username, password) {
  const response = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await parseResponseJsonSafe(response);
  if (!response.ok || !data.token) throw new Error(data.error || 'Invalid username or password');
  setStoredAuth(data.token);
  userProfile = data.user || null;
  updateUserInfo();
}

async function fetchUserProfile() {
  if (!accessToken) return false;
  const response = await apiFetch('/auth/me', { method: 'GET' });
  if (!response.ok) return false;
  const data = await parseResponseJsonSafe(response);
  userProfile = data.user || null;
  updateUserInfo();
  return true;
}

function updateUserInfo() {
  document.getElementById('userName').textContent = userProfile?.username || 'Unknown user';
}

async function enterApp() {
  loginScreen.style.display = 'none';
  trainerScreen.style.display = 'block';
  await Promise.all([loadEvents(), loadSubjects()]);
  activeExam = null;
  hideWorkspace();
  renderPriorityWidgets();
}

function logout() {
  clearStoredAuth();
  userProfile = null;
  activeExam = null;
  loginScreen.style.display = 'flex';
  trainerScreen.style.display = 'none';
  clearLoginError();
}

function normalizeEventDate(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function formatDate(value) {
  const clean = normalizeEventDate(value);
  if (!clean) return '';
  const date = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(value) {
  const clean = normalizeEventDate(value);
  if (!clean) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDate = new Date(`${clean}T00:00:00`);
  if (Number.isNaN(examDate.getTime())) return null;
  return Math.ceil((examDate - today) / 86400000);
}

function normalizeCalendarEvent(event) {
  return {
    id: Number(event.event_id ?? event.id),
    title: event.title || event.summary || 'Untitled event',
    startDate: normalizeEventDate(event.start_date ?? event.start?.date ?? event.start?.dateTime),
    endDate: normalizeEventDate(event.end_date ?? event.end?.date ?? event.end?.dateTime),
    raw: event
  };
}

async function loadEvents() {
  const eventList = document.getElementById('eventList');
  eventList.innerHTML = '<div class="empty">Loading events...</div>';
  try {
    const response = await apiFetch('/events', { method: 'GET' });
    const data = await parseResponseJsonSafe(response);
    if (!response.ok) throw new Error(data.error || 'Failed to load events');
    allEvents = (data.events || [])
      .map(normalizeCalendarEvent)
      .filter(event => event.id && event.startDate)
      .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
    renderEvents();
    renderPriorityWidgets();
  } catch (error) {
    eventList.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

async function loadSubjects() {
  const response = await apiFetch('/study-trainer/subjects', { method: 'GET' });
  const data = await parseResponseJsonSafe(response);
  if (!response.ok) throw new Error(data.error || 'Failed to load subjects');
  subjects = data.subjects || [];
  renderSubjects();
  renderPriorityWidgets();
}

function getSelectedSubject() {
  return subjects.find(subject => subject.id === selectedSubjectId) || null;
}

function getSubjectExam(subject, eventId) {
  return subject?.exams?.[String(eventId)] || null;
}

function getExamMastery(subject, eventId) {
  const mastery = Number(getSubjectExam(subject, eventId)?.mastery);
  return Number.isFinite(mastery) ? Math.max(0, Math.min(100, Math.round(mastery))) : null;
}

function getCheckedEventIds() {
  return [...document.querySelectorAll('.event-checkbox:checked')].map(input => Number(input.value));
}

function renderEvents() {
  const eventList = document.getElementById('eventList');
  const subject = getSelectedSubject();
  const assigned = new Set((subject?.event_ids || []).map(Number));

  if (!allEvents.length) {
    eventList.innerHTML = '<div class="empty">No calendar events found for this account.</div>';
    return;
  }

  eventList.innerHTML = allEvents.map(event => {
    const days = daysUntil(event.startDate);
    const dayText = days === null ? '' : days < 0 ? 'Already passed' : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} left`;
    const checked = assigned.has(event.id) ? 'checked' : '';
    const assignedTag = assigned.has(event.id) ? '<span class="tag">Exam</span>' : '';
    return `
      <label class="event-card">
        <input type="checkbox" class="event-checkbox" value="${event.id}" ${checked}>
        <span class="event-checkmark">&check;</span>
        <span>
          <strong>${escapeHtml(event.title)}</strong>
          <span class="muted">${escapeHtml(formatDate(event.startDate))}${dayText ? ` - ${escapeHtml(dayText)}` : ''}</span>
          ${assignedTag}
        </span>
      </label>
    `;
  }).join('');
}

function renderSubjects() {
  const picker = document.getElementById('subjectPicker');
  if (subjects.some(subject => subject.id === selectedSubjectId)) {
    // Keep current selection.
  } else if (subjects.length) {
    selectedSubjectId = subjects[0].id;
  } else {
    selectedSubjectId = '';
  }

  if (!subjects.length) {
    picker.innerHTML = '<div class="empty">No subjects yet.</div>';
  } else {
    picker.innerHTML = subjects.map(subject => {
      const active = subject.id === selectedSubjectId ? 'active' : '';
      const examCount = (subject.event_ids || []).length;
      return `
        <button class="subject-option ${active}" type="button" data-subject-id="${escapeHtml(subject.id)}">
          <span>${escapeHtml(subject.name)}</span>
          <span class="tag">${examCount} exam${examCount === 1 ? '' : 's'}</span>
        </button>
      `;
    }).join('');
    picker.querySelectorAll('[data-subject-id]').forEach(button => {
      button.addEventListener('click', () => {
        selectedSubjectId = button.dataset.subjectId;
        renderSubjects();
      });
    });
  }

  renderMasteryPanel();
  renderEvents();
  renderPriorityWidgets();
  renderActiveExam();
}

function renderMasteryPanel() {
  const panel = document.getElementById('masteryPanel');
  const input = document.getElementById('masteryInput');
  const value = document.getElementById('masteryValue');
  const subject = getSelectedSubject();
  if (!subject) {
    panel.classList.remove('visible');
    return;
  }
  const mastery = Math.max(0, Math.min(100, Math.round(Number(subject.mastery ?? 35))));
  panel.classList.add('visible');
  input.value = mastery;
  value.textContent = `${mastery}%`;
}

function calculatePriority(days, mastery) {
  if (days === null || days < -1) return 0;
  const assumedMastery = mastery === null ? 35 : mastery;
  const knowledgeGap = 100 - assumedMastery;
  const urgency = Math.max(20, 100 - Math.min(Math.max(days, 0), 21) * (80 / 21));
  return Math.round(knowledgeGap * (0.45 + (urgency / 100) * 0.55));
}

function classifyPriority(priority) {
  if (priority >= 70) return 'high';
  if (priority >= 38) return 'medium';
  return 'low';
}

function getPriorityColor(priority) {
  const hue = Math.round(120 - (Math.max(0, Math.min(100, priority)) * 1.2));
  return `hsl(${hue} 78% 48%)`;
}

function getStudyLoad(priority) {
  if (priority >= 70) return 'Heavy focus';
  if (priority >= 38) return 'Steady practice';
  if (priority > 0) return 'Light review';
  return 'Maintained';
}

function getAssignedExamWidgets() {
  const widgets = [];
  subjects.forEach(subject => {
    (subject.event_ids || []).forEach(eventId => {
      const event = allEvents.find(item => item.id === Number(eventId));
      if (!event) return;
      const days = daysUntil(event.startDate);
      if (days !== null && days < -1) return;
      const mastery = getExamMastery(subject, event.id);
      const priority = calculatePriority(days, mastery);
      widgets.push({ subject, event, days, mastery, priority });
    });
  });
  return widgets.sort((a, b) => b.priority - a.priority || (a.days ?? 9999) - (b.days ?? 9999));
}

function renderPriorityWidgets() {
  const container = document.getElementById('priorityWidgets');
  const widgets = getAssignedExamWidgets();
  if (!widgets.length) {
    container.innerHTML = '<div class="empty">Assign calendar events to a subject to create exam widgets.</div>';
    hideWorkspace();
    return;
  }

  container.innerHTML = widgets.map(item => {
    const className = classifyPriority(item.priority);
    const color = getPriorityColor(item.priority);
    const daysLabel = item.days === 0 ? 'Today' : String(item.days ?? '?');
    const dayWord = item.days === 1 ? 'day left' : 'days left';
    const active = activeExam?.subjectId === item.subject.id && activeExam?.eventId === item.event.id ? 'active' : '';
    const skillText = item.mastery === null ? 'Skill not set' : `${item.mastery}% skill`;
    return `
      <button class="priority-card ${className} ${active}" type="button" data-subject-id="${escapeHtml(item.subject.id)}" data-event-id="${item.event.id}">
        <div class="priority-top">
          <div>
            <h3 class="priority-title">${escapeHtml(item.subject.name)}</h3>
            <div class="muted">${escapeHtml(item.event.title)} - ${escapeHtml(formatDate(item.event.startDate))}</div>
          </div>
          <div class="priority-days">${escapeHtml(daysLabel)}<span>${item.days === 0 ? 'exam day' : dayWord}</span></div>
        </div>
        <div class="priority-track" aria-label="Study priority ${item.priority}%">
          <div class="priority-fill" style="--priority: ${item.priority}%; --priority-color: ${color};"></div>
        </div>
        <div class="priority-meta">
          <span>${item.priority}% priority</span>
          <span>${escapeHtml(skillText)}</span>
          <span>${getStudyLoad(item.priority)}</span>
        </div>
      </button>
    `;
  }).join('');

  container.querySelectorAll('[data-subject-id][data-event-id]').forEach(button => {
    button.addEventListener('click', () => activateExam(button.dataset.subjectId, Number(button.dataset.eventId)));
  });
}

function activateExam(subjectId, eventId) {
  activeExam = { subjectId, eventId };
  selectedSubjectId = subjectId;
  localStorage.setItem('studyTrainerActiveExam', JSON.stringify(activeExam));
  selectedFiles = [];
  document.getElementById('fileInput').value = '';
  trainerScreen.classList.add('exam-open');
  renderSubjects();
}

function restoreActiveExam() {
  activeExam = null;
  hideWorkspace();
  renderPriorityWidgets();
}

function getActiveSubject() {
  return subjects.find(subject => subject.id === activeExam?.subjectId) || null;
}

function getActiveEvent() {
  return allEvents.find(event => event.id === activeExam?.eventId) || null;
}

function getActiveExamRecord() {
  return getSubjectExam(getActiveSubject(), activeExam?.eventId) || {};
}

function hideWorkspace() {
  trainerScreen.classList.remove('exam-open');
  document.getElementById('workspaceEmpty').hidden = false;
  document.getElementById('activeExamHead').hidden = true;
  document.getElementById('workspaceGrid').hidden = true;
}

function closeExamWorkspace() {
  activeExam = null;
  selectedFiles = [];
  localStorage.removeItem('studyTrainerActiveExam');
  document.getElementById('fileInput').value = '';
  hideWorkspace();
  renderPriorityWidgets();
}

function renderActiveExam() {
  const subject = getActiveSubject();
  const event = getActiveEvent();
  const isAssigned = subject?.event_ids?.map(Number).includes(event?.id);
  if (!subject || !event || !isAssigned || daysUntil(event.startDate) < -1) {
    hideWorkspace();
    return;
  }

  const exam = getActiveExamRecord();
  document.getElementById('workspaceEmpty').hidden = true;
  document.getElementById('activeExamHead').hidden = false;
  document.getElementById('workspaceGrid').hidden = false;
  trainerScreen.classList.add('exam-open');
  document.getElementById('activeExamTitle').textContent = `${subject.name}: ${event.title}`;
  const days = daysUntil(event.startDate);
  const skill = exam.mastery === null || exam.mastery === undefined ? 'Skill not set' : `${exam.mastery}% skill`;
  document.getElementById('activeExamMeta').textContent = `${formatDate(event.startDate)} - ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} left`} - ${skill}`;
  document.getElementById('linksInput').value = (exam.links || []).join(', ');
  document.getElementById('promptInput').value = '';
  document.getElementById('mockExamSummary').textContent = exam.mock_exam?.summary || 'Save material, then generate the first mock exam.';
  renderChatThread(exam);
  renderFileList();
  renderQuestions(exam);
  renderInsights(exam.insights || {});
  renderStudyMaterial(exam.mock_exam?.study_plan || [], exam.insights || {});
  renderPriorityWidgets();
}

async function createSubject() {
  const input = document.getElementById('subjectNameInput');
  const name = input.value.trim();
  if (name.length < 2) {
    showMessage('Enter a subject name first.', 'error');
    return;
  }
  const response = await apiFetch('/study-trainer/subjects', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  const data = await parseResponseJsonSafe(response);
  if (!response.ok) {
    showMessage(data.error || 'Failed to create subject', 'error');
    return;
  }
  input.value = '';
  subjects.push(data.subject);
  selectedSubjectId = data.subject.id;
  renderSubjects();
  showMessage('Subject created.', 'success');
}

async function assignEventsToSubject() {
  const subject = getSelectedSubject();
  if (!subject) {
    showMessage('Create or select a subject first.', 'error');
    return;
  }
  const eventIds = getCheckedEventIds();
  const response = await apiFetch(`/study-trainer/subjects/${subject.id}`, {
    method: 'PUT',
    body: JSON.stringify({ event_ids: eventIds })
  });
  const data = await parseResponseJsonSafe(response);
  if (!response.ok) {
    showMessage(data.error || 'Failed to assign events', 'error');
    return;
  }
  subjects = subjects.map(item => item.id === data.subject.id ? data.subject : item);
  activeExam = null;
  localStorage.removeItem('studyTrainerActiveExam');
  renderSubjects();
  showMessage('Exam widgets updated.', 'success');
}

async function saveSubjectMastery(value) {
  const subject = getSelectedSubject();
  if (!subject) return;
  const mastery = Math.max(0, Math.min(100, Number(value) || 0));
  subject.mastery = mastery;
  window.clearTimeout(masterySaveTimer);
  masterySaveTimer = window.setTimeout(async () => {
    try {
      const response = await apiFetch(`/study-trainer/subjects/${subject.id}`, {
        method: 'PUT',
        body: JSON.stringify({ mastery })
      });
      const data = await parseResponseJsonSafe(response);
      if (!response.ok) throw new Error(data.error || 'Failed to save skill level');
      subjects = subjects.map(item => item.id === data.subject.id ? data.subject : item);
      renderSubjects();
    } catch (error) {
      showMessage(error.message || 'Failed to save skill level', 'error');
    }
  }, 450);
}

async function completeSubject() {
  const subject = getSelectedSubject();
  if (!subject) {
    showMessage('Select the subject whose exams are over.', 'error');
    return;
  }
  if (!confirm(`Clear ${subject.name} and all its exam workspaces?`)) return;
  const response = await apiFetch(`/study-trainer/subjects/${subject.id}/complete`, { method: 'POST' });
  const data = await parseResponseJsonSafe(response);
  if (!response.ok) {
    showMessage(data.error || 'Failed to clear subject', 'error');
    return;
  }
  subjects = subjects.filter(item => item.id !== subject.id);
  activeExam = null;
  localStorage.removeItem('studyTrainerActiveExam');
  renderSubjects();
  showMessage('Subject exam data cleared.', 'success');
}

async function removeActiveExam() {
  const subject = getActiveSubject();
  const event = getActiveEvent();
  if (!subject || !event) return;
  if (!confirm(`Remove the ${event.title} widget and its stored trainer data?`)) return;
  const response = await apiFetch(`/study-trainer/subjects/${subject.id}/exams/${event.id}`, { method: 'DELETE' });
  const data = await parseResponseJsonSafe(response);
  if (!response.ok) {
    showMessage(data.error || 'Failed to remove exam', 'error');
    return;
  }
  subjects = subjects.map(item => item.id === data.subject.id ? data.subject : item);
  activeExam = null;
  localStorage.removeItem('studyTrainerActiveExam');
  restoreActiveExam();
  showMessage('Exam widget removed.', 'success');
}

function getMaterialFormData({ includeChat = false } = {}) {
  const formData = new FormData();
  const links = document.getElementById('linksInput').value
    .split(',')
    .map(link => link.trim())
    .filter(Boolean);
  const prompt = document.getElementById('promptInput').value.trim();
  formData.append('links', JSON.stringify(links));
  formData.append('prompt', includeChat ? (getActiveExamRecord().prompt || '') : prompt);
  formData.append('notes', includeChat ? (getActiveExamRecord().notes || '') : prompt);
  if (includeChat) formData.append('chat_message', prompt);
  selectedFiles.forEach(file => formData.append('files', file));
  return formData;
}

async function saveExamMaterial({ silent = false, includeChat = false } = {}) {
  const subject = getActiveSubject();
  const event = getActiveEvent();
  if (!subject || !event) {
    showMessage('Open an exam widget first.', 'error');
    return false;
  }
  const response = await apiFetch(`/study-trainer/subjects/${subject.id}/exams/${event.id}/material`, {
    method: 'POST',
    body: getMaterialFormData({ includeChat })
  });
  const data = await parseResponseJsonSafe(response);
  if (!response.ok) {
    showMessage(data.error || 'Failed to save exam material', 'error');
    return false;
  }
  subjects = subjects.map(item => item.id === data.subject.id ? data.subject : item);
  selectedFiles = [];
  document.getElementById('fileInput').value = '';
  renderSubjects();
  if (!silent) showMessage('Exam material saved.', 'success');
  return true;
}

async function generateMockExam() {
  const subject = getActiveSubject();
  const event = getActiveEvent();
  if (!subject || !event) {
    showMessage('Open an exam widget first.', 'error');
    return;
  }
  const saved = await saveExamMaterial({ silent: true });
  if (!saved) return;

  const btn = document.getElementById('generateBtn');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  try {
    const response = await apiFetch(`/study-trainer/subjects/${subject.id}/exams/${event.id}/generate`, { method: 'POST' });
    const data = await parseResponseJsonSafe(response);
    if (!response.ok) throw new Error(data.error || 'Failed to generate mock exam');
    subjects = subjects.map(item => item.id === data.subject.id ? data.subject : item);
    renderSubjects();
    showMessage('Mock exam generated and stored.', 'success');
  } catch (error) {
    showMessage(error.message || 'Failed to generate mock exam', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Mock Exam';
  }
}

function renderQuestions(exam) {
  const questions = exam.mock_exam?.questions || [];
  const answers = exam.answers || [];
  const container = document.getElementById('questions');
  if (!questions.length) {
    container.innerHTML = '<div class="empty">No mock exam yet.</div>';
    document.getElementById('submitAnswersBtn').style.display = 'none';
    return;
  }
  container.innerHTML = questions.map(question => {
    const existing = answers.find(answer => answer.question_id === question.id);
    return `
      <article class="question-card" data-question-id="${escapeHtml(question.id)}">
        <div>
          <span class="tag">${escapeHtml(question.difficulty || 'medium')}</span>
          <span class="tag">${escapeHtml(question.topic || 'Core material')}</span>
        </div>
        <h3>${escapeHtml(question.prompt || 'Question')}</h3>
        <div class="muted">Hint: ${escapeHtml(question.hint || '')}</div>
        <textarea placeholder="Write your answer here.">${escapeHtml(existing?.answer || '')}</textarea>
        <div class="feedback">${existing ? `Score ${Math.round(existing.score * 100)}% - ${escapeHtml(existing.feedback)}` : ''}</div>
        <div class="review-details">${existing ? renderAnswerReview(existing) : ''}</div>
      </article>
    `;
  }).join('');
  document.getElementById('submitAnswersBtn').style.display = 'inline-block';
}

function renderAnswerReview(answer) {
  const verdict = answer.is_correct ? 'Marked correct' : 'Needs revision';
  const target = answer.target_points ? `<div><strong>Target points:</strong> ${escapeHtml(answer.target_points)}</div>` : '';
  const area = answer.needed_area ? `<div><strong>Weak area:</strong> ${escapeHtml(answer.needed_area)}</div>` : '';
  return `<div><strong>${verdict}.</strong> ${escapeHtml(answer.review || '')}</div>${target}${area}`;
}

async function submitAnswers() {
  const subject = getActiveSubject();
  const event = getActiveEvent();
  if (!subject || !event) return;
  const answers = [...document.querySelectorAll('.question-card')].map(card => ({
    question_id: card.dataset.questionId,
    answer: card.querySelector('textarea').value.trim()
  }));
  const btn = document.getElementById('submitAnswersBtn');
  btn.disabled = true;
  btn.textContent = 'Analyzing...';
  try {
    const response = await apiFetch(`/study-trainer/subjects/${subject.id}/exams/${event.id}/answers`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
    const data = await parseResponseJsonSafe(response);
    if (!response.ok) throw new Error(data.error || 'Failed to analyze answers');
    subjects = subjects.map(item => item.id === data.subject.id ? data.subject : item);
    renderSubjects();
    showMessage('Answers analyzed. Skill level and study material updated.', 'success');
  } catch (error) {
    showMessage(error.message || 'Failed to analyze answers', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Question Sheet';
  }
}

function renderInsights(insights) {
  const block = (title, items) => {
    if (!Array.isArray(items) || !items.length) return '';
    return `<h3>${title}</h3><ul class="insight-list">${items.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`;
  };
  document.getElementById('insights').innerHTML =
    block('Understood Well', insights.strengths) +
    block('Needs More Work', insights.needs_work) +
    block('Next Tasks', insights.next_tasks) ||
    '<span class="muted">Feedback appears after submitting the mock exam.</span>';
}

function renderChatThread(exam) {
  const thread = document.getElementById('chatThread');
  const messages = Array.isArray(exam.chat_messages) ? exam.chat_messages : [];
  if (!messages.length) {
    thread.innerHTML = '<div class="empty">No chat notes yet.</div>';
    return;
  }
  thread.innerHTML = messages.map(message => (
    `<div class="chat-message ${escapeHtml(message.role || 'user')}">${escapeHtml(message.content || '')}</div>`
  )).join('');
}

function renderStudyMaterial(plan, insights) {
  const planHtml = (plan || []).map(day => {
    const tasks = Array.isArray(day.tasks) ? day.tasks : [];
    return `
      <div class="day-card">
        <span class="tag">Day ${escapeHtml(String(day.day || ''))}</span>
        <h3>${escapeHtml(day.focus || 'Study focus')}</h3>
        <ul class="insight-list">${tasks.map(task => `<li>${escapeHtml(String(task))}</li>`).join('')}</ul>
      </div>
    `;
  }).join('');
  const material = Array.isArray(insights.study_material) ? insights.study_material : [];
  const materialHtml = material.length
    ? `<div class="day-card"><h3>Targeted Review</h3><ul class="insight-list">${material.map(item => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul></div>`
    : '';
  document.getElementById('planDays').innerHTML = planHtml + materialHtml || '<div class="empty">Study material appears after generation or analysis.</div>';
}

function setSelectedFiles(files) {
  const existing = new Map(selectedFiles.map(file => [`${file.name}:${file.size}:${file.lastModified}`, file]));
  for (const file of files) existing.set(`${file.name}:${file.size}:${file.lastModified}`, file);
  selectedFiles = [...existing.values()];
  renderFileList();
}

function renderFileList() {
  const fileList = document.getElementById('fileList');
  const exam = getActiveExamRecord();
  const savedFiles = Array.isArray(exam.files) ? exam.files : [];
  const savedHtml = savedFiles.map(file => `<div>${escapeHtml(file.filename || 'Uploaded file')} <span class="muted">(stored)</span></div>`).join('');
  const selectedHtml = selectedFiles.map(file => `<div>${escapeHtml(file.name)} <span class="muted">(${Math.ceil(file.size / 1024)} KB new)</span></div>`).join('');
  fileList.innerHTML = savedHtml + selectedHtml || '<span class="muted">No files stored for this exam yet.</span>';
}

function initializeUploadZone() {
  const fileInput = document.getElementById('fileInput');
  const uploadZone = document.getElementById('uploadZone');
  fileInput.addEventListener('change', () => setSelectedFiles(fileInput.files));
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, event => {
      event.preventDefault();
      uploadZone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, event => {
      event.preventDefault();
      uploadZone.classList.remove('drag-over');
    });
  });
  uploadZone.addEventListener('drop', event => setSelectedFiles(event.dataTransfer.files));
  renderFileList();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const username = document.getElementById('usernameInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  if (!username || !password) {
    showLoginError('Please enter both username and password');
    return;
  }
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  try {
    clearLoginError();
    await loginWithPassword(username, password);
    await enterApp();
  } catch (error) {
    showLoginError(error.message || 'Login failed');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});

document.getElementById('passwordInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('generateBtn').addEventListener('click', generateMockExam);
document.getElementById('submitAnswersBtn').addEventListener('click', submitAnswers);
document.getElementById('createSubjectBtn').addEventListener('click', createSubject);
document.getElementById('assignEventsBtn').addEventListener('click', assignEventsToSubject);
document.getElementById('completeSubjectBtn').addEventListener('click', completeSubject);
document.getElementById('removeExamBtn').addEventListener('click', removeActiveExam);
document.getElementById('backToDashboardBtn').addEventListener('click', closeExamWorkspace);
document.getElementById('saveMaterialBtn').addEventListener('click', () => saveExamMaterial());
document.getElementById('savePromptBtn').addEventListener('click', () => saveExamMaterial({ includeChat: true }));
document.getElementById('masteryInput').addEventListener('input', event => {
  const mastery = Math.max(0, Math.min(100, Number(event.target.value) || 0));
  document.getElementById('masteryValue').textContent = `${mastery}%`;
  saveSubjectMastery(mastery);
});
document.getElementById('subjectNameInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') createSubject();
});

document.addEventListener('DOMContentLoaded', async () => {
  initializeUploadZone();
  if (getStoredAccessToken() && await fetchUserProfile()) await enterApp();
});
