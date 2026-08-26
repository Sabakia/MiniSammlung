# Bilder-Umzug: Supabase → GitHub

Ziel: **alle** Fotos behalten, Supabase-Speicher leeren, Sperre aufheben.

Ausgangslage: 2,86 GB in Supabase bei 1,1 GB Limit → Projekt gesperrt (HTTP 402),
Datenbank und Speicher sind beide nicht erreichbar.

Die 248 Original-Bilder unter `raw.githubusercontent.com` sind von alledem
**nicht** betroffen — sie waren nie in Supabase.

---

## Schritt 1 — Bilder sichern *(nur du, ~5 Min)*

Die Sperre blockiert jede API-Anfrage, auch die öffentlichen Bild-URLs.
Der einzige Weg an die Dateien führt über das Dashboard.

1. [supabase.com](https://supabase.com) → Projekt → **Storage** → `SammlungBilder`
2. Alle Dateien markieren → **Download**
3. Ordner-Pfad notieren, z. B. `C:\Users\s.kiani\Downloads\SammlungBilder`

> Noch **nichts** löschen. Erst wenn die Bilder sicher in GitHub liegen.

---

## Schritt 2 — Verkleinern *(macht Claude)*

```powershell
.\bilder-verkleinern.ps1 -Quelle "C:\Users\s.kiani\Downloads\SammlungBilder"
```

Max. 1600px, JPEG 82 %. Dateinamen bleiben identisch — nur so funktioniert
Schritt 4. Bereits kleine Bilder werden nicht angefasst.

Erwartung: 2,86 GB → ca. 50 MB.

---

## Schritt 3 — Nach GitHub *(macht Claude)*

Die verkleinerten Dateien wandern nach `Sabakia/Sammlung-` in den Ordner
`images/`, wo die 248 alten Bilder schon liegen.

---

## Schritt 4 — URLs umbiegen *(nur du, ~1 Min)*

Supabase Dashboard → **SQL Editor** → ausführen:

```sql
UPDATE flaschen
SET bild_url = REPLACE(
      bild_url,
      'https://jxoevkdztkjqaavfooud.supabase.co/storage/v1/object/public/SammlungBilder/',
      'https://raw.githubusercontent.com/Sabakia/Sammlung-/main/images/')
WHERE bild_url LIKE '%supabase.co/storage%';

UPDATE flaschen
SET bild_urls = REPLACE(
      bild_urls,
      'https://jxoevkdztkjqaavfooud.supabase.co/storage/v1/object/public/SammlungBilder/',
      'https://raw.githubusercontent.com/Sabakia/Sammlung-/main/images/')
WHERE bild_urls LIKE '%supabase.co/storage%';
```

Der SQL Editor funktioniert trotz der Sperre.

---

## Schritt 5 — Aufräumen *(nur du, ~1 Min)*

Storage → `SammlungBilder` → alles löschen.

Sobald der Speicher unter 1,1 GB liegt, ist die Sperre weg und die Seite
läuft wieder — mit allen Bildern.

---

## Danach

Neue Fotos gehen weiter nach Supabase, werden aber im Browser auf 1600px
verkleinert (~150 KB statt 5–12 MB). Beim Speichern steht die Ersparnis in
der Statuszeile. Bei dieser Größe passen über 5.000 Fotos ins Gratis-Limit.
