let deferredPrompt;

function isRunningAsInstalledPwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.navigator.standalone === true
    || document.referrer.includes('android-app://');
}

// Registers the service worker used by the installable site shell.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js')
    .then(registration => console.log('service worker registered', registration))
    .catch(error => console.log('service worker not registered', error));
}

// Shows the browser install prompt from the cached beforeinstallprompt event.
async function installApp(button) {
  if (!deferredPrompt || !button) return;

  deferredPrompt.prompt();
  button.disabled = true;

  const choiceResult = await deferredPrompt.userChoice;
  if (choiceResult.outcome === 'accepted') {
    button.hidden = true;
  }

  button.disabled = false;
  deferredPrompt = null;
}

// Wires the optional PWA install button when a page includes one.
function initializeInstallPrompt() {
  const installButton = document.getElementById('install_button');
  if (!installButton) return;

  if (isRunningAsInstalledPwa()) {
    installButton.hidden = true;
    return;
  }

  window.addEventListener('beforeinstallprompt', event => {
    if (isRunningAsInstalledPwa()) {
      installButton.hidden = true;
      return;
    }

    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  installButton.addEventListener('click', () => installApp(installButton));
}

registerServiceWorker();
initializeInstallPrompt();
