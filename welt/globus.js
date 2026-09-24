// 3D-Globus (globe.gl / three.js). Kennt nur Darstellung — was ein Klick
// bedeutet, entscheidet oberflaeche.js ueber die uebergebenen Rueckrufe.

const FARBEN = {
  besucht:      'rgba(232,168,74,0.94)',
  besuchtSeite: 'rgba(193,127,58,0.55)',
  wunsch:       'rgba(95,179,168,0.78)',
  wunschSeite:  'rgba(95,179,168,0.35)',
  offen:        'rgba(58,48,40,0.72)',
  offenSeite:   'rgba(58,48,40,0.25)',
  nebelOffen:   'rgba(242,234,216,0.30)',
  nebelBekannt: 'rgba(40,32,26,0.55)',
  rand:         'rgba(242,234,216,0.16)',
  randAuswahl:  'rgba(255,240,210,0.95)',
  besuchtAuswahl: 'rgba(255,196,110,1)',
  wunschAuswahl:  'rgba(125,215,202,0.95)',
  offenAuswahl:   'rgba(242,234,216,0.42)',
  atmosphaere:  '#c17f3a',
}

const HOEHE = { offen: 0.006, wunsch: 0.014, besucht: 0.024, auswahl: 0.06, hover: 0.012 }

let globus       = null
let alleLaender  = []
let ausgewaehlt  = null
let hoverLand    = null
let nebelModus   = false

// ─── Geometrie-Helfer ────────────────────────────────────────────────────────
function groesstesPolygon(geometrie) {
  if (geometrie.type === 'Polygon') return geometrie.coordinates
  return geometrie.coordinates.reduce((a, b) => (ringFlaeche(b[0]) > ringFlaeche(a[0]) ? b : a))
}

function landMitte(geometrie) {
  const ring = groesstesPolygon(geometrie)[0]
  const lngs = ring.map(p => p[0])
  const lats = ring.map(p => p[1])
  return {
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
  }
}

// Strahl-Test in Laengen-/Breitengrad-Ebene; reicht, da die Daten an der
// Datumsgrenze bereits geteilt sind.
function punktImRing(lng, lat, ring) {
  let drin = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) drin = !drin
  }
  return drin
}

function punktImLand(lng, lat, geometrie) {
  const polygone = geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.coordinates
  return polygone.some(([aussen, ...loecher]) =>
    punktImRing(lng, lat, aussen) && !loecher.some(r => punktImRing(lng, lat, r)))
}

function landAnPunkt(lat, lng) {
  return alleLaender.find(l => punktImLand(lng, lat, l.feature.geometry))?.code || ''
}

// Als Bild statt Emoji: Windows zeigt Flaggen-Emojis nur als zwei Buchstaben.
// Der Code ist per Regex geprueft, daher ist das HTML sicher.
const FLAGGEN_BASIS = 'https://cdn.jsdelivr.net/npm/flag-icons@7/flags/4x3'

function flaggeAus(iso2) {
  if (!/^[A-Z]{2}$/.test(iso2 || '')) return '<span class="fl fl-leer"></span>'
  return `<img class="fl" src="${FLAGGEN_BASIS}/${iso2.toLowerCase()}.svg" alt="" loading="lazy">`
}

// Rohes GeoJSON-Feature → schlankes Land-Objekt fuer die Oberflaeche.
function landAusFeature(f) {
  const p = f.properties
  const flaeche = landFlaeche(f.geometry)
  return {
    code:      p.ADM0_A3,
    name:      p.NAME_DE || p.NAME,
    kontinent: p.CONTINENT,
    flagge:    flaggeAus(p.ISO_A2_EH),
    flaeche,
    mitte:     landMitte(f.geometry),
    feature:   f,
  }
}

async function laenderLaden() {
  const antwort = await fetch('laender.json?v=3')
  if (!antwort.ok) throw new Error('Länderdaten fehlen (HTTP ' + antwort.status + ')')
  const geo = await antwort.json()
  alleLaender = geo.features.map(landAusFeature)
  return alleLaender
}

// ─── Farben & Hoehen je Status ───────────────────────────────────────────────
function statusVon(land) {
  return reise.laender[land.code]?.status || ''
}

function kappenFarbe(land) {
  const s = statusVon(land)
  if (land === ausgewaehlt) return s === 'wunsch' ? FARBEN.wunschAuswahl : s === 'besucht' ? FARBEN.besuchtAuswahl : FARBEN.offenAuswahl
  if (nebelModus) return s === 'besucht' ? FARBEN.nebelBekannt : FARBEN.nebelOffen
  if (s === 'besucht') return FARBEN.besucht
  if (s === 'wunsch')  return FARBEN.wunsch
  return FARBEN.offen
}

