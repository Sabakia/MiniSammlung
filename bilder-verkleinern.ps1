# Verkleinert alle Bilder aus einem Ordner.
# Dateinamen bleiben exakt gleich -> die URLs lassen sich per SQL umbiegen.
#
#   .\bilder-verkleinern.ps1 -Quelle "C:\Users\s.kiani\Downloads\SammlungBilder"
#
# Ergebnis liegt danach in <Quelle>-klein

param(
    [Parameter(Mandatory = $true)][string]$Quelle,
    [string]$Ziel,
    [int]$MaxKante  = 1600,
    [int]$Qualitaet = 82
)

Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Quelle)) {
    Write-Host "Ordner nicht gefunden: $Quelle" -ForegroundColor Red
    exit 1
}
if (-not $Ziel) { $Ziel = "$Quelle-klein" }
if (-not (Test-Path $Ziel)) { New-Item -ItemType Directory -Path $Ziel | Out-Null }

# JPEG-Encoder mit einstellbarer Qualitaet
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
             Where-Object { $_.MimeType -eq 'image/jpeg' }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality, [int64]$Qualitaet)

$dateien = Get-ChildItem -Path $Quelle -File
$gesamt  = $dateien.Count
Write-Host "$gesamt Dateien in $Quelle" -ForegroundColor Cyan
Write-Host ""

$vorherBytes = 0
$nachherBytes = 0
$ok = 0
$uebersprungen = 0

foreach ($d in $dateien) {
    $vorherBytes += $d.Length
    $zielPfad = Join-Path $Ziel $d.Name

    try {
        $bild = [System.Drawing.Image]::FromFile($d.FullName)
    } catch {
        # Kein lesbares Bild -> unveraendert kopieren, nichts geht verloren
        Copy-Item $d.FullName $zielPfad -Force
        $nachherBytes += $d.Length
        $uebersprungen++
        continue
    }

    # Schon klein genug -> unveraendert lassen, kein Qualitaetsverlust
    if ([Math]::Max($bild.Width, $bild.Height) -le $MaxKante -and $d.Length -le 400KB) {
        $bild.Dispose()
        Copy-Item $d.FullName $zielPfad -Force
        $nachherBytes += $d.Length
        $uebersprungen++
        continue
    }

    try {
        $faktor = [Math]::Min(1.0, $MaxKante / [Math]::Max($bild.Width, $bild.Height))
        $breite = [int][Math]::Round($bild.Width  * $faktor)
        $hoehe  = [int][Math]::Round($bild.Height * $faktor)

        $neu = New-Object System.Drawing.Bitmap($breite, $hoehe)
        $g   = [System.Drawing.Graphics]::FromImage($neu)
        $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($bild, 0, 0, $breite, $hoehe)
        $g.Dispose()

        $neu.Save($zielPfad, $jpegCodec, $encParams)
        $neu.Dispose()
        $bild.Dispose()

        # Wenn das Original kleiner war, dieses behalten
        $neueGroesse = (Get-Item $zielPfad).Length
        if ($neueGroesse -ge $d.Length) {
            Copy-Item $d.FullName $zielPfad -Force
            $neueGroesse = $d.Length
        }
        $nachherBytes += $neueGroesse
        $ok++
    } catch {
        $bild.Dispose()
        Copy-Item $d.FullName $zielPfad -Force
        $nachherBytes += $d.Length
        $uebersprungen++
        continue
    }

    if (($ok + $uebersprungen) % 25 -eq 0) {
        Write-Host "  $($ok + $uebersprungen) / $gesamt ..."
    }
}

$vorherMB  = [Math]::Round($vorherBytes  / 1MB, 1)
$nachherMB = [Math]::Round($nachherBytes / 1MB, 1)
$ersparnis = if ($vorherBytes -gt 0) {
    [Math]::Round((1 - $nachherBytes / $vorherBytes) * 100, 1)
} else { 0 }

Write-Host ""
Write-Host "----------------------------------------"
Write-Host "  $ok verkleinert, $uebersprungen unveraendert uebernommen"
Write-Host "  $vorherMB MB  ->  $nachherMB MB   ($ersparnis % gespart)"
Write-Host "  Ergebnis: $Ziel"
Write-Host "----------------------------------------"
