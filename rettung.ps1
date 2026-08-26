# Wartet bis die Supabase-Sperre faellt und rettet dann sofort alle Bilder.
#
#   .\rettung.ps1
#
# Laeuft dauerhaft und prueft alle 10 Minuten. Sobald der Zugang zurueck ist:
#   1. alle Bild-Adressen aus der Datenbank lesen
#   2. jedes Supabase-Bild herunterladen
#   3. verkleinern (max. 1600px)
#   4. nach GitHub schieben
#   5. das SQL ausgeben, das die Adressen umbiegt
#
# Fenster ist womoeglich kurz - deshalb laeuft das ohne Rueckfragen durch.

param(
    [int]$PruefeAlleMinuten = 10,
    [string]$Arbeitsordner  = "$env:USERPROFILE\Downloads\Bilder-Rettung"
)

$ErrorActionPreference = 'Stop'

$PROJEKT     = 'https://jxoevkdztkjqaavfooud.supabase.co'
$KEY         = 'sb_publishable_GMDUYECdFXsuEIxk4zqs7A_yVdSNxQN'
$SPEICHER    = "$PROJEKT/storage/v1/object/public/SammlungBilder/"
$BILDER_REPO = 'https://github.com/Sabakia/Sammlung-.git'
$GITHUB_ROH  = 'https://raw.githubusercontent.com/Sabakia/Sammlung-/main/images/'
$SKRIPT_DIR  = Split-Path -Parent $MyInvocation.MyCommand.Path

$kopf = @{ apikey = $KEY; Authorization = "Bearer $KEY" }

function Schreibe($text, $farbe = 'Gray') {
    $zeit = Get-Date -Format 'HH:mm:ss'
    Write-Host "[$zeit] $text" -ForegroundColor $farbe
}

# ── 1. Warten bis die Sperre faellt ──────────────────────────────────────────
Schreibe "Warte auf das Ende der Sperre. Pruefung alle $PruefeAlleMinuten Minuten." Cyan
Schreibe "Fenster kann kurz sein - Fenster offen lassen. Abbruch mit Strg+C." Cyan
Write-Host ""

