const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── State ───────────────────────────────────────────────────────────────────
let alleFlaschen     = []
let aktiveKategorie  = 'alle'
let suchbegriff      = ''

// ─── HTML escaping ────────────────────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Status bar ───────────────────────────────────────────────────────────────
function statusSetzen(text, typ = '') {
  const el = document.getElementById('status-text')
  if (!el) return
  el.textContent = text
  el.className = 'info-status ' + typ
}

// ─── Load all bottles ─────────────────────────────────────────────────────────
async function ladeFlaschen() {
  statusSetzen('Lade…')
  const { data, error } = await client
    .from('flaschen')
    .select('*')
    .order('erstellt_am', { ascending: false })

  if (error) {
    statusSetzen('Fehler: ' + error.message, 'err')
    return
  }

  alleFlaschen = data || []
  updateGesamtAnzahl()
  statusSetzen('✓ ' + alleFlaschen.length + ' Flaschen', 'ok')
}

function updateGesamtAnzahl() {
  const n = alleFlaschen.length
  const el = document.getElementById('gesamt-anzahl')
  if (el) {
    el.innerHTML = `<strong>${n}</strong> ${n === 1 ? 'Flasche' : 'Flaschen'}`
  }
}

// ─── Filter ───────────────────────────────────────────────────────────────────
function gefilterteFlaschen() {
  const q = suchbegriff.toLowerCase()
  return alleFlaschen.filter(f => {
    const katOk = aktiveKategorie === 'alle' || f.kategorie === aktiveKategorie
    if (!katOk) return false
    if (!q) return true
    return [f.name, f.kategorie, f.groesse_ml, f.alkohol_vol,
            f.material, f.hinzugefuegt, f.geschmack,
            f.destillerie, f.hergestellt_in]
      .some(v => v && v.toString().toLowerCase().includes(q))
  })
}

// ─── Render category pills ────────────────────────────────────────────────────
function renderKategorien() {
  const el = document.getElementById('kategorieleiste')
  if (!el) return

  const zaehler = {}
  alleFlaschen.forEach(f => {
    if (f.kategorie) zaehler[f.kategorie] = (zaehler[f.kategorie] || 0) + 1
  })

  const sortiertKats = Object.entries(zaehler)
    .sort(([a], [b]) => a.localeCompare(b, 'de'))

  const pills = [
    kategorieHTML('alle', alleFlaschen.length),
    ...sortiertKats.map(([k, c]) => kategorieHTML(k, c))
  ].join('')

  el.innerHTML = pills

  el.querySelectorAll('.kat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      aktiveKategorie = btn.dataset.kat
      renderKategorien()
      renderFlaschen()
    })
  })
}

function kategorieHTML(kat, anzahl) {
  const aktiv = aktiveKategorie === kat ? ' aktiv' : ''
  return `<button class="kat-pill${aktiv}" data-kat="${esc(kat)}">
    ${kat === 'alle' ? 'Alle' : esc(kat)} <span>${anzahl}</span>
  </button>`
}

// ─── Render bottle grid ───────────────────────────────────────────────────────
function renderFlaschen() {
  const grid  = document.getElementById('flaschen-grid')
  const leer  = document.getElementById('leer-state')
  if (!grid) return

  const liste = gefilterteFlaschen()
  grid.innerHTML = ''

  if (liste.length === 0) {
    leer && (leer.style.display = 'flex')
    return
  }

  leer && (leer.style.display = 'none')
  liste.forEach(f => {
    grid.insertAdjacentHTML('beforeend', karteHTML(f))
  })
}

