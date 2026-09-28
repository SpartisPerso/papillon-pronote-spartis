# Papillon — Chrome + Firefox : organisation, build et publication

Guide pas-à-pas. Une seule branche (`main`), un seul `manifest.json` (Chrome),
et un script qui fabrique la variante Firefox dans un dossier jetable `dist/`.

---

## 1. Le principe en 30 secondes

Ton extension = **le même code** + **un fichier qui dit au navigateur quoi charger**
(`manifest.json`).

Ce fichier est le SEUL qui diffère entre Chrome et Firefox. Côté Firefox il faut
**4 lignes en plus** (dont un identifiant, sans lequel Firefox oublie ton thème au
redémarrage).

Donc **pas de deuxième copie du projet** : le script fabrique la copie Firefox quand
on en a besoin, et on la jette.

```
papillon-pronote/          ← UNE seule branche : tout ton travail
  manifest.json            ← pour Chrome, tu n'y touches pas
  content/ options/ assets/ styles/ icons/
  tools/build.mjs          ← NOUVEAU : fabrique la copie Firefox
  package.json             ← NOUVEAU : 3 scripts, 0 dépendance

dist/                      ← NOUVEAU, jetable, ignoré par git
  chrome/                  ← copie + manifest Chrome
  firefox/                 ← copie + manifest Firefox (4 lignes de plus)
  papillon-pronote-chrome-1.1.0.zip
  papillon-pronote-firefox-1.1.0.zip
```

`dist/` = bac à sable. Tu peux le supprimer, il se régénère. Git ne le suit pas,
donc **jamais de conflit**.

### Pourquoi pas deux branches (`main` + `firefox`) ?

Dans CLAUDE.md, chaque nouveau `.css` doit être ajouté **deux fois** dans
`manifest.json` (dans `content_scripts` ET dans `web_accessible_resources`).

- Sur `main` tu ajoutes `Notes/Trucs.css` → tu modifies le manifeste → commit.
- Sur `firefox` il faut **refaire exactement la même modif**, sinon Firefox ne charge
  pas le nouveau fichier → commit.
- Tu oublies un jour → Firefox casse, et tu ne t'en aperçois que le jour où tu testes.
- Comme c'est le même gros fichier modifié sur les deux branches, Git te demande de
  résoudre le conflit à chaque presque-modification.

Avec 1 seule branche : tu ne penses jamais à Firefox pendant que tu codes.

---

## 2. Étape 1 — Rendre le code compatible Firefox

### Le problème

Le code écrit `chrome.storage.sync.get(...).then(...)`.
Sur Chrome, `chrome.storage` **renvoie une promesse** → ça marche.
Sur Firefox, le namespace `chrome` est **callback-only et renvoie `undefined`**
→ `TypeError: ... .then is not a function` → **le thème ne s'applique jamais**.

### La solution

Firefox expose aussi `browser`, qui est la même API **avec** des promesses.
Un `browser` si présent, sinon `chrome` :

```js
// Firefox expose `browser` (API à promesses) ; Chrome expose `chrome`,
// qui renvoie déjà une promesse en Manifest V3.
const STORAGE = (globalThis.browser && globalThis.browser.storage)
  ? browser.storage
  : chrome.storage;
```

Puis on remplace `chrome.storage` par `STORAGE` dans ces 4 fichiers.

**Rien d'autre à changer** : `chrome.runtime.getURL` marche à l'identique partout,
et le projet n'a pas de `background`/`service_worker` (le piège MV3 Firefox classique),
ni `chrome.scripting`, ni `declarativeNetRequest`.

### Fichiers concernés

| Fichier | Ligne | Action |
|---|---|---|
| `content/pronote/accueil/pronote.js` | 20-22 | ajouter `STORAGE`, remplacer 2 appels |
| `content/portal/portal.js` | 15 et 80-87 | idem |
| `content/educonnect/educonnect.js` | 254-263 | idem |
| `options/options.js` | 22 et 41 | idem |
| `content/pronote/Notes/Mes Notes/MesNotes.js` | 1236 | **rien** : déjà en callback, compatible |

### Les modifs, une par une

**`content/pronote/accueil/pronote.js`** — ajouter après `'use strict';` (ligne 7) :

```js
  // Firefox expose `browser` (API à promesses) ; Chrome expose `chrome`,
  // qui renvoie déjà une promesse en Manifest V3.
  const STORAGE = (globalThis.browser && globalThis.browser.storage)
    ? browser.storage
    : chrome.storage;
```

