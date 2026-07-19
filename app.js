const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── State ───────────────────────────────────────────────────────────────────
let alleFlaschen     = []
let aktiveKategorie  = 'alle'
let suchbegriff      = ''
let bearbeitungsId   = null   // null = neue Flasche; ID = Bearbeiten-Modus
let vorschauDateien  = []     // FileList-Kopie für mehrere Fotos

// ─── HTML escaping ────────────────────────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ─── Auth UI ─────────────────────────────────────────────────────────────────
function updateAuthUI(user) {
  const eingeloggt = !!user
  document.getElementById('neu-btn').style.display     = eingeloggt ? '' : 'none'
  document.getElementById('login-btn').style.display   = eingeloggt ? 'none' : ''
  document.getElementById('logout-btn').style.display  = eingeloggt ? '' : 'none'
  document.getElementById('import-btn').style.display  = eingeloggt ? '' : 'none'
  document.body.classList.toggle('admin', eingeloggt)
}

function loginModalOeffnen() {
  document.getElementById('login-overlay').classList.add('offen')
  document.getElementById('login-email').focus()
}

function loginModalSchliessen() {
  document.getElementById('login-overlay').classList.remove('offen')
  document.getElementById('login-form').reset()
  document.getElementById('login-alert').textContent = ''
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
    el.innerHTML = `<strong>${n}</strong><span class="label">${n === 1 ? 'Flasche' : 'Flaschen'}</span>`
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
  let _urls = []
  if (f.bild_urls) {
    try { _urls = JSON.parse(f.bild_urls) } catch { _urls = [] }
  }
  if (_urls.length === 0 && f.bild_url) _urls = [f.bild_url]
  const bilder = _urls

  const metaZeile = [
    f.alkohol_vol ? `<span>${esc(f.alkohol_vol)}% Vol</span>` : '',
    f.groesse_ml  ? `<span>${esc(f.groesse_ml)} ml</span>`   : '',
    f.material    ? `<span>${esc(f.material)}</span>`         : '',
  ].filter(Boolean).join('')

  const extraZeilen = [
    f.geschmack      ? `<p class="karte-geschmack">${esc(f.geschmack)}</p>`       : '',
    f.destillerie    ? `<p class="karte-herkunft">🏭 ${esc(f.destillerie)}</p>`   : '',
    f.hergestellt_in ? `<p class="karte-herkunft">🌍 ${esc(f.hergestellt_in)}</p>` : '',
    f.notiz          ? `<p class="karte-notiz">${esc(f.notiz)}</p>`               : '',
    f.hinzugefuegt   ? `<p class="karte-datum">${esc(f.hinzugefuegt)}</p>`        : '',
  ].filter(Boolean).join('')

  const editBtn = `<button class="edit-btn" data-id="${esc(f.id)}" title="Bearbeiten">✎</button>`

  if (bilder.length > 0) {
    const fotoBadge = bilder.length > 1
      ? `<div class="foto-anzahl">📷 ${bilder.length}</div>`
      : ''

    return `
    <article class="flasche-karte mit-bild">
      <div class="karte-galerie">
        <img src="${esc(bilder[0])}" alt="${esc(f.name)}" class="karte-bild" loading="lazy">
        ${fotoBadge}
        ${editBtn}
        <div class="karte-overlay">
          <span class="karte-kat">${esc(f.kategorie)}</span>
          <h3 class="karte-name">${esc(f.name)}</h3>
          ${metaZeile ? `<div class="karte-meta-zeile">${metaZeile}</div>` : ''}
        </div>
      </div>
      ${extraZeilen ? `<div class="karte-extra">${extraZeilen}</div>` : ''}
    </article>`
  }

  return `
  <article class="flasche-karte ohne-bild">
    <div class="karte-kein-bild" data-kat="${esc(f.kategorie)}">
      <div class="karte-inner-border"></div>
      ${editBtn}
      <span class="karte-kat">${esc(f.kategorie)}</span>
      <h3 class="karte-name">${esc(f.name)}</h3>
      ${metaZeile ? `<div class="karte-meta-zeile">${metaZeile}</div>` : ''}
    </div>
    ${extraZeilen ? `<div class="karte-extra">${extraZeilen}</div>` : ''}
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

// ─── Upload one image, return public URL ─────────────────────────────────────
async function bildHochladen(datei) {
  const sicherName = datei.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const dateiname  = `${Date.now()}-${Math.random().toString(36).slice(2)}-${sicherName}`
  const { error } = await client.storage.from('SammlungBilder').upload(dateiname, datei)
  if (error) throw new Error('Bild-Upload: ' + error.message)
  return client.storage.from('SammlungBilder').getPublicUrl(dateiname).data.publicUrl
}

// ─── Save new bottle ──────────────────────────────────────────────────────────
async function flascheSpeichern(daten, dateien) {
  const urls = []
  for (const datei of dateien) {
    urls.push(await bildHochladen(datei))
  }

  const eintrag = {
    ...daten,
    bild_url:  urls[0]  || null,
    bild_urls: urls.length > 1 ? JSON.stringify(urls) : null,
  }

  const { error } = await client.from('flaschen').insert(eintrag)
  if (error) throw new Error(error.message)
}

// ─── Update existing bottle ───────────────────────────────────────────────────
async function flascheAktualisieren(id, daten, dateien) {
  if (dateien.length > 0) {
    // Keep existing photos, append new ones
    const alteF = alleFlaschen.find(f => f.id === id)
    let alleUrls = []
    if (alteF?.bild_urls) { try { alleUrls = JSON.parse(alteF.bild_urls) } catch { alleUrls = [] } }
    if (alleUrls.length === 0 && alteF?.bild_url) alleUrls = [alteF.bild_url]

    for (const datei of dateien) {
      alleUrls.push(await bildHochladen(datei))
    }

    daten.bild_url  = alleUrls[0]
    daten.bild_urls = alleUrls.length > 1 ? JSON.stringify(alleUrls) : null
  }

  const { error } = await client.from('flaschen').update(daten).eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Open edit modal prefilled ────────────────────────────────────────────────
function flascheBearbeiten(id) {
  const f = alleFlaschen.find(f => f.id === id)
  if (!f) return

  bearbeitungsId = id
  fuelleDatalist()

  document.getElementById('modal-overlay').classList.add('offen')
  document.querySelector('#modal-overlay .modal-header h2').textContent = 'Flasche bearbeiten'
  document.getElementById('form-speichern').textContent = 'Aktualisieren'

  document.getElementById('f-name').value         = f.name          || ''
  document.getElementById('f-kategorie').value    = f.kategorie     || ''
  document.getElementById('f-groesse').value      = f.groesse_ml    || ''
  document.getElementById('f-alkohol').value      = f.alkohol_vol   || ''
  document.getElementById('f-material').value     = f.material      || ''
  document.getElementById('f-hinzugefuegt').value = f.hinzugefuegt  || ''
  document.getElementById('f-geschmack').value    = f.geschmack     || ''
  document.getElementById('f-destillerie').value  = f.destillerie   || ''
  document.getElementById('f-hergestellt').value  = f.hergestellt_in || ''

  // Show existing photos
  let urls = []
  if (f.bild_urls) { try { urls = JSON.parse(f.bild_urls) } catch { urls = [] } }
  if (urls.length === 0 && f.bild_url) urls = [f.bild_url]
  vorschauDateien = []
  fotoVorschauUrls(urls)

  document.getElementById('f-name').focus()
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
  document.getElementById('foto-vorschau').innerHTML = ''
  document.querySelector('#modal-overlay .modal-header h2').textContent = 'Neue Flasche'
  document.getElementById('form-speichern').textContent = 'Speichern'
  formAlertSetzen('', '')
  bearbeitungsId  = null
  vorschauDateien = []
}

function formAlertSetzen(text, typ) {
  const el = document.getElementById('form-alert')
  if (!el) return
  el.textContent = text
  el.className   = 'form-alert ' + typ
}

// ─── Multi-photo preview ──────────────────────────────────────────────────────
function fotoVorschauZeigen(dateien) {
  vorschauDateien = dateien
  const grid = document.getElementById('foto-vorschau')
  grid.innerHTML = ''

  dateien.forEach((datei, i) => {
    const item = document.createElement('div')
    item.className = 'foto-vorschau-item'

    const img = document.createElement('img')
    img.src = URL.createObjectURL(datei)

    const btn = document.createElement('button')
    btn.className = 'remove-foto'
    btn.type = 'button'
    btn.textContent = '✕'
    btn.addEventListener('click', () => {
      vorschauDateien = vorschauDateien.filter((_, idx) => idx !== i)
      fotoVorschauZeigen(vorschauDateien)
    })

    item.appendChild(img)
    item.appendChild(btn)
    grid.appendChild(item)
  })
}

function fotoVorschauUrls(urls) {
  const grid = document.getElementById('foto-vorschau')
  grid.innerHTML = urls.map(u =>
    `<div class="foto-vorschau-item"><img src="${esc(u)}" loading="lazy"></div>`
  ).join('')
}

// ─── Auth events ─────────────────────────────────────────────────────────────
function initAuthEvents() {
  document.getElementById('login-btn').addEventListener('click', loginModalOeffnen)
  document.getElementById('login-close').addEventListener('click', loginModalSchliessen)
  document.getElementById('login-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) loginModalSchliessen()
  })

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await client.auth.signOut()
    statusSetzen('Abgemeldet', '')
  })

  document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault()
    const btn   = document.getElementById('login-submit')
    const alert = document.getElementById('login-alert')
    const email = document.getElementById('login-email').value.trim()
    const pass  = document.getElementById('login-password').value

    btn.disabled    = true
    btn.textContent = 'Anmelden…'
    alert.textContent = ''

    const { error } = await client.auth.signInWithPassword({ email, password: pass })

    if (error) {
      alert.textContent = 'Falsche E-Mail oder Passwort.'
      alert.className   = 'form-alert err'
      btn.disabled      = false
      btn.textContent   = 'Anmelden'
    } else {
      loginModalSchliessen()
      statusSetzen('✓ Angemeldet', 'ok')
    }
  })
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

  // Image preview — multiple files
  document.getElementById('f-foto').addEventListener('change', e => {
    fotoVorschauZeigen(Array.from(e.target.files))
  })

  // Image drag & drop
  const uploadArea = document.getElementById('foto-upload-area')
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('drag-over') })
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('drag-over'))
  uploadArea.addEventListener('drop', e => {
    e.preventDefault()
    uploadArea.classList.remove('drag-over')
    const neueDateien = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (neueDateien.length) fotoVorschauZeigen([...vorschauDateien, ...neueDateien])
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
    speichern.textContent = bearbeitungsId ? 'Aktualisiere…' : 'Speichere…'

    const daten = {
      name,
      kategorie:      kat,
      groesse_ml:     document.getElementById('f-groesse').value.trim()      || null,
      alkohol_vol:    document.getElementById('f-alkohol').value.trim()      || null,
      material:       document.getElementById('f-material').value            || null,
      hinzugefuegt:   document.getElementById('f-hinzugefuegt').value.trim() || null,
      geschmack:      document.getElementById('f-geschmack').value.trim()    || null,
      destillerie:    document.getElementById('f-destillerie').value.trim()  || null,
      hergestellt_in: document.getElementById('f-hergestellt').value.trim()  || null,
    }
    try {
      if (bearbeitungsId) {
        await flascheAktualisieren(bearbeitungsId, daten, vorschauDateien)
        statusSetzen('✓ ' + name + ' aktualisiert', 'ok')
      } else {
        await flascheSpeichern(daten, vorschauDateien)
        statusSetzen('✓ ' + name + ' gespeichert', 'ok')
      }

      await ladeFlaschen()
      renderKategorien()
      renderFlaschen()
      modalSchliessen()
    } catch (err) {
      formAlertSetzen('Fehler: ' + err.message, 'err')
    } finally {
      speichern.disabled    = false
      speichern.textContent = bearbeitungsId ? 'Aktualisieren' : 'Speichern'
    }
  })

  // Detail modal close
  const detailOverlay = document.getElementById('detail-overlay')
  document.getElementById('detail-close').addEventListener('click', () => {
    detailOverlay.classList.remove('offen')
  })
  detailOverlay.addEventListener('click', e => {
    if (e.target === e.currentTarget) detailOverlay.classList.remove('offen')
  })

  // Sticky header scroll class
  const stickyHeader = document.getElementById('sticky-header')
  window.addEventListener('scroll', () => {
    stickyHeader.classList.toggle('scrolled', window.scrollY > 40)
  }, { passive: true })

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

// ─── Edit button click ────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.edit-btn')
  if (!btn) return
  e.stopPropagation()
  flascheBearbeiten(btn.dataset.id)
})

// ─── Card click → detail modal ────────────────────────────────────────────────
document.addEventListener('click', e => {
  const karte = e.target.closest('.flasche-karte')
  if (!karte) return
  if (e.target.closest('.edit-btn')) return
  const id = karte.querySelector('.edit-btn')?.dataset.id
  if (!id) return
  detailOeffnen(id)
})

function detailOeffnen(id) {
  const f = alleFlaschen.find(f => String(f.id) === String(id))
  if (!f) return

  // Show edit button only for admins
  const editBtn = document.getElementById('detail-edit-btn')
  editBtn.style.display = document.body.classList.contains('admin') ? '' : 'none'
  editBtn.onclick = () => {
    document.getElementById('detail-overlay').classList.remove('offen')
    flascheBearbeiten(id)
  }

  let urls = []
  if (f.bild_urls) { try { urls = JSON.parse(f.bild_urls) } catch { urls = [] } }
  if (urls.length === 0 && f.bild_url) urls = [f.bild_url]

  document.getElementById('detail-kat').textContent  = f.kategorie || ''
  document.getElementById('detail-name').textContent = f.name      || ''

  // Photos
  const bilderEl = document.getElementById('detail-bilder')
  bilderEl.innerHTML = urls.map(u => `<img src="${esc(u)}" loading="lazy">`).join('')

  // Info rows
  const reihen = [
    f.alkohol_vol    && { label: 'Alkohol',     wert: f.alkohol_vol + ' % Vol' },
    f.groesse_ml     && { label: 'Größe',        wert: f.groesse_ml + ' ml' },
    f.material       && { label: 'Material',     wert: f.material },
    f.destillerie    && { label: 'Destillerie',  wert: f.destillerie },
    f.hergestellt_in && { label: 'Hergestellt',  wert: f.hergestellt_in },
    f.hinzugefuegt   && { label: 'Hinzugefügt',  wert: f.hinzugefuegt },
    f.geschmack      && { label: 'Geschmack',    wert: f.geschmack },
  ].filter(Boolean)

  const body = document.getElementById('detail-body')
  body.innerHTML =
    (reihen.length ? `<div class="detail-meta-zeile">${
      [f.alkohol_vol, f.groesse_ml, f.material].filter(Boolean)
        .map(v => `<span>${esc(String(v))}${v === f.alkohol_vol ? ' % Vol' : v === f.groesse_ml ? ' ml' : ''}</span>`)
        .join('')
    }</div>` : '') +
    reihen.filter(r => !['Alkohol','Größe','Material'].includes(r.label)).map(r =>
      `<div class="detail-reihe"><span class="label">${esc(r.label)}</span><span>${esc(r.wert)}</span></div>`
    ).join('') +
    (f.notiz ? `<p class="detail-notiz">${esc(f.notiz)}</p>` : '')

  document.getElementById('detail-overlay').classList.add('offen')
}


// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('flaschen-grid').innerHTML = ''

  // Auth state listener
  client.auth.onAuthStateChange((_event, session) => {
    updateAuthUI(session?.user ?? null)
  })

  // Check current session
  const { data: { session } } = await client.auth.getSession()
  updateAuthUI(session?.user ?? null)

  await ladeFlaschen()
  renderKategorien()
  renderFlaschen()
  initAuthEvents()
  initEvents()
})