$versuch = 0
while ($true) {
    $versuch++
    $frei = $false
    try {
        $null = Invoke-RestMethod -Uri "$PROJEKT/rest/v1/flaschen?select=id&limit=1" `
                                  -Headers $kopf -TimeoutSec 30
        $frei = $true
    } catch {
        $code = $null
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($code -eq 402) {
            if ($versuch % 6 -eq 1) { Schreibe "noch gesperrt (402) - Versuch $versuch" }
        } else {
            Schreibe "unerwartete Antwort ($code) - Versuch $versuch" Yellow
        }
    }

    if ($frei) { break }
    Start-Sleep -Seconds ($PruefeAlleMinuten * 60)
}

Write-Host ""
Schreibe "ZUGANG IST ZURUECK - starte Rettung" Green
Write-Host ""

# ── 2. Bild-Adressen aus der Datenbank lesen ─────────────────────────────────
Schreibe "Lese Flaschen aus der Datenbank..."
$flaschen = Invoke-RestMethod -Headers $kopf -TimeoutSec 60 `
            -Uri "$PROJEKT/rest/v1/flaschen?select=id,name,bild_url,bild_urls"
Schreibe "$($flaschen.Count) Flaschen gefunden"

$urls = New-Object System.Collections.Generic.HashSet[string]
foreach ($f in $flaschen) {
    if ($f.bild_url) { $null = $urls.Add([string]$f.bild_url) }
    if ($f.bild_urls) {
        try {
            foreach ($u in ($f.bild_urls | ConvertFrom-Json)) { $null = $urls.Add([string]$u) }
        } catch { }
    }
}

$supabaseUrls = @($urls | Where-Object { $_ -like "$SPEICHER*" })
Schreibe "$($urls.Count) Bild-Adressen gesamt, davon $($supabaseUrls.Count) bei Supabase" Cyan

if ($supabaseUrls.Count -eq 0) {
    Schreibe "Nichts zu retten - keine Supabase-Bilder in der Datenbank." Yellow
    exit 0
}

# ── 3. Herunterladen ─────────────────────────────────────────────────────────
$rohOrdner = Join-Path $Arbeitsordner 'original'
New-Item -ItemType Directory -Path $rohOrdner -Force | Out-Null

Schreibe "Lade $($supabaseUrls.Count) Bilder nach $rohOrdner ..."
$geladen = 0
$fehler  = @()

foreach ($u in $supabaseUrls) {
    $name = [Uri]::UnescapeDataString($u.Substring($SPEICHER.Length)) -replace '\?.*$', ''
    $ziel = Join-Path $rohOrdner $name
    if (Test-Path $ziel) { $geladen++; continue }
    try {
        Invoke-WebRequest -Uri $u -OutFile $ziel -TimeoutSec 120 -UseBasicParsing
        $geladen++
        if ($geladen % 20 -eq 0) { Schreibe "  $geladen / $($supabaseUrls.Count)" }
    } catch {
        $fehler += $u
    }
}

Schreibe "$geladen geladen, $($fehler.Count) fehlgeschlagen" Green
if ($fehler.Count -gt 0) {
    $fehlerDatei = Join-Path $Arbeitsordner 'nicht-geladen.txt'
    $fehler | Set-Content $fehlerDatei -Encoding UTF8
    Schreibe "Fehlliste: $fehlerDatei" Yellow
}

if ($geladen -eq 0) { Schreibe "Nichts geladen - Abbruch." Red; exit 1 }

# ── 4. Verkleinern ───────────────────────────────────────────────────────────
Schreibe "Verkleinere Bilder..."
& (Join-Path $SKRIPT_DIR 'bilder-verkleinern.ps1') -Quelle $rohOrdner
$kleinOrdner = "$rohOrdner-klein"

# ── 5. Nach GitHub ───────────────────────────────────────────────────────────
$repoOrdner = Join-Path $Arbeitsordner 'Sammlung-'
if (Test-Path $repoOrdner) { Remove-Item $repoOrdner -Recurse -Force }

Schreibe "Klone Bilder-Repo..."
git clone --depth 1 $BILDER_REPO $repoOrdner 2>&1 | Out-Null

$zielBilder = Join-Path $repoOrdner 'images'
New-Item -ItemType Directory -Path $zielBilder -Force | Out-Null
Copy-Item "$kleinOrdner\*" $zielBilder -Force

Push-Location $repoOrdner
git add images 2>&1 | Out-Null
git commit -q -m "Bilder aus Supabase gesichert und verkleinert" 2>&1 | Out-Null
Schreibe "Schiebe nach GitHub..."
git push -q origin main 2>&1 | Out-Null
$pushOk = $?
Pop-Location

if ($pushOk) {
    Schreibe "Bilder liegen jetzt in GitHub" Green
} else {
    Schreibe "Push fehlgeschlagen - Bilder liegen lokal in $kleinOrdner" Red
    Schreibe "Sag Claude Bescheid, dann wird von Hand geschoben." Yellow
}

# ── 6. SQL ausgeben ──────────────────────────────────────────────────────────
$sql = @"
UPDATE flaschen
SET bild_url = REPLACE(bild_url,
      '$SPEICHER',
      '$GITHUB_ROH')
WHERE bild_url LIKE '%supabase.co/storage%';

UPDATE flaschen
SET bild_urls = REPLACE(bild_urls,
      '$SPEICHER',
      '$GITHUB_ROH')
WHERE bild_urls LIKE '%supabase.co/storage%';
"@

$sqlDatei = Join-Path $Arbeitsordner 'urls-umbiegen.sql'
$sql | Set-Content $sqlDatei -Encoding UTF8

Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  RETTUNG ABGESCHLOSSEN" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  $geladen Bilder gesichert und verkleinert"
Write-Host "  Original:    $rohOrdner"
Write-Host "  Verkleinert: $kleinOrdner"
Write-Host ""
Write-Host "  NOCH ZU TUN im Supabase-Dashboard:" -ForegroundColor Yellow
Write-Host "  1. SQL Editor -> Inhalt von $sqlDatei ausfuehren"
Write-Host "  2. Storage -> SammlungBilder -> alles loeschen"
Write-Host ""
Write-Host "  Danach ist die Sperre dauerhaft weg." -ForegroundColor Green
Write-Host ""