puis remplacer la fonction `loadTheme()` (lignes 18-27) par :

```js
  function loadTheme() {
    try {
      STORAGE.sync.get({ theme: 'light' }).then(
        (s) => applyTheme(s && s.theme),
        () => applyTheme('light')
      );
      STORAGE.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.theme) applyTheme(changes.theme.newValue);
      });
    } catch (e) {
      applyTheme('light');
    }
  }
```

**`content/portal/portal.js`** — ajouter après la ligne 15 (`const asset = ...`) :

```js
  const STORAGE = (globalThis.browser && globalThis.browser.storage)
    ? browser.storage
    : chrome.storage;
```

puis remplacer les lignes 80-87 par :

```js
    if (STORAGE && STORAGE.sync) {
      STORAGE.sync.get({ theme: 'light' }).then(
        (s) => applyTheme(s && s.theme),
        () => applyTheme('light')
      );
      STORAGE.onChanged.addListener((changes, area) => {
        if (area === 'sync' && changes.theme) applyTheme(changes.theme.newValue);
      });
    }
```

**`content/educonnect/educonnect.js`** — même ajout en tête de IIFE, et remplacer
les lignes 254-263 par le même bloc que ci-dessus.

**`options/options.js`** — ajouter après la ligne 6, remplacer `chrome.storage.sync`
par `STORAGE.sync` aux lignes 22 et 41.

### Vérifier que Chrome n'a pas regressé

Recharger l'extension dans `chrome://extensions`, ouvrir les Options, changer de
thème, vérifier que les pages PRONOTE / ENT / EduConnect suivent bien.

---

## 3. Étape 2 — `tools/build.mjs`

Node pur, **aucune dépendance** (pas de `npm install`, pas de `node_modules`).
Utilise `zip`, présent en local et sur les runners GitHub.

```js
#!/usr/bin/env node
/* ============================================================
   Papillon — build multi-navigateurs (Chrome + Firefox)

   Copie les sources dans dist/<cible>/, applique le patch de
   manifeste Firefox, puis zippe le tout.

   Usage :
     node tools/build.mjs                 # les deux cibles
     node tools/build.mjs --firefox-only  # Firefox seul (itération rapide)
     node tools/build.mjs --check         # vérifie que le manifeste est complet
   ============================================================ */

import {
  existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, cpSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/* --- À personnaliser --------------------------------------- */
const GECKO_ID = 'papillon-pronote@cyprien63.github.io'; // ne plus changer après la 1re publication
const MIN_FIREFOX = '128.0';
/* ----------------------------------------------------------- */

const SKIP_DIRS = new Set(['.git', '.github', '.claude', 'dist', 'node_modules']);
const SKIP_FILES = new Set(['CLAUDE.md', 'MULTI-NAVIGATEURS.md', 'Thumbs.db', '.DS_Store']);

const args = process.argv.slice(2);
const only = args.includes('--firefox-only') ? ['firefox'] : ['chrome', 'firefox'];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (!SKIP_FILES.has(name) && name !== '.DS_Store') {
      out.push(relative(ROOT, full));
    }
  }
  return out;
}

/* -- Vérifie que chaque fichier du manifeste existe bien ---- */
function check() {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  const refs = [];
  for (const cs of m.content_scripts || []) refs.push(...(cs.js || []), ...(cs.css || []));
  for (const war of m.web_accessible_resources || []) refs.push(...war.resources);
  if (m.options_ui) refs.push(m.options_ui.page);
  refs.push(...Object.values(m.icons || {}));

  const missing = [];
  for (const r of new Set(refs)) {
    if (!r.includes('*') && !existsSync(join(ROOT, r))) missing.push(r);
    if (r.includes('*') && !existsSync(join(ROOT, r.replace(/\*+$/, '').replace(/\/$/, '')))) {
      missing.push(`${r} (dossier vide)`);
    }
  }

  if (missing.length) {
    console.error('✗ manifest.json incomplet — à ajouter :');
    missing.forEach((f) => console.error(`    - ${f}`));
    process.exit(1);
  }
  console.log(`✓ manifest.json complet (${new Set(refs).size} références vérifiées)`);
}

/* -- Manifeste Firefox : MV3 + 4 lignes Gecko --------------- */
function firefoxManifest(m) {
  const f = structuredClone(m);
  f.browser_specific_settings = {
    gecko: {
      id: GECKO_ID,
      strict_min_version: MIN_FIREFOX,
      data_collection_permissions: { required: ['none'] },
    },
  };
  return f;
}

function build(target, manifest) {
  const dir = join(DIST, target);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  for (const f of walk(ROOT)) {
    const dest = join(dir, f);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(ROOT, f), dest);
  }
  writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const version = manifest.version;
  const zip = join(DIST, `papillon-pronote-${target}-${version}.zip`);
  rmSync(zip, { force: true });
  // Entrées explicites : le manifest.json se retrouve à la racine du zip (exigé par AMO)
  const entries = readdirSync(dir).filter((n) => !n.startsWith('.'));
  execFileSync('zip', ['-qr', zip, ...entries], { cwd: dir });

  console.log(`✓ ${target.padEnd(7)} → dist/${relative(ROOT, zip)}`);
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
check();
if (!args.includes('--check')) {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  for (const target of only) build(target, target === 'firefox' ? firefoxManifest(manifest) : manifest);
  console.log('\ndist/ est jetable : rm -rf dist');
}
```

