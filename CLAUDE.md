# Mini — Projekt-Kontext

Vanilla JS Web-App als Flaschen-/Produktkatalog mit Supabase-Backend.

## Tech Stack

- **Frontend**: Vanilla HTML + CSS + JavaScript (kein Framework, kein Build-Step)
- **Backend**: Supabase (Auth, Postgres DB, Storage für Fotos)
- **Deploy**: Statische Dateien (GitHub Pages oder ähnlich)

## Dateien

| Datei | Zweck |
|-------|-------|
| `index.html` | Haupt-App (Katalog, Modal, Hero) |
| `galerie.html` | Galerie-Ansicht |
| `app.js` | Gesamte App-Logik |
| `style.css` | Styling |
| `supabase-config.js` | Supabase URL + Anon-Key |

## Architektur-Regeln

- Alle DOM-Manipulationen über `esc()` laufen lassen (XSS-Schutz)
- State ist in den Globals `alleFlaschen`, `aktiveKategorie`, `suchbegriff`, `bearbeitungsId`
- Bilder werden in Supabase Storage hochgeladen; URLs in `bild_urls` (Array) gespeichert
- Admin-Aktionen nur wenn `supabase.auth.getUser()` einen User zurückgibt

## Coding-Regeln

- Kein TypeScript, kein Build-Step — bleibt reines Vanilla JS
- Funktionen klein halten (<50 Zeilen)
- Keine `console.log` im fertigen Code
- Immutable State-Updates bevorzugen (Array-Spread statt push/mutation)

## Best Practices (globale Referenz)

Gilt alles aus `~/.claude/CLAUDE.md`:
- Command → Agent → Skill Pattern
- `/compact` bei ~50% Context-Nutzung
- Plan vor Implementierung
- Feature-spezifische Subagents
