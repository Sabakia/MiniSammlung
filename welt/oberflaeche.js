// Bedienoberflaeche: Statistik, Laenderkarte, Liste, Werkzeuge.

const KONTINENTE = {
  'Europe':        'Europa',
  'Asia':          'Asien',
  'Africa':        'Afrika',
  'North America': 'Nordamerika',
  'South America': 'Südamerika',
  'Oceania':       'Ozeanien',
  'Antarctica':    'Antarktis',
  'Seven seas (open ocean)': 'Inseln im Ozean',
}
const RING_UMFANG = 2 * Math.PI * 52
const TOAST_DAUER = 3200

let aktivesLand = null
let listenFilter = 'alle'
let listenSuche  = ''
let pinModus     = false
let wartenderOrt = null
let toastTimer   = null

const $ = id => document.getElementById(id)

function kontinentName(k) {
  return KONTINENTE[k] || k
}

// ─── Sync-Anzeige & Toast ────────────────────────────────────────────────────
function syncMelden(zustand, detail = '') {
  const texte = {
    ok:      'Synchron mit GitHub',
    lokal:   'Nur auf diesem Gerät',
    wartet:  'Speichert…',
    offline: 'Offline · lokal',
    fehler:  detail || 'Fehler beim Speichern',
  }
  $('sync').dataset.zustand = zustand
  $('sync-text').textContent = texte[zustand] || zustand
  $('sync').title = zustand === 'lokal'
    ? 'In der Bar als Admin anmelden, dann wird die Karte auf allen Geräten synchronisiert.'
    : texte[zustand]
}

function toast(html) {
  const el = $('toast')
  el.innerHTML = html
  el.classList.add('sichtbar')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.remove('sichtbar'), TOAST_DAUER)
}

// ─── Statistik ───────────────────────────────────────────────────────────────
function zaehlen(laender) {
  const besucht = laender.filter(l => statusVon(l) === 'besucht')
  const wunsch  = laender.filter(l => statusVon(l) === 'wunsch')
  const gesamtFl  = laender.reduce((s, l) => s + l.flaeche, 0)
  const besuchtFl = besucht.reduce((s, l) => s + l.flaeche, 0)
  return { besucht, wunsch, prozent: gesamtFl ? (besuchtFl / gesamtFl) * 100 : 0 }
}

function prozentText(p) {
  if (p === 0) return '0%'
  return p < 1 ? p.toFixed(1).replace('.', ',') + '%' : Math.round(p) + '%'
}

function kontinentZeile(name, laender) {
  const besucht = laender.filter(l => statusVon(l) === 'besucht').length
  const anteil  = Math.round((besucht / laender.length) * 100)
  return `<button class="kontinent" data-kontinent="${esc(name)}" style="--anteil:${anteil}%">
      <span class="k-name">${esc(kontinentName(name))}</span>
      <span class="k-zahl">${besucht}<small>/${laender.length}</small></span>
      <span class="k-balken"><i></i></span>
    </button>`
}

function renderStatistik() {
  const { besucht, wunsch, prozent } = zaehlen(alleLaender)
  $('stat-prozent').textContent = prozentText(prozent)
  $('stat-besucht').textContent = besucht.length
  $('stat-wunsch').textContent  = wunsch.length
  $('stat-offen').textContent   = alleLaender.length - besucht.length
  $('stat-orte').textContent    = reise.orte.length
  const sichtbar = Math.max(prozent, prozent > 0 ? 1.5 : 0)
  $('ring-wert').style.strokeDashoffset = RING_UMFANG * (1 - sichtbar / 100)

  const gruppen = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania']
  $('kontinente').innerHTML = gruppen
    .map(k => kontinentZeile(k, alleLaender.filter(l => l.kontinent === k)))
    .join('')
}

