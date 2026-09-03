// GitHub-Zugangsdaten für den Bilder-Upload — bewusst öffentlich im Quelltext,
// weil die Seite ohne eigenen Server läuft. Der Token wirkt AUSSCHLIESSLICH
// auf das Repo Sabakia/Sammlung- und darf dort nur Dateien lesen/schreiben.
// Token ersetzen: github.com → Settings → Developer settings →
// Personal access tokens → Fine-grained tokens
const GITHUB_TOKEN       = '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'
const GITHUB_REPO_OWNER  = 'Sabakia'
const GITHUB_REPO_NAME   = 'Sammlung-'
const GITHUB_BRANCH      = 'main'

// SHA-256 des Admin-Passworts. Aktuell: minibar
// Aendern: neuen Hash erzeugen lassen und hier eintragen.
const ADMIN_PASSWORT_HASH = '9dfb2328da1bbbec0023bf4129d6f0afe4ab69260c5b5be31caac99027a48d1d'
