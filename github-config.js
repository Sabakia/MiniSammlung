// Ziel-Repo fuer Bilder und Flaschendaten.
//
// Hier steht bewusst KEIN Zugangsschluessel: GitHub durchsucht oeffentliche
// Repos automatisch nach Tokens und macht gefundene sofort ungueltig. Der
// Token wird stattdessen beim Anmelden eingegeben und nur im Browser
// gespeichert (localStorage) - er landet nie im Quelltext.
const GITHUB_REPO_OWNER = 'Sabakia'
const GITHUB_REPO_NAME  = 'Sammlung-'
const GITHUB_BRANCH     = 'main'
