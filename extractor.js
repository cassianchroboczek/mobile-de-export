// Diese Funktion wird per chrome.scripting in die mobile.de-Seite injiziert.
// Sie muss vollständig in sich geschlossen sein (keine externen Variablen).
function extractListing() {
  const clean = (s) => (s || '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const txt = (el) => clean(el ? el.innerText : '');
  const NOISE = /^(mehr anzeigen|weniger anzeigen|alle anzeigen|mehr|weniger|anrufen|nachricht schreiben|e-mail schreiben|nachricht senden|telefonnummer anzeigen|merken|teilen|parken)$/i;
  const dropNoise = (s) => s.split('\n').filter((l) => !NOISE.test(l.trim())).join('\n').trim();

  const main = document.querySelector('main') || document.body;

  // --- Strukturierte Daten (JSON-LD), falls vorhanden ---
  let ld = null;
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const d = JSON.parse(s.textContent);
      const list = Array.isArray(d) ? d : (d['@graph'] || [d]);
      ld = list.find((o) => /car|vehicle|motorcycle|product/i.test([].concat(o['@type'] || []).join(',')));
      if (ld) break;
    } catch (e) { /* ignorieren */ }
  }

  // --- Abschnitt anhand der Überschrift finden ---
  function section(re) {
    const heads = [...main.querySelectorAll('h1,h2,h3,h4,h5,[role="heading"]')]
      .filter((h) => re.test(txt(h)));
    for (const h of heads) {
      const hText = txt(h);
      let c = h.parentElement;
      while (c && c !== document.body && txt(c).length <= hText.length + 5) c = c.parentElement;
      if (c) {
        let body = txt(c);
        if (body.startsWith(hText)) body = body.slice(hText.length).trim();
        return { el: c, body: dropNoise(body) };
      }
    }
    return null;
  }

  // --- Titel ---
  const title = txt(main.querySelector('h1')) || ld?.name || document.title;

  // --- Preis ---
  let price = '';
  const priceSels = ['[data-testid="prime-price"]', '[data-testid="main-price-label"]', '[data-testid*="price" i]', '[class*="price" i]'];
  for (const sel of priceSels) {
    const el = [...main.querySelectorAll(sel)].find((e) => /\d[\d.\s]*\s?€/.test(e.innerText || ''));
    if (el) { price = (el.innerText.match(/\d[\d.\s]*\s?€(\s*\(?(brutto|netto)\)?)?/i) || [''])[0].trim(); break; }
  }
  if (!price && ld?.offers?.price) price = `${Number(ld.offers.price).toLocaleString('de-DE')} ${ld.offers.priceCurrency === 'EUR' ? '€' : (ld.offers.priceCurrency || '')}`.trim();
  const priceRating = txt(main.querySelector('[data-testid*="price-rating" i], [data-testid*="price-evaluation" i]'));

  // --- Technische Daten (dt/dd-Paare) ---
  const techSec = section(/^technische daten$/i);
  const scope = techSec?.el || main;
  const facts = [];
  const seen = new Set();
  scope.querySelectorAll('dt').forEach((dt) => {
    let dd = dt.nextElementSibling;
    while (dd && dd.tagName !== 'DD') dd = dd.tagName === 'DT' ? null : dd.nextElementSibling;
    const k = txt(dt).replace(/:$/, '');
    const v = txt(dd).replace(/\n+/g, ', ');
    if (k && v && !seen.has(k)) { seen.add(k); facts.push(`${k}: ${v}`); }
  });

  // --- Ausstattung ---
  let features = [];
  const featSec = section(/^ausstattung$/i);
  if (featSec) {
    features = [...featSec.el.querySelectorAll('li')].map(txt).filter(Boolean);
    if (!features.length) features = featSec.body.split('\n').filter(Boolean);
  }

  // --- Beschreibung ---
  const descSec = section(/^(fahrzeugbeschreibung|beschreibung)$/i);
  const description = descSec?.body || '';

  // --- Anbieter ---
  const sellerSec = section(/^(anbieter|händler|verkäufer|privatanbieter|über den händler|kontakt)/i);
  const seller = sellerSec ? sellerSec.body.split('\n').slice(0, 12).join('\n') : '';

  // --- Ergebnis zusammenbauen ---
  const url = location.href.split('#')[0];
  const adId = new URL(location.href).searchParams.get('id') || (location.pathname.match(/(\d{6,})/) || [])[1] || '';

  const out = [];
  out.push(title);
  if (price) out.push(`Preis: ${price}${priceRating ? ' (' + priceRating.replace(/\n+/g, ', ') + ')' : ''}`);
  if (adId) out.push(`Inserat-ID: ${adId}`);
  out.push(`Link: ${url}`);

  if (facts.length) out.push('', '== Technische Daten ==', ...facts);
  else if (techSec?.body) out.push('', '== Technische Daten ==', techSec.body);

  if (features.length) out.push('', '== Ausstattung ==', ...features.map((f) => '- ' + f));
  if (description) out.push('', '== Fahrzeugbeschreibung ==', description);
  if (seller) out.push('', '== Anbieter ==', seller);

  const text = out.join('\n');
  const ok = !!(facts.length || techSec || description || price);
  return ok
    ? { ok: true, text }
    : { ok: false, text, error: 'Kein Inserat erkannt. Bist du auf einer Detailseite eines Fahrzeugs?' };
}
