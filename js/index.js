// Opens the main launcher page.
function bootToMainPage() {
  document.getElementById('bootBtn')?.classList.add('system-activated');
  window.location.href = 'main.html';
}

document.getElementById('bootBtn')?.addEventListener('click', bootToMainPage);
