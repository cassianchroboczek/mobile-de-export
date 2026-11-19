const statusEl = document.getElementById('status');
const output = document.getElementById('output');

function setStatus(msg, cls = '') {
  statusEl.textContent = msg;
  statusEl.className = cls;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback für Fälle, in denen die Clipboard-API blockiert ist
    output.focus();
    output.select();
    return document.execCommand('copy');
  }
}

async function run() {
  setStatus('Lese Inserat …');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !/^https:\/\/([a-z0-9-]+\.)*mobile\.de\//i.test(tab.url || '')) {
    setStatus('Bitte zuerst ein Inserat auf mobile.de öffnen.', 'err');
    return;
  }
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractListing
    });
    if (!result || !result.ok) {
      setStatus(result?.error || 'Auf dieser Seite wurde kein Inserat gefunden.', 'err');
      output.value = result?.text || '';
      return;
    }
    output.value = result.text;
    const ok = await copyText(result.text);
    setStatus(ok ? '✓ In die Zwischenablage kopiert' : 'Text eingelesen. Bitte „Kopieren“ klicken.', ok ? 'ok' : '');
  } catch (e) {
    setStatus('Fehler: ' + e.message, 'err');
  }
}

document.getElementById('copy').addEventListener('click', async () => {
  const ok = await copyText(output.value);
  setStatus(ok ? '✓ In die Zwischenablage kopiert' : 'Kopieren fehlgeschlagen', ok ? 'ok' : 'err');
});
document.getElementById('reload').addEventListener('click', run);

run();
