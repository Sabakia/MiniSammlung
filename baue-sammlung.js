// Baut sammlung.json fuer die GitHub-Variante:
//   283 Flaschen aus der Sicherung + 4 neue aus dem CSV-Export
//   Bild-Adressen von Supabase auf GitHub umgebogen

const fs = require('fs')
const path = require('path')

const SICHERUNG   = 'K:/Downloads/Bilder-Rettung/flaschen-backup.json'
const CSV_NEU     = 'C:/Users/s.kiani/Downloads/Supabase Snippet Untitled query.csv'
const GESICHERT   = 'K:/Downloads/Bilder-Rettung/db-namen.txt'
const ZIEL        = process.argv[2] || 'K:/Downloads/Bilder-Rettung/sammlung.json'

const SUPA_PRAEFIX = 'https://jxoevkdztkjqaavfooud.supabase.co/storage/v1/object/public/SammlungBilder/'
const GH_PRAEFIX   = 'https://raw.githubusercontent.com/Sabakia/Sammlung-/main/images/'

// Dateinamen, die nachweislich in GitHub liegen
const inGitHub = new Set(
  fs.readFileSync(GESICHERT, 'utf8').split('\n').map(z => z.trim()).filter(Boolean)
)

// Bild-Adressen der 4 neuen Flaschen (aus der SQL-Abfrage)
const neueBilder = {
  'Ruppiner Tafelrunde': [
    '1788020021605-axzvk5kglws-image.jpg', '1788020022794-8qaguy0ryr-image.jpg',
    '1788020024028-7wgcyzmbpaw-image.jpg', '1788020024766-7u3njkxipex-image.jpg',
    '1788020025443-v1e49fgvfo-image.jpg',
  ],
  'Fontanes Likör': [
    '1788019723295-8hjznyh40v-image.jpg', '1788019724419-e191xo2fbbd-image.jpg',
    '1788019725221-alt91netesb-image.jpg', '1788019725940-w21wgr9ede-image.jpg',
  ],
  'Ruppiner Klösterlikör': [
    '1788019396061-el0x5ugsmp4-image.jpg', '1788019397642-lbg0xogdbgf-image.jpg',
    '1788019398970-jgqf1l2qu78-image.jpg',
  ],
  "Bauer's Goldbrand": [
    '1787923694967-j0q5lj116h-IMG_2694.jpeg', '1787923696155-1h39vyrh00y-IMG_2695.jpeg',
    '1787923697386-xorzaw4w3wb-IMG_2697.jpeg', '1787923698535-mig29idmxok-IMG_2698.jpeg',
  ],
}

// Eine Adresse umbiegen — nur wenn die Datei wirklich in GitHub liegt
let umgebogen = 0, belassen = 0
function adresseUmbiegen(url) {
  if (typeof url !== 'string' || !url.startsWith(SUPA_PRAEFIX)) return url
  const datei = decodeURIComponent(url.slice(SUPA_PRAEFIX.length).split('?')[0])
  if (inGitHub.has(datei)) { umgebogen++; return GH_PRAEFIX + datei }
  belassen++
  return url   // noch nicht gesichert — bleibt vorerst stehen
}

// CSV mit Anfuehrungszeichen und Zeilenumbruechen in Feldern lesen
function csvLesen(text) {
  const zeilen = []
  let feld = '', zeile = [], inQuote = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { feld += '"'; i++ }
      else if (c === '"') inQuote = false
      else feld += c
    } else if (c === '"') inQuote = true
    else if (c === ',') { zeile.push(feld); feld = '' }
    else if (c === '\n') { zeile.push(feld); zeilen.push(zeile); zeile = []; feld = '' }
    else if (c !== '\r') feld += c
  }
  if (feld || zeile.length) { zeile.push(feld); zeilen.push(zeile) }
  return zeilen
}

const wert = v => (v === 'null' || v === '' ? null : v)

// ── Bestehende 283 ──
const flaschen = JSON.parse(fs.readFileSync(SICHERUNG, 'utf8')).map(f => ({
  ...f,
  bild_url:  adresseUmbiegen(f.bild_url),
  bild_urls: f.bild_urls
    ? JSON.stringify(JSON.parse(f.bild_urls).map(adresseUmbiegen))
    : null,
}))

// ── 4 neue aus dem CSV ──
const zeilen = csvLesen(fs.readFileSync(CSV_NEU, 'utf8'))
const kopf   = zeilen[0]
let neu = 0

for (const z of zeilen.slice(1)) {
  if (!z[0] || z.length < kopf.length) continue
  const e = {}
  kopf.forEach((k, i) => { e[k] = wert(z[i]) })

  const dateien = neueBilder[e.name] || []
  const urls    = dateien.map(d => SUPA_PRAEFIX + d)

  flaschen.push({
    id:             'neu-' + (++neu),
    name:           e.name,
    kategorie:      e.kategorie,
    groesse_ml:     e.groesse_ml,
    alkohol_vol:    e.alkohol_vol,
    material:       e.material,
    hinzugefuegt:   e.hinzugefuegt,
    geschmack:      e.geschmack,
    destillerie:    e.destillerie,
    hergestellt_in: e.hergestellt_in,
    notiz:          e.notiz,
    bild_url:       urls[0] || null,
    bild_urls:      urls.length > 1 ? JSON.stringify(urls) : null,
    erstellt_am:    new Date().toISOString(),
  })
}

fs.mkdirSync(path.dirname(ZIEL), { recursive: true })
fs.writeFileSync(ZIEL, JSON.stringify(flaschen, null, 1), 'utf8')

console.log(`Flaschen gesamt:      ${flaschen.length}`)
console.log(`  davon neu aus CSV:  ${neu}`)
console.log(`Adressen auf GitHub:  ${umgebogen}`)
console.log(`Noch bei Supabase:    ${belassen}  (die 16 ungesicherten)`)
console.log(`Geschrieben:          ${ZIEL}`)
