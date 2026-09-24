// Reisedaten: welche Laender besucht / gewuenscht sind und selbst gesetzte Orte.
// Aendern darf nur, wer in der Bar als Admin angemeldet ist (gleicher
// GitHub-Token). Dann wird im Browser und in data/welt.json im Repo gespeichert.
// Alle anderen sehen nur den veroeffentlichten Stand und koennen nichts aendern.

const WELT_PFAD        = 'data/welt.json'
const LOKAL_SCHLUESSEL = 'mmb-welt'
const TOKEN_SCHLUESSEL = 'mmb-github-token'   // derselbe wie in ../app.js
const SPEICHER_PAUSE   = 1500                 // ms Ruhe, bevor ins Repo geschrieben wird

const WELT_API = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${WELT_PFAD}`
const WELT_ROH = `https://raw.githubusercontent.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/${GITHUB_BRANCH}/${WELT_PFAD}`

// ─── State ───────────────────────────────────────────────────────────────────
let reise = leereReise()
let speicherTimer = null

function leereReise() {
  return { version: 1, geaendert: null, laender: {}, orte: [] }
}

function esc(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function tokenLesen() {
  try { return localStorage.getItem(TOKEN_SCHLUESSEL) || '' } catch { return '' }
}

// Nur bekannte Felder uebernehmen — Daten aus Datei/Repo sind fremde Eingaben.
function reiseBereinigen(roh) {
  const sauber = leereReise()
  if (!roh || typeof roh !== 'object') return sauber
  sauber.geaendert = typeof roh.geaendert === 'string' ? roh.geaendert : null

  const laender = roh.laender && typeof roh.laender === 'object' ? roh.laender : {}
  sauber.laender = Object.fromEntries(
    Object.entries(laender)
      .filter(([code, e]) => /^[A-Z0-9]{3}$/.test(code) && e && ['besucht', 'wunsch'].includes(e.status))
      .map(([code, e]) => [code, {
        status: e.status,
        jahr:   String(e.jahr  || '').slice(0, 40),
        notiz:  String(e.notiz || '').slice(0, 500),
      }])
  )

  sauber.orte = (Array.isArray(roh.orte) ? roh.orte : [])
    .filter(o => o && Number.isFinite(o.lat) && Number.isFinite(o.lng) && o.name)
    .map(o => ({
      id: String(o.id || neueId()), name: String(o.name).slice(0, 80), lat: o.lat, lng: o.lng,
      ...(typeof o.land === 'string' && /^([A-Z0-9]{3})?$/.test(o.land) ? { land: o.land } : {}),
    }))
  return sauber
}

function neueId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ─── Lesen ───────────────────────────────────────────────────────────────────
function lokalLesen() {
  try { return reiseBereinigen(JSON.parse(localStorage.getItem(LOKAL_SCHLUESSEL) || 'null')) }
  catch { return leereReise() }
}

function lokalSchreiben() {
  try { localStorage.setItem(LOKAL_SCHLUESSEL, JSON.stringify(reise)) }
  catch { /* privater Modus — dann nur bis zum Neuladen */ }
}

async function repoLesen() {
  const antwort = await fetch(`${WELT_ROH}?v=${Date.now()}`, { cache: 'no-store' })
  if (antwort.status === 404) return null
  if (!antwort.ok) throw new Error('HTTP ' + antwort.status)
  return reiseBereinigen(await antwort.json())
}

function istNeuer(a, b) {
  return (a?.geaendert || '') > (b?.geaendert || '')
}

// Bearbeiten darf nur, wer in der Bar als Admin angemeldet ist (GitHub-Token).
// Alle anderen sehen nur den veroeffentlichten Stand aus dem Repo.
function istAdmin() {
  return Boolean(tokenLesen())
}

async function ansichtLaden() {
  try {
    reise = (await repoLesen()) || leereReise()
    syncMelden('ansicht')
  } catch {
    reise = leereReise()
    syncMelden('offline')
  }
  return reise
}

// Admin: laedt Browser- und Repo-Stand; der juengere gewinnt.
async function reiseLaden() {
  if (!istAdmin()) return ansichtLaden()
  const lokal = lokalLesen()
  reise = lokal
  try {
    const repo = await repoLesen()
    if (repo && !istNeuer(lokal, repo)) {
      reise = repo
      lokalSchreiben()
    } else if (istNeuer(lokal, repo)) {
      planeRepoSpeichern()
    }
    syncMelden('ok')
  } catch {
    syncMelden('offline')
  }
  return reise
}

// ─── Aendern (immer neue Objekte, nie in-place) ──────────────────────────────
function reiseAendern(neu) {
  if (!istAdmin()) return reise
  reise = { ...neu, geaendert: new Date().toISOString() }
  lokalSchreiben()
  planeRepoSpeichern()
  return reise
}

function landSetzen(code, felder) {
  const alt = reise.laender[code] || { status: '', jahr: '', notiz: '' }
  const eintrag = { ...alt, ...felder }
  const { [code]: _weg, ...rest } = reise.laender
  const laender = eintrag.status ? { ...rest, [code]: eintrag } : rest
  return reiseAendern({ ...reise, laender })
}

// Ein Ort in einem Land heisst: dort war ich. Das Land wird deshalb als
// besucht markiert, sofern es noch keinen Status hat (Wunschziel bleibt nicht,
// es wird zu besucht; "offen" gibt es als gespeicherten Status nicht).
function landDurchOrt(laender, code) {
  if (!code || laender[code]?.status === 'besucht') return laender
  const alt = laender[code] || { jahr: '', notiz: '' }
  return { ...laender, [code]: { ...alt, status: 'besucht' } }
}

function ortHinzufuegen(name, lat, lng, landCode = '') {
  const ort = { id: neueId(), name: name.trim().slice(0, 80), lat, lng, land: landCode }
  const laender = landDurchOrt(reise.laender, landCode)
  return reiseAendern({ ...reise, laender, orte: [...reise.orte, ort] })
}

// Aeltere Orte kennen ihr Land noch nicht — einmalig nachtragen.
function orteLaenderNachtragen(landAnPunkt) {
  const ohneLand = reise.orte.filter(o => o.land === undefined)
  if (!ohneLand.length) return reise
  const orte = reise.orte.map(o => (o.land === undefined ? { ...o, land: landAnPunkt(o.lat, o.lng) } : o))
  const laender = orte
    .filter(o => ohneLand.some(alt => alt.id === o.id))
    .reduce((l, o) => landDurchOrt(l, o.land), reise.laender)
  const neu = { ...reise, laender, orte }
  // Besucher sehen das Ergebnis, gespeichert wird es nur vom Admin.
  if (!istAdmin()) { reise = neu; return reise }
  return reiseAendern(neu)
}

function ortEntfernen(id) {
  return reiseAendern({ ...reise, orte: reise.orte.filter(o => o.id !== id) })
}

// ─── Ins Repo schreiben ──────────────────────────────────────────────────────
function planeRepoSpeichern() {
  clearTimeout(speicherTimer)
  syncMelden('wartet')
  speicherTimer = setTimeout(() => {
    repoSchreiben().then(
      () => syncMelden('ok'),
      err => syncMelden('fehler', err.message)
    )
  }, SPEICHER_PAUSE)
}

function textZuBase64(text) {
  const bytes = new TextEncoder().encode(text)
  const BLOCK = 0x8000
  let binaer  = ''
  for (let i = 0; i < bytes.length; i += BLOCK) {
    binaer += String.fromCharCode.apply(null, bytes.subarray(i, i + BLOCK))
  }
  return btoa(binaer)
}

async function aktuelleSha(kopf) {
  const antwort = await fetch(`${WELT_API}?ref=${GITHUB_BRANCH}&v=${Date.now()}`, { headers: kopf, cache: 'no-store' })
  if (antwort.status === 404) return undefined
  if (!antwort.ok) throw new Error('Lesen fehlgeschlagen (HTTP ' + antwort.status + ')')
  return (await antwort.json()).sha
}

async function repoSchreiben() {
  const kopf = { Authorization: `Bearer ${tokenLesen()}`, Accept: 'application/vnd.github+json' }
  const sha  = await aktuelleSha(kopf)
  const antwort = await fetch(WELT_API, {
    method: 'PUT',
    headers: { ...kopf, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'welt: Reisekarte aktualisiert',
      content: textZuBase64(JSON.stringify(reise, null, 1)),
      branch:  GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  })
  if (antwort.status === 401 || antwort.status === 403 || antwort.status === 404) {
    throw new Error('Token darf nicht schreiben — nur lokal gespeichert')
  }
  if (!antwort.ok) throw new Error('Speichern fehlgeschlagen (HTTP ' + antwort.status + ')')
}

// ─── Export / Import ─────────────────────────────────────────────────────────
function reiseExportieren() {
  const blob = new Blob([JSON.stringify(reise, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `weltreise-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

async function reiseImportieren(datei) {
  const roh = JSON.parse(await datei.text())
  return reiseAendern(reiseBereinigen(roh))
}

// ─── Flaeche (fuer "x % der Welt") ───────────────────────────────────────────
// Kugelflaeche eines Rings in Steradiant (vereinfachte Formel, reicht fuer %).
function ringFlaeche(ring) {
  const rad = Math.PI / 180
  let summe = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = ring[i]
    const [l2, p2] = ring[i + 1]
    summe += (l2 - l1) * rad * (2 + Math.sin(p1 * rad) + Math.sin(p2 * rad))
  }
  return Math.abs(summe / 2)
}

function landFlaeche(geometrie) {
  const polygone = geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.coordinates
  return polygone.reduce((s, poly) =>
    s + ringFlaeche(poly[0]) - poly.slice(1).reduce((l, r) => l + ringFlaeche(r), 0), 0)
}