---

## 4. Étape 3 — `package.json`

```json
{
  "name": "papillon-pronote",
  "version": "1.1.0",
  "private": true,
  "description": "Extension Chrome et Firefox (Manifest V3) — refonte ENT et PRONOTE façon Papillon",
  "type": "module",
  "scripts": {
    "build": "node tools/build.mjs",
    "build:firefox": "node tools/build.mjs --firefox-only",
    "check": "node tools/build.mjs --check"
  }
}
```

Aucune dépendance → **pas de `npm install`**, pas de `node_modules`, rien à mettre à jour.

## 5. Étape 4 — `.gitignore`

Ajouter :

```gitignore
# Build multi-navigateurs
dist/
node_modules/
```

---

## 6. Étape 5 — GitHub Actions

### `.github/workflows/ci.yml` — à chaque push

Attrape les régressions **avant** de taguer, gratuitement.

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verif:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - name: Manifeste complet
        run: node tools/build.mjs --check
      - name: Build Chrome + Firefox
        run: node tools/build.mjs
      - name: Lint Firefox (web-ext, outil officiel Mozilla)
        run: npx --yes web-ext@8 lint --source-dir dist/firefox
      - uses: actions/upload-artifact@v4
        with:
          name: firefox-test
          path: dist/papillon-pronote-firefox-*.zip