// ─── Laenderkarte ────────────────────────────────────────────────────────────
function landKarteOeffnen(land) {
  aktivesLand = land
  const eintrag = reise.laender[land.code] || {}
  $('k-flagge').innerHTML      = land.flagge
  $('k-name').textContent      = land.name
  $('k-kontinent').textContent = kontinentName(land.kontinent)
  $('k-jahr').value  = eintrag.jahr  || ''
  $('k-notiz').value = eintrag.notiz || ''
  statusKnoepfe(eintrag.status || '')
  $('land-karte').classList.add('offen')
  landAuswaehlen(land)
  drehenSetzen(false)
  $('btn-drehen').classList.remove('aktiv')
  hinfliegen(land)
}

function landKarteSchliessen() {
  aktivesLand = null
  $('land-karte').classList.remove('offen')
  landAuswaehlen(null)
}

function statusKnoepfe(status) {
  document.querySelectorAll('.status-wahl button').forEach(b => {
    const an = b.dataset.status === status
    b.classList.toggle('aktiv', an)
    b.setAttribute('aria-checked', an)
  })
  $('karte-felder').classList.toggle('zu', !status)
}

function statusWaehlen(status) {
  if (!aktivesLand) return
  landSetzen(aktivesLand.code, { status })
  statusKnoepfe(status)
  allesNeuZeichnen()
  if (status === 'besucht') toast(`${aktivesLand.flagge} <strong>${esc(aktivesLand.name)}</strong> abgehakt!`)
}

function felderSpeichern() {
  if (!aktivesLand || !reise.laender[aktivesLand.code]) return
  landSetzen(aktivesLand.code, { jahr: $('k-jahr').value.trim(), notiz: $('k-notiz').value.trim() })
  renderListe()
}

// ─── Liste ───────────────────────────────────────────────────────────────────
function passtZumFilter(land) {
  const s = statusVon(land)
  if (listenFilter === 'besucht' && s !== 'besucht') return false
  if (listenFilter === 'wunsch'  && s !== 'wunsch')  return false
  if (listenFilter === 'offen'   && s === 'besucht') return false
  return !listenSuche || land.name.toLowerCase().includes(listenSuche)
}

function landZeile(land) {
  const s = statusVon(land)
  const jahr = reise.laender[land.code]?.jahr
  const zeichen = s === 'besucht' ? '✓' : s === 'wunsch' ? '★' : ''
  return `<button class="zeile" data-code="${esc(land.code)}" data-status="${s}">
      <span class="z-flagge">${land.flagge}</span>
      <span class="z-name">${esc(land.name)}${jahr ? `<small>${esc(jahr)}</small>` : ''}</span>
      <span class="z-status">${zeichen}</span>
    </button>`
}

function laenderListeHTML() {
  const treffer = alleLaender
    .filter(passtZumFilter)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  if (!treffer.length) return '<p class="leer">Nichts gefunden.</p>'
  const gruppen = [...new Set(treffer.map(l => l.kontinent))].sort((a, b) =>
    kontinentName(a).localeCompare(kontinentName(b), 'de'))
  return gruppen.map(k => {
    const liste = treffer.filter(l => l.kontinent === k)
    return `<h3>${esc(kontinentName(k))} <span>${liste.length}</span></h3>${liste.map(landZeile).join('')}`
  }).join('')
}

function orteListeHTML() {
  const orte = reise.orte.filter(o => !listenSuche || o.name.toLowerCase().includes(listenSuche))
  if (!orte.length) return '<p class="leer">Noch keine Orte. Tippe auf „📍 Ort setzen“ und dann auf den Globus.</p>'
  return orte.map(o => `<div class="zeile ort-zeile">
      <button class="z-name" data-ort="${esc(o.id)}">📍 ${esc(o.name)}</button>
      <button class="z-weg" data-ort-weg="${esc(o.id)}" aria-label="Ort entfernen">✕</button>
    </div>`).join('')
}

function renderListe() {
  $('liste-inhalt').innerHTML = listenFilter === 'orte' ? orteListeHTML() : laenderListeHTML()
}

