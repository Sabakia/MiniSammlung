# Mini-Mini-Bar Import Script

$DATEI   = "C:\Users\s.kiani\Downloads\spirituosen-2026-07-19.json"
$URL     = "https://jxoevkdztkjqaavfooud.supabase.co/rest/v1/flaschen"
$API_KEY = "sb_publishable_GMDUYECdFXsuEIxk4zqs7A_yVdSNxQN"

$headers = @{
    "apikey"        = $API_KEY
    "Authorization" = "Bearer $API_KEY"
    "Content-Type"  = "application/json"
    "Prefer"        = "return=minimal"
}

function Send-Eintrag($eintrag) {
    $bodyStr  = ConvertTo-Json -InputObject @($eintrag) -Depth 10 -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyStr)
    try {
        Invoke-RestMethod -Uri $URL -Method POST -Headers $headers -Body $bodyBytes -ErrorAction Stop | Out-Null
        return $true
    } catch {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $detail = $reader.ReadToEnd()
        Write-Host "  FEHLER bei '$($eintrag.name)' [$($eintrag.kategorie)]: $detail"
        return $false
    }
}

Write-Host "Lese Datei..."
$json = Get-Content $DATEI -Raw -Encoding UTF8 | ConvertFrom-Json

$alle = @()

foreach ($prop in $json.data.PSObject.Properties) {
    $katName = $prop.Name
    foreach ($f in $prop.Value) {
        $alleUrls = @()
        if ($f.imgs -and $f.imgs.Count -gt 0) {
            foreach ($img in $f.imgs) { $alleUrls += [string]$img }
        }

        $eintrag = @{
            name           = [string]$f.name
            kategorie      = [string]$katName
            groesse_ml     = if ($null -ne $f.size)                            { [string]$f.size }           else { $null }
            alkohol_vol    = if ($null -ne $f.alc)                             { [string]$f.alc }            else { $null }
            material       = if ($f.material -and "$($f.material)".Trim())     { "$($f.material)".Trim() }   else { $null }
            hinzugefuegt   = if ($null -ne $f.year)                            { [string]$f.year }           else { $null }
            geschmack      = if ($f.taste -and "$($f.taste)".Trim())           { "$($f.taste)".Trim() }      else { $null }
            destillerie    = if ($f.distillery -and "$($f.distillery)".Trim()) { "$($f.distillery)".Trim() } else { $null }
            hergestellt_in = if ($f.country -and "$($f.country)".Trim())       { "$($f.country)".Trim() }    else { $null }
            notiz          = if ($f.note -and "$($f.note)".Trim())             { "$($f.note)".Trim() }       else { $null }
            bild_url       = if ($alleUrls.Count -gt 0) { $alleUrls[0] } else { $null }
            bild_urls      = if ($alleUrls.Count -gt 1) { ConvertTo-Json -InputObject @($alleUrls) -Compress } else { $null }
        }
        $alle += $eintrag
    }
}

$gesamt = $alle.Count
Write-Host "$gesamt Flaschen gefunden. Starte Batch-Import..."

# Erst in 50er Batches versuchen
$batch_size = 50
$erfolg     = 0
$einzelFehler = @()

for ($i = 0; $i -lt $gesamt; $i += $batch_size) {
    $end       = [Math]::Min($i + $batch_size, $gesamt)
    $batch     = $alle[$i..($end - 1)]
    $bodyStr   = ConvertTo-Json -InputObject @($batch) -Depth 10 -Compress
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyStr)

    try {
        Invoke-RestMethod -Uri $URL -Method POST -Headers $headers -Body $bodyBytes -ErrorAction Stop | Out-Null
        $erfolg += ($end - $i)
        Write-Host "  OK: $erfolg / $gesamt"
    } catch {
        # Batch fehlgeschlagen -> einzeln versuchen
        Write-Host "  Batch $($i+1)-$end fehlgeschlagen, versuche einzeln..."
        foreach ($e in $batch) {
            if (Send-Eintrag $e) { $erfolg++ }
            else { $einzelFehler += $e.name }
        }
    }
}

Write-Host ""
Write-Host "----------------------------------"
Write-Host "  $erfolg / $gesamt importiert"
if ($einzelFehler.Count -gt 0) {
    Write-Host "  Nicht importiert ($($einzelFehler.Count)):"
    $einzelFehler | ForEach-Object { Write-Host "    - $_" }
}
Write-Host "----------------------------------"