function karteHTML(f) {
  const bildEl = f.bild_url
    ? `<img src="${esc(f.bild_url)}" alt="${esc(f.name)}" class="karte-bild" loading="lazy">`
    : ''

  const infos = [
    f.groesse_ml  ? `<span>🍶 ${esc(f.groesse_ml)} ml</span>` : '',
    f.alkohol_vol ? `<span>🔥 ${esc(f.alkohol_vol)}% Vol</span>` : '',
    f.material    ? `<span>📦 ${esc(f.material)}</span>` : '',
  ].filter(Boolean).join('')

  return `
  <article class="flasche-karte">
    ${bildEl}
    <div class="karte-body">
      <span class="karte-kat">${esc(f.kategorie)}</span>
      <h3 class="karte-name">${esc(f.name)}</h3>
      ${infos ? `<div class="karte-infos">${infos}</div>` : ''}
      ${f.geschmack     ? `<p class="karte-geschmack">🍫 ${esc(f.geschmack)}</p>` : ''}
      ${f.destillerie   ? `<p class="karte-meta">🏭 ${esc(f.destillerie)}</p>` : ''}
      ${f.hergestellt_in ? `<p class="karte-meta">🌍 ${esc(f.hergestellt_in)}</p>` : ''}
      ${f.hinzugefuegt  ? `<p class="karte-datum">📅 ${esc(f.hinzugefuegt)}</p>` : ''}
    </div>
  </article>`
}

// ─── Populate datalists (categories + sizes) ──────────────────────────────────
function fuelleDatalist() {
  const katList = document.getElementById('kat-list')
  const mlList  = document.getElementById('ml-list')
  if (!katList || !mlList) return

  const kats    = [...new Set(alleFlaschen.map(f => f.kategorie).filter(Boolean))].sort()
  const groessen = [...new Set(alleFlaschen.map(f => f.groesse_ml).filter(Boolean))]
    .sort((a, b) => parseFloat(a) - parseFloat(b))

  katList.innerHTML = kats.map(k => `<option value="${esc(k)}">`).join('')
  mlList.innerHTML  = groessen.map(g => `<option value="${esc(g)}">`).join('')
}

// ─── Save new bottle ──────────────────────────────────────────────────────────
async function flascheSpeichern(daten, bildDatei) {
  let bildUrl = null

  if (bildDatei) {
    const sicherName = bildDatei.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const dateiname  = `${Date.now()}-${sicherName}`
    const { error: uploadFehler } = await client.storage
      .from('bilder')
      .upload(dateiname, bildDatei)

    if (uploadFehler) throw new Error('Bild-Upload: ' + uploadFehler.message)

    const { data: urlDaten } = client.storage.from('bilder').getPublicUrl(dateiname)
    bildUrl = urlDaten.publicUrl
  }

  const { error } = await client.from('flaschen').insert({ ...daten, bild_url: bildUrl })
  if (error) throw new Error(error.message)
}