function listeUmschalten(an) {
  $('liste').classList.toggle('offen', an)
  $('btn-liste').classList.toggle('aktiv', an)
  if (an) renderListe()
}

function listeKlick(e) {
  const zeile = e.target.closest('[data-code]')
  if (zeile) {
    const land = alleLaender.find(l => l.code === zeile.dataset.code)
    if (land) landKarteOeffnen(land)
    if (window.innerWidth < 760) listeUmschalten(false)
    return
  }
  const weg = e.target.closest('[data-ort-weg]')
  if (weg) { ortEntfernen(weg.dataset.ortWeg); allesNeuZeichnen(); return }
  const ortKnopf = e.target.closest('[data-ort]')
  const ort = ortKnopf && reise.orte.find(o => o.id === ortKnopf.dataset.ort)
  if (ort) zuOrtFliegen(ort)
}

// ─── Orte / Pins ─────────────────────────────────────────────────────────────
function pinModusSetzen(an) {
  pinModus = an
  $('btn-pin').classList.toggle('aktiv', an)
  $('pin-hinweis').classList.toggle('sichtbar', an)
  document.body.classList.toggle('pin-modus', an)
  if (an) drehenSetzen(false)
}

function ortDialogOeffnen(koord, land = null) {
  wartenderOrt = { lat: koord.lat, lng: koord.lng, code: land?.code || '' }
  $('ort-koord').textContent = `${koord.lat.toFixed(2)}°, ${koord.lng.toFixed(2)}°`
  $('ort-dialog').classList.add('offen')
  $('ort-name').value = ''
  setTimeout(() => $('ort-name').focus(), 50)
}

function ortDialogSchliessen() {
  wartenderOrt = null
  $('ort-dialog').classList.remove('offen')
}

function ortSpeichern(e) {
  e.preventDefault()
  const name = $('ort-name').value.trim()
  if (!name || !wartenderOrt) return
  const code = wartenderOrt.code || landAnPunkt(wartenderOrt.lat, wartenderOrt.lng)
  const land = alleLaender.find(l => l.code === code)
  ortHinzufuegen(name, wartenderOrt.lat, wartenderOrt.lng, code)
  ortDialogSchliessen()
  pinModusSetzen(false)
  allesNeuZeichnen()
  toast(land
    ? `📍 <strong>${esc(name)}</strong> markiert · ${land.flagge} ${esc(land.name)} ist jetzt besucht`
    : `📍 <strong>${esc(name)}</strong> markiert`)
}

function ortAngeklickt(ort) {
  toast(`📍 <strong>${esc(ort.name)}</strong> <button class="toast-knopf" data-ort-weg="${esc(ort.id)}">Entfernen</button>`)
}

// ─── Globus-Rueckrufe ────────────────────────────────────────────────────────
function beiLandKlick(land, koord) {
  if (pinModus) { ortDialogOeffnen(koord, land); return }
  if (land) landKarteOeffnen(land)
}

function beiGlobusKlick(koord) {
  if (pinModus) { ortDialogOeffnen(koord); return }
  landKarteSchliessen()
}

// ─── Werkzeuge ───────────────────────────────────────────────────────────────
function zufallsZiel() {
  const wunsch = alleLaender.filter(l => statusVon(l) === 'wunsch')
  const offen  = alleLaender.filter(l => !statusVon(l) && l.kontinent !== 'Antarctica')
  const topf   = wunsch.length && Math.random() < 0.5 ? wunsch : offen
  if (!topf.length) { toast('🏆 Du warst schon überall!'); return }
  const land = topf[Math.floor(Math.random() * topf.length)]
  landKarteOeffnen(land)
  toast(`🎲 Wie wär's mit <strong>${land.flagge} ${esc(land.name)}</strong>?`)
}

function nebelUmschalten() {
  const an = !$('btn-nebel').classList.contains('aktiv')
  $('btn-nebel').classList.toggle('aktiv', an)
  document.body.classList.toggle('nebel', an)
  nebelSetzen(an)
  if (an) toast('Hell leuchtend: alles, wo du <strong>noch nicht</strong> warst')
}