```

### `.github/workflows/release.yml` — au tag `v*`

```yaml
name: Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version:
        description: 'Version (ex. 1.1.0) — ignoré si un tag est poussé'
        required: true

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Build Chrome + Firefox
        run: node tools/build.mjs

      - name: Signer le XPI Firefox (AMO, gratuit)
        if: ${{ secrets.AMO_KEY != '' && secrets.AMO_SECRET != '' }}
        env:
          AMO_KEY: ${{ secrets.AMO_KEY }}
          AMO_SECRET: ${{ secrets.AMO_SECRET }}
        run: npx --yes web-ext@8 sign --api-key "$AMO_KEY" --api-secret "$AMO_SECRET" --source-dir dist/firefox --artifacts-dir dist

      - name: Publier la release GitHub
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          INPUT_VERSION: ${{ inputs.version }}
        run: |
          set -euo pipefail
          VERSION=$(node -p "require('./manifest.json').version")
          TAG="${GITHUB_REF_NAME}"
          if [ "$TAG" = "main" ] || [ -z "$TAG" ]; then TAG="v${INPUT_VERSION:-$VERSION}"; fi
          if ! git rev-parse "refs/tags/$TAG" >/dev/null 2>&1; then
            git tag "$TAG" && git push origin "$TAG"
          fi
          shopt -s nullglob
          FILES=(dist/*.zip dist/*.xpi)
          if gh release view "$TAG" >/dev/null 2>&1; then
            gh release upload "$TAG" "${FILES[@]}" --clobber
          else
            gh release create "$TAG" "${FILES[@]}" --title "Papillon $VERSION" --generate-notes
          fi
```

L'étape de signature est **conditionnée aux secrets** : sans eux, le build produit
quand même les ZIP et ne casse pas. Tu peux donc activer le workflow avant de créer
le compte Mozilla.

---

## 7. Étape 6 — Les clés Mozilla (gratuit, 5 min)

1. `addons.mozilla.org` → menu `⋯` en haut à droite → **Developer Account**
2. **API Key and secret** → bouton *Create new API key* (choisis n'importe quelle
   extension factice, ça ne publie rien)
3. Sur ton dépôt GitHub : **Settings → Secrets and variables → Actions → New repository secret**
   - `AMO_KEY` = la clé
   - `AMO_SECRET` = le secret
4. Relance le workflow. Il produit un `.xpi` **signé** attaché à la release.

La signature est illimitée et gratuite. ⚠️ **`GECKO_ID` ne doit plus changer** après la
première publication, sinon Firefox verra une nouvelle extension.

## 8. Étape 7 — Publier sur addons.mozilla.org (gratuit)

1. `addons.mozilla.org` → **Submit a New Add-on** → upload du
   `dist/papillon-pronote-firefox-1.1.0.zip`
2. Distribution : **On Mozilla** (c'est le mode *unlisted*, gratuit, **sans revue humaine**,
   dispo en quelques minutes) — évite *Listed* qui demande 1 à 7 jours de revue.
3. Firefox devient le canal principal (installation en 2 clics, survit aux
   redémarrages). Chrome reste sur le zip du Release.

Mises à jour : on télécharge le `.xpi` signé depuis le Release et on le dépose dans le
dashboard AMO. L'automatisation de l'upload est possible mais on l'ajoute plus tard
si besoin.

## 9. Étape 8 — Documentation

**`README.md`**, ligne 3 :

> Extension Chrome (Manifest V3) qui refond les pages scolaires…

→

> Extension **Chrome et Firefox** (Manifest V3) qui refond les pages scolaires…

et remplacer la section *Installation* par les subsections *Chrome* / *Firefox* ci-dessus.

**`CLAUDE.md`**, ligne 12 (« Aucune étape de build : le dossier est chargé tel quel. ») :

> `manifest.json` reste le manifeste **Chrome**, chargé tel quel (aucune étape de build).
> Pour Firefox : `npm run build` fabrique une copie jetable dans `dist/` (voir
> `MULTI-NAVIGATEURS.md`) ; ne jamais éditer le manifeste pour Firefox.

et ajouter dans *Règles de codage* :

> - **Compatibilité Firefox** : ne jamais appeler `chrome.storage` en promettant
>   directement (`chrome.storage.x.get().then(...)` casse sur Firefox, qui renvoie
>   `undefined` dans le namespace `chrome`). Passer par la constante locale
>   `STORAGE` (`browser.storage` si disponible, sinon `chrome.storage`).
>   `chrome.runtime.getURL` est OK tel quel.

---

## 10. Tests

**Chrome** (après l'étape 1, pour vérifier l'absence de régression)
1. `chrome://extensions` → recharger l'extension
2. Options → changer de thème → les pages suivent

**Firefox** (en local, avant de publier)

```bash
npm run build:firefox
```

puis Firefox → `about:debugging#/runtime/this-firefox` → **Charger un module temporaire**
→ choisir `dist/firefox/manifest.json` → vérifier :

- [ ] bandeau, widgets et cartes PRONOTE présents
- [ ] page de connexion ENT et EduConnect restylées
- [ ] Options : changer de thème → les pages suivent **en direct**
- [ ] le thème **persiste** après `Ctrl+R` (et après un redémarrage de Firefox : c'est
      le rôle du `gecko.id`)
- [ ] une page Notes : changer de période, un élément du Cahier de textes

**Amélioration optionnelle (cosmétique)** : les barres de défilement customisées
(`::-webkit-scrollbar`, dans `VueHebdomadaire.css`, `MesNotes.css`,
`anciensbulletins.css`) ne s'appliquent pas sur Firefox. Pour un rendu identique,
ajouter dans ces 3 fichiers :

```css
scrollbar-width: thin;
scrollbar-color: #c7d2cd transparent;
```

(et l'équivalent sombre). Sans cela, la page reste parfaitement utilisable.

---

## 11. Pièges

- **Bumper `version` dans `manifest.json` AVANT chaque tag** : AMO refuse deux fois la
  même version pour le même `id`.
- Ne **jamais** modifier `manifest.json` pour Firefox. Si l'API Firefox change, ça se
  passe dans `tools/build.mjs`.
- Un nouveau `.css`/`.js` doit être ajouté **deux fois** dans `manifest.json`
  (`content_scripts` + `web_accessible_resources`) — c'est documenté dans CLAUDE.md.
  `npm run check` (exécuté par la CI) détecte les oublis.
- `dist/` est jetable, ne jamais le commiter.
- Chrome : un zip n'est **pas installable** directement ; il faut le dézipper puis
  « Charger l'extension non empaquetée ». Le Web Store (5 $ **une seule fois à vie**)
  reste possible plus tard si tu veux l'installation en 1 clic.