// ─── Export as JSON ───────────────────────────────────────────────────────────
function exportDaten() {
  const exportiert = alleFlaschen.map(({ id, erstellt_am, ...rest }) => rest)
  const json = JSON.stringify(exportiert, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `mini-mini-bar-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  statusSetzen('✓ Export abgeschlossen', 'ok')
}

// ─── Import from JSON ─────────────────────────────────────────────────────────
async function importDaten(datei) {
  let daten
  try {
    const text = await datei.text()
    daten = JSON.parse(text)
    if (!Array.isArray(daten)) throw new Error()
  } catch {
    statusSetzen('❌ Ungültige JSON-Datei', 'err')
    return
  }

  statusSetzen(`Importiere ${daten.length} Einträge…`)
  const bereinigt = daten.map(({ id, erstellt_am, ...rest }) => rest)

  const { error } = await client.from('flaschen').insert(bereinigt)
  if (error) { statusSetzen('❌ ' + error.message, 'err'); return }

  await ladeFlaschen()
  renderKategorien()
  renderFlaschen()
  statusSetzen(`✓ ${daten.length} Flaschen importiert`, 'ok')
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function modalOeffnen() {
  fuelleDatalist()
  document.getElementById('modal-overlay').classList.add('offen')
  document.getElementById('f-name').focus()
}

function modalSchliessen() {
  document.getElementById('modal-overlay').classList.remove('offen')
  document.getElementById('flasche-form').reset()
  document.getElementById('foto-vorschau').style.display = 'none'
  formAlertSetzen('', '')
}

function formAlertSetzen(text, typ) {
  const el = document.getElementById('form-alert')
  if (!el) return
  el.textContent = text
  el.className   = 'form-alert ' + typ
}

// ─── Event listeners ──────────────────────────────────────────────────────────
function initEvents() {
  // Search
  document.getElementById('suche').addEventListener('input', e => {
    suchbegriff = e.target.value.trim()
    renderFlaschen()
  })

  // New bottle button
  document.getElementById('neu-btn').addEventListener('click', modalOeffnen)

  // Modal close
  document.getElementById('modal-close').addEventListener('click', modalSchliessen)
  document.getElementById('form-abbrechen').addEventListener('click', modalSchliessen)
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) modalSchliessen()
  })

  // Image preview
  document.getElementById('f-foto').addEventListener('change', e => {
    const datei = e.target.files[0]
    if (!datei) return
    const vorschau    = document.getElementById('foto-vorschau')
    const vorschauImg = document.getElementById('foto-vorschau-img')
    vorschauImg.src = URL.createObjectURL(datei)
    vorschau.style.display = 'block'
  })

  // Image drag & drop
  const uploadArea = document.getElementById('foto-upload-area')
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over') })
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'))
  uploadArea.addEventListener('drop', e => {
    e.preventDefault()
    uploadArea.classList.remove('drag-over')
    const datei = e.dataTransfer.files[0]
    if (datei?.type.startsWith('image/')) {
      document.getElementById('f-foto').files = e.dataTransfer.files
      document.getElementById('f-foto').dispatchEvent(new Event('change'))
    }
  })

  // Form submit
  document.getElementById('flasche-form').addEventListener('submit', async e => {
    e.preventDefault()
    const speichern = document.getElementById('form-speichern')
    formAlertSetzen('', '')

    const name = document.getElementById('f-name').value.trim()
    const kat  = document.getElementById('f-kategorie').value.trim()

    if (!name) { formAlertSetzen('Name ist erforderlich.', 'err'); return }
    if (!kat)  { formAlertSetzen('Kategorie ist erforderlich.', 'err'); return }

    speichern.disabled    = true
    speichern.textContent = 'Speichere…'

    try {
      await flascheSpeichern({
        name,
        kategorie:      kat,
        groesse_ml:     document.getElementById('f-groesse').value.trim()     || null,
        alkohol_vol:    document.getElementById('f-alkohol').value.trim()     || null,
        material:       document.getElementById('f-material').value           || null,
        hinzugefuegt:   document.getElementById('f-hinzugefuegt').value.trim() || null,
        geschmack:      document.getElementById('f-geschmack').value.trim()   || null,
        destillerie:    document.getElementById('f-destillerie').value.trim() || null,
        hergestellt_in: document.getElementById('f-hergestellt').value.trim() || null,
      }, document.getElementById('f-foto').files[0] || null)

      await ladeFlaschen()
      renderKategorien()
      renderFlaschen()
      modalSchliessen()
      statusSetzen('✓ ' + name + ' gespeichert', 'ok')
    } catch (err) {
      formAlertSetzen('Fehler: ' + err.message, 'err')
    } finally {
      speichern.disabled    = false
      speichern.textContent = 'Speichern'
    }
  })

  // Export
  document.getElementById('export-btn').addEventListener('click', exportDaten)

  // Import
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-input').click()
  })

  document.getElementById('import-input').addEventListener('change', e => {
    const datei = e.target.files[0]
    if (datei) importDaten(datei)
    e.target.value = ''
  })
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('flaschen-grid').innerHTML =
    '<div class="lade-container"><div class="leer-icon">🍾</div><div class="spinner"></div></div>'

  await ladeFlaschen()
  renderKategorien()
  renderFlaschen()
  initEvents()
})