function drehenUmschalten() {
  const an = !$('btn-drehen').classList.contains('aktiv')
  $('btn-drehen').classList.toggle('aktiv', an)
  drehenSetzen(an)
}

function kontinentFiltern(e) {
  const knopf = e.target.closest('[data-kontinent]')
  if (!knopf) return
  const laender = alleLaender.filter(l => l.kontinent === knopf.dataset.kontinent)
  const groesstes = laender.reduce((a, b) => (b.flaeche > a.flaeche ? b : a))
  globus.pointOfView({ ...groesstes.mitte, altitude: 1.9 }, 1200)
}

async function importieren(e) {
  const datei = e.target.files[0]
  e.target.value = ''
  if (!datei) return
  try {
    await reiseImportieren(datei)
    allesNeuZeichnen()
    toast('⬆ Import erfolgreich')
  } catch {
    toast('Import fehlgeschlagen — keine gültige Datei')
  }
}

function allesNeuZeichnen() {
  renderStatistik()
  globusAktualisieren()
  orteZeigen(reise.orte)
  if ($('liste').classList.contains('offen')) renderListe()
}

// ─── Events ──────────────────────────────────────────────────────────────────
function initWerkzeuge() {
  $('btn-liste').addEventListener('click', () => listeUmschalten(!$('liste').classList.contains('offen')))
  $('liste-zu').addEventListener('click', () => listeUmschalten(false))
  $('btn-pin').addEventListener('click', () => pinModusSetzen(!pinModus))
  $('pin-abbrechen').addEventListener('click', () => pinModusSetzen(false))
  $('btn-nebel').addEventListener('click', nebelUmschalten)
  $('btn-zufall').addEventListener('click', zufallsZiel)
  $('btn-drehen').addEventListener('click', drehenUmschalten)
  $('btn-export').addEventListener('click', reiseExportieren)
  $('import-input').addEventListener('change', importieren)
  $('kontinente').addEventListener('click', kontinentFiltern)
}

function initKarte() {
  $('karte-zu').addEventListener('click', landKarteSchliessen)
  document.querySelectorAll('.status-wahl button').forEach(b =>
    b.addEventListener('click', () => statusWaehlen(b.dataset.status)))
  $('k-jahr').addEventListener('change', felderSpeichern)
  $('k-notiz').addEventListener('change', felderSpeichern)
}

function initListe() {
  $('liste-inhalt').addEventListener('click', listeKlick)
  $('liste-suche').addEventListener('input', e => { listenSuche = e.target.value.trim().toLowerCase(); renderListe() })
  document.querySelectorAll('.reiter button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.reiter button').forEach(x => x.classList.toggle('aktiv', x === b))
    listenFilter = b.dataset.filter
    renderListe()
  }))
}

function initDialog() {
  $('ort-form').addEventListener('submit', ortSpeichern)
  $('ort-abbrechen').addEventListener('click', ortDialogSchliessen)
  $('toast').addEventListener('click', e => {
    const weg = e.target.closest('[data-ort-weg]')
    if (!weg) return
    ortEntfernen(weg.dataset.ortWeg)
    allesNeuZeichnen()
    $('toast').classList.remove('sichtbar')
  })
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    ortDialogSchliessen(); pinModusSetzen(false); landKarteSchliessen()
  })
}

async function start() {
  initWerkzeuge(); initKarte(); initListe(); initDialog()
  try {
    await Promise.all([laenderLaden(), reiseLaden()])
    orteLaenderNachtragen(landAnPunkt)
    globusErstellen($('globus'), { beiLandKlick, beiGlobusKlick, beiOrtKlick: ortAngeklickt })
    allesNeuZeichnen()
    $('laden').classList.add('fertig')
  } catch (err) {
    $('laden').innerHTML = `<span>Die Karte konnte nicht geladen werden.<br><small>${esc(err.message)}</small></span>`
  }
}

start()
