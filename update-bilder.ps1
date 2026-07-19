# Aktualisiert nur bild_urls fuer Flaschen mit mehreren Bildern

$DATEI   = "C:\Users\s.kiani\Downloads\spirituosen-2026-07-19.json"
$BASE    = "https://jxoevkdztkjqaavfooud.supabase.co/rest/v1/flaschen"
$API_KEY = "sb_publishable_GMDUYECdFXsuEIxk4zqs7A_yVdSNxQN"

$headers = @{
    "apikey"        = $API_KEY
    "Authorization" = "Bearer $API_KEY"
    "Content-Type"  = "application/json"
    "Prefer"        = "return=minimal"
}

Write-Host "Lese Datei..."
$json = Get-Content $DATEI -Raw -Encoding UTF8 | ConvertFrom-Json

$gesamt  = 0
$erfolg  = 0
$fehler  = 0

foreach ($prop in $json.data.PSObject.Properties) {
    $katName = $prop.Name
    foreach ($f in $prop.Value) {
        if (-not $f.imgs -or $f.imgs.Count -lt 2) { continue }

        $alleUrls = @()
        foreach ($img in $f.imgs) { $alleUrls += [string]$img }
        $gesamt++

        $urlStr    = ConvertTo-Json -InputObject @($alleUrls) -Compress
        $patch     = ConvertTo-Json @{ bild_urls = $urlStr } -Compress
        $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($patch)

        # URL-kodierter Filter: name=eq.X&kategorie=eq.Y
        $nameEnc = [Uri]::EscapeDataString($f.name)
        $katEnc  = [Uri]::EscapeDataString($katName)
        $url     = "$BASE?name=eq.$nameEnc&kategorie=eq.$katEnc"

        try {
            Invoke-RestMethod -Uri $url -Method PATCH -Headers $headers -Body $bodyBytes -ErrorAction Stop | Out-Null
            $erfolg++
        } catch {
            # PS 5.1 wirft bei 204 No Content - das ist eigentlich ein Erfolg
            if ($null -eq $_.Exception.Response) {
                $erfolg++
            } else {
                $fehler++
                Write-Host "  FEHLER bei '$($f.name)': $($_.Exception.Message)"
            }
        }
        if (($erfolg + $fehler) % 20 -eq 0) { Write-Host "  $($erfolg + $fehler) / $gesamt verarbeitet..." }
    }
}

Write-Host ""
Write-Host "----------------------------------"
Write-Host "  $gesamt Flaschen mit mehreren Bildern"
Write-Host "  $erfolg aktualisiert"
if ($fehler -gt 0) { Write-Host "  $fehler Fehler" }
Write-Host "----------------------------------"