function seitenFarbe(land) {
  const s = statusVon(land)
  if (s === 'besucht') return FARBEN.besuchtSeite
  if (s === 'wunsch')  return FARBEN.wunschSeite
  return FARBEN.offenSeite
}

function landHoehe(land) {
  if (land === ausgewaehlt) return HOEHE.auswahl
  const s = statusVon(land)
  const basis = HOEHE[s || 'offen']
  return land === hoverLand ? basis + HOEHE.hover : basis
}

function landTooltip(land) {
  const s = statusVon(land)
  const text = s === 'besucht' ? '✓ besucht' : s === 'wunsch' ? '★ Wunschziel' : 'noch unentdeckt'
  return `<div class="tip"><span>${land.flagge}</span><strong>${esc(land.name)}</strong><em>${text}</em></div>`
}

// ─── Aufbau ──────────────────────────────────────────────────────────────────
function globusMaterialSetzen() {
  const material = globus.globeMaterial()
  material.color.set('#15100b')
  material.emissive.set('#0b0805')
  material.shininess = 6
}

function ortElement(ort, beiOrtKlick) {
  const el = document.createElement('button')
  el.className = 'pin'
  el.innerHTML = `<span class="pin-kopf"></span><span class="pin-name">${esc(ort.name)}</span>`
  el.addEventListener('click', e => { e.stopPropagation(); beiOrtKlick(ort) })
  return el
}

function globusErstellen(container, { beiLandKlick, beiGlobusKlick, beiOrtKlick }) {
  globus = new Globe(container, { animateIn: true })
    .backgroundColor('rgba(0,0,0,0)')
    .showGraticules(true)
    .atmosphereColor(FARBEN.atmosphaere)
    .atmosphereAltitude(0.2)
    .polygonsData(alleLaender)
    .polygonGeoJsonGeometry(l => l.feature.geometry)
    .polygonCapColor(kappenFarbe)
    .polygonSideColor(seitenFarbe)
    .polygonStrokeColor(l => (l === ausgewaehlt ? FARBEN.randAuswahl : FARBEN.rand))
    .polygonAltitude(landHoehe)
    .polygonCapCurvatureResolution(3)
    .polygonLabel(landTooltip)
    .polygonsTransitionDuration(450)
    .onPolygonHover(l => { hoverLand = l; container.style.cursor = l ? 'pointer' : ''; globusAktualisieren() })
    .onPolygonClick((l, _e, koord) => beiLandKlick(l, koord))
    .onGlobeClick(koord => beiGlobusKlick(koord))
    .htmlElement(o => ortElement(o, beiOrtKlick))
    .htmlTransitionDuration(0)
    .ringColor(() => t => `rgba(232,168,74,${1 - t})`)
    .ringMaxRadius(2.2)
    .ringPropagationSpeed(1.4)
    .ringRepeatPeriod(1600)

  globusMaterialSetzen()
  const steuerung = globus.controls()
  steuerung.autoRotate = false
  steuerung.autoRotateSpeed = 0.35
  steuerung.enableDamping = true
  globus.pointOfView({ lat: 30, lng: 10, altitude: 2.4 })
  window.addEventListener('resize', globusGroesse)
  globusGroesse()
  return globus
}

function globusGroesse() {
  if (!globus) return
  globus.width(window.innerWidth).height(window.innerHeight)
}

// ─── Aktualisieren ───────────────────────────────────────────────────────────
function globusAktualisieren() {
  if (!globus) return
  globus
    .polygonCapColor(kappenFarbe)
    .polygonSideColor(seitenFarbe)
    .polygonAltitude(landHoehe)
    .polygonStrokeColor(l => (l === ausgewaehlt ? FARBEN.randAuswahl : FARBEN.rand))
}

// globe.gl haengt eigene 3D-Objekte an die uebergebenen Daten. Deshalb nur
// Kopien uebergeben, sonst landen diese Objekte in der gespeicherten Datei.
function orteZeigen(orte) {
  if (!globus) return
  globus.htmlElementsData(orte.map(o => ({ ...o }))).ringsData(orte.map(o => ({ ...o })))
}

function landAuswaehlen(land) {
  ausgewaehlt = land
  globusAktualisieren()
}

function nebelSetzen(an) {
  nebelModus = an
  globusAktualisieren()
}

function drehenSetzen(an) {
  if (globus) globus.controls().autoRotate = an
}

function hinfliegen(land) {
  const hoehe = Math.min(2.2, Math.max(0.7, 0.55 + Math.sqrt(land.flaeche) * 2.4))
  globus.pointOfView({ ...land.mitte, altitude: hoehe }, 1200)
}

function zuOrtFliegen(ort) {
  globus.pointOfView({ lat: ort.lat, lng: ort.lng, altitude: 0.8 }, 1200)
}
