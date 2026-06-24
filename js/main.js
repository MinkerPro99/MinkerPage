const routesByButtonId = {
  calendarBtn: 'pages/studyCallendar.html',
  studyTrainerBtn: 'pages/studyTrainer.html',
  smartHomeBtn: 'pages/SmartHome.html',
  vocabularyBtn: 'pages/Vocabulary.html'
};

const routesByAccessKey = {
  IWannaStudy: 'pages/studyCallendar.html',
  StudyTrainer: 'pages/studyTrainer.html',
  SmartHome: 'pages/SmartHome.html',
  Voc: 'pages/Vocabulary.html',
  TEST: 'pages/jan_18_gta6_premiere.html'
};

// Hides the PWA install action when the site already runs as an installed app.
function checkPwaStatus() {
  const isStandalone = typeof isRunningAsInstalledPwa === 'function'
    ? isRunningAsInstalledPwa()
    : window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
      || document.referrer.includes('android-app://');

  if (isStandalone) {
    document.getElementById('install_button')?.setAttribute('hidden', '');
  }
}

// Navigates to the page associated with the entered access key.
function connectWithAccessKey() {
  const key = document.getElementById('connectString')?.value.trim() || '';
  const route = routesByAccessKey[key];

  if (route) {
    window.location.href = route;
    return;
  }

  const errorMessage = document.getElementById('invalidKeyMessage');
  if (errorMessage) errorMessage.hidden = false;
}

// Attaches launcher button routes and install-state listeners.
function initializeMainLauncher() {
  Object.entries(routesByButtonId).forEach(([buttonId, route]) => {
    document.getElementById(buttonId)?.addEventListener('click', () => {
      window.location.href = route;
    });
  });

  document.getElementById('connectBtn')?.addEventListener('click', connectWithAccessKey);
  window.addEventListener('appinstalled', () => {
    document.getElementById('install_button')?.setAttribute('hidden', '');
  });
  checkPwaStatus();
}

document.addEventListener('DOMContentLoaded', initializeMainLauncher);
