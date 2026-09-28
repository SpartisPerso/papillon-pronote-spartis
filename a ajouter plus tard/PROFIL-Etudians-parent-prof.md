# Papillon — Comptes Étudiant, Parent, Professeur : organisation de la prise en charge

Document d'organisation, dans la même veine que `MULTI-NAVIGATEURS.md`.

But : préparer le support des trois types de comptes PRONOTE (**étudiant**, **parent**,
**professeur**) sans dupliquer le projet, sans casser l'existant (élève), et en gardant
chaque interface non stylée **natif donc fonctionnel**.

> ⚠️ Aucune modification du repo n'est prévue ici : ce fichier est un plan. Quand tu
> décideras d'implémenter, commence par relire `CLAUDE.md` et le skill
> `/papillon-pronote` (règles de design, MutationObserver, pièges).

---

## 1. Le principe en 30 secondes

PRONOTE sert **le même domaine et le même dossier** pour les trois comptes :
`https://<etablissement>.index-education.net/pronote/*`. C'est **le compte qui choisit
l'espace** : page d'accueil, rubriques du menu, widgets, pages disponibles.

- Le manifeste ne connaît qu'un seul `matches` : `https://*.index-education.net/pronote/*`
  (`manifest.json`), déjà valable pour les trois profils.
- Aujourd'hui l'extension suppose l'interface Élève (le README dit d'ailleurs
  « Espace PRONOTE (Élèves) »). Tout ce qui ne correspond pas à ce DOM reste natif.
- L'objectif : **un seul code, une détection de profil, des modules conditionnés par
  profil**.

```
papillon-pronote/
  manifest.json              ← UN SEUL manifeste pour les 3 comptes
  content/pronote/accueil/pronote.js   ← bootstrap (thème)
  content/pronote/accueil/profil.js    ← NOUVEAU : détecte le compte (étudiant/parent/prof)
  content/pronote/.../eleve/…          ← modules actuels, qui déclarent leur profil cible
  …                                    ← parents et profs ajoutés petit à petit, même méthode
```

Règle d'or : **le profil inconnu ou non pris en charge = interface native, donc
utilisable.** C'est un restyle purement visuel, jamais un changement de comportement.

### Pourquoi pas un dossier ou un manifeste par compte ?

Le raisonnement est le même que pour Firefox (`MULTI-NAVIGATEURS.md`) :

- Les trois comptes partagent **exactement** le même CSS/JS d'écosystème (icônes,
  palette, mode sombre, helpers `adjust`/`svgWrap`).
- Un CSP/URL identique → un seul `matches`. Dupliquer le manifeste reviendrait à
  maintenir deux fois la même liste de fichiers.
- Le DOM parent est **très proche** de l'élève (moins de widgets, mêmes pages Notes /
  Compétences). Un dossier séparé doublerait le travail pour presque rien.

Donc : **une seule extension, un `profil.js` qui pose un marqueur, et chaque module
déclare quel(s) profil(s) il cible.**

---

## 2. Étape 1 — `content/pronote/accueil/profil.js` : détecter le compte

### Le problème

Au chargement, on ne sait pas si l'utilisateur est connecté en étudiant, en parent ou
en professeur. Et la page change de profil **sans recharger l'extension** (déconnexion
→ connexion avec un autre compte dans le même onglet).

Il faut donc :

1. détecter le profil le plus tôt possible ;
2. re-détecter à chaque navigation (le DOM est réécrit) ;
3. oublier le profil précédent dès qu'on n'est plus sur la bonne page.

### Sources de détection, par ordre de fiabilité

| Ordre | Source | Exemple | Fiabilité |
|---|---|---|---|
| 1 | **Chemin d'URL** | `/pronote/eleve.html`, `/pronote/parent.html`, `/pronote/prof.html` | ⭐⭐⭐ la plus fiable, PRONOTE ouvre un fichier différent par compte |
| 2 | **DOM de la page d'accueil** | rubriques du second menu, widgets présents/absents | ⭐⭐ utile en fallback (URL générique / alias) |
| 3 | **Texte de l'accueil / fil d'Ariane** | « Notes et compétences », « Mes classes »… | ⭐ au cas par cas |

La détection par URL doit être **complétée par un fallback DOM** : le même onglet peut
passer `eleve.html` → `login` → `parent.html` sans que le script de contenu soit
réinjecté (aucune nouvelle exécution), donc `profil.js` doit vivre derrière un
MutationObserver, comme les autres modules.

### Squelette du module (à adapter quand tu l'implémenteras)

```js
/* ============================================================
   PROFIL — détecte le type de compte PRONOTE (étudiant, parent,
   professeur) et le pose sur <html> pour le CSS + le JS.
   À charger EN PREMIER dans le block PRONOTE du manifeste.
   ============================================================ */
(() => {
  'use strict';

  const PROFILES = { eleve: 'eleve', parent: 'parent', prof: 'prof' };
  const LC = (s) => (s || '').toLowerCase();

  function detectFromUrl() {
    const p = LC(location.pathname);
    if (p.includes('/parent')) return PROFILES.parent;
    if (p.includes('/prof')) return PROFILES.prof;
    if (p.includes('/eleve')) return PROFILES.eleve;
    return null; // page de login, URL générique…
  }

  function detectFromDom() {
    /* Fallback DOM : à étoffer avec de vrais sélecteurs observés
       sur le compte réel (ex. rubrique du second menu absente/
       présente, `body` porteur d'un id/classologie différente). */
    const second = document.querySelector('nav.objetBandeauEntete_secondmenu');
    const txt = second ? second.textContent || '' : '';
    if (/saisie des notes|mes classes|cahier de textes/i.test(txt)) return PROFILES.prof;
    if (/mes enfants|suivi de l'enfant/i.test(txt)) return PROFILES.parent;
    return PROFILES.eleve; // par défaut, sans casse possible
  }

  function resolveProfile() {
    return detectFromUrl() || detectFromDom();
  }
```

⚠️ Les sélecteurs du fallback DOM ci-dessus sont **inventés** : à vérifier sur les vrais
comptes avant de figer la détection. La règle est de toujours revenir à `eleve` par
défaut (l'interface aujourd'hui couverte), jamais d'échouer en modifiant tout.

```js
  function apply(profile) {
    const root = document.documentElement;
    Object.values(PROFILES).forEach((p) => root.classList.remove('pap-profil-' + p));
    root.classList.add('pap-profil-' + profile);
    root.dataset.papillonProfil = profile;
    root.dispatchEvent(new CustomEvent('papillon:profil', { detail: profile }));
  }

  function refresh() {
    const profile = resolveProfile();
    const current = document.documentElement.dataset.papillonProfil;
    if (current && current !== profile) {
      /* Changement de compte dans le même onglet : un module de page
         vient de dé-classer ses marques, on vide aussi la mémoire. */
      try { chrome.storage.session.remove('papillonProfil'); } catch (e) { /* ignore */ }
    }
    apply(profile);
    try { chrome.storage.session.set({ papillonProfil: profile }); } catch (e) { /* ignore */ }
  }

  if (document.documentElement.hasAttribute('data-papillon')) {
    /* Bootstrap déjà passé (autre module) : on définit quand même le profil. */
    refresh();
  }
  new MutationObserver(() => refresh()).observe(document.documentElement,
    { attributeFilter: ['class'] });
  new MutationObserver(() => refresh()).observe(document.body,
    { childList: true, subtree: true });
})();
```

### Vérifier

- [ ] en console, `html` porte `pap-profil-eleve` (ou `-parent` / `-prof`) et
      `data-papillon-profil` ;
- [ ] la déconnexion puis la reconnexion avec un autre compte mettent à jour le marqueur
      sans recharger l'extension.

---

## 3. Étape 2 — Helpers `isProfile()` et `demarkAll()`

### `isProfile(...)`

Chaque module de page doit savoir s'il peut poser ses classes. Le plus simple : lire le
marqueur posé par `profil.js`.

```js
  /* Dans un module : vrai si le profil courant est dans la liste autorisée. */
  function isProfile(...allowed) {
    const p = document.documentElement.dataset.papillonProfil || 'eleve';
    return allowed.includes(p);
  }
```

Convention : **un module ne touche JAMAIS au DOM si `isProfile()` est faux**, même si
son ancre de page matche. Exemple, sur `bulletin.js` :

```js
  const PAGE_LABEL = 'Mon bulletin de notes';
  const PAGE_PROFILES = ['eleve', 'parent']; // le parent voit les bulletins de l'enfant

  function onPage() {
    if (!isProfile(...PAGE_PROFILES)) return false;
    const bc = document.getElementById('breadcrumbBandeau');
    return !!bc && bc.getAttribute('aria-label') === PAGE_LABEL;
  }
```

Ceci rend le comportement **explicitement scopé au profil** au lieu de reposer sur le
fait que « le DOM matche donc c'est bon » — qui peut se tromper si deux profils
partagent le même DOM (voir Pièges).

### `demarkAll()`

Le `<main>` de PRONOTE est **réutilisé d'un profil à l'autre**. Quand on passe
élève → parent, les classes `pap-mn-*`, `pap-edt-*`, etc. restent collées sur des
nœuds que le parent ne devrait pas voir stylés.

Deux solutions complémentaires :

1. **Par module** (existant déjà) : `demark()` enlève ses propres marques quand
   `onPage()` est faux. → Rien à changer, chaque module le fait déjà.
2. **Globale, au changement de profil** : `profil.js` écoute
   `storage.onChanged` / `papillon:profil` et demande aux modules de se re-évaluer.
   Le plus simple est de **re-forcer un `processAll(true)`** sur tous les modules :
   c'est déjà le comportement au boot, et les `demark()` se chargent du reste.

```js
  /* Dans profil.js, quand le profil change : */
  document.documentElement.dispatchEvent(new CustomEvent('papillon:profil', {
    detail: profile,
  }));
```

et côté module *(pattern à intégrer) :

```js
  document.addEventListener('papillon:profil', () => processAll(true));
```

### Ordre d'exécution

- Mettre `profil.js` **avant tout autre module** dans le manifeste (voir Étape 6) pour
  que `data-papillon-profil` existe déjà quand un module sonde `isProfile()` au boot.

---

## 4. Étape 3 — Affinité profil × module actuel

Légende : ✅ cible ; 🟡 applicable mais à vérifier (mêmes pages, libellés à confirmer) ;
⛔ hors cible (ne doit ni poser ses classes ni casser).

### Accueil — widgets `content/pronote/accueil/elements/`

| Modèle | Cible actuelle (DOM) | Étudiant | Parent | Prof | Verbe d'action |
|---|---|---|---|---|---|
| `header` (logo, barres sticky) | tous profils | ✅ | ✅ | ✅ | Universel : garder tel quel |
| `edt` (emploi du temps) | widget `section.widget.edt` | ✅ | 🟡 grappe `parent` voit l'EDT de l'enfant ? à vérifier | ⛔ l'EDT prof est différent (« Ma journée ») | Garder le garde par nœud : si absent, inerte |
| `tav` (travail à faire) | widget `section.widget` idem | ✅ | ✅ | ✅ | Universel (tous consultent les devoirs) |
| `grades` (notes) | widget dernières notes | ✅ | ✅ | ⛔ les profs n'ont pas « mes notes » | garde par nœud |
| `viescolaire` (carnet) | widget `section.widget.viescolaire` | ✅ | 🟡 | ⛔ | garde par nœud |
| `informations` (diffusions) | widget icône `diffuser_information` | ✅ | ✅ | ✅ | Universel |
| `ressources` | widget `ressourcepedagogique` | ✅ | ✅ | ✅ | Universel |
| `devoirsurveille` (DS) | widget | ✅ | ⛔ | ⛔ | garde par nœud |
| `deconnexion` | `main.deco-content` | ✅ | ✅ | ✅ | Universel |

**Conclusion** : tous ces modules sont **auto-gardés** par la présence du nœud
(`if (!node) return`). Sur un profil qui ne les affiche pas, ils sont **inertes**.
Il n'y a donc **aucun risque de casse** à les laisser tels quels ; on peut éventuellement
ajouter `isProfile()` plus tard pour la propreté, sans urgence.

### Pages — modules scopés par ancre

| Module | Ancre (`h1#breadcrumbBandeau[aria-label]`) | Étudiant | Parent | Prof |
|---|---|---|---|---|
| `Contenus` + `Vue hebdomadaire` (CDT) | « Contenus et ressources pédagogiques » | ✅ | ✅ | ✅ |
| `TravailAFaire` + `Vue hebdomadaire` (CDT) | « Travail à faire à la maison » | ✅ | ✅ | 🟡 le prof voit aussi « Cahier de textes » |
| `Forums` | (sélecteur métier CDT) | ✅ | ✅ | ✅ |
| `Compte` | `.ObjetCompte` | ✅ | ✅ | ✅ |
| `Documents` | (liste documents) | ✅ | ✅ | 🟡 |
| `MesNotes` | regex `/d[ée]tail de mes notes/i` | ✅ | ✅ | ⛔ |
| `releve` | « Mon relevé de notes » (stricte) | ✅ | ✅ | ⛔ |
| `bulletin` | « Mon bulletin de notes » (stricte) | ✅ | ✅ | ⛔ |
| `bulletinclasse` | « Bulletin de ma classe » (stricte) | ✅ | ✅ | 🟡 le prof a « bulletins de classe » |
| `anciensbulletins` | « Anciens bulletins » (stricte) | ✅ | ✅ | ⛔ |
| `mesevaluations` | « Détail de mes évaluations » (stricte) | ✅ | ✅ | ⛔ |
| `difficultes` | « Difficultés et points d'appui » (stricte) | ✅ | ✅ | ⛔ |

⚠️ **Le parent partage toutes les ancres « Notes / Compétences » de l'élève** — c'est le
point de vigilance majeur : les libellés du fil d'Ariane sont identiques, donc les
modules doivent vérifier `isProfile('eleve', 'parent')` (et exclure `prof`) pour ne
jamais styler une page prof qui aurait par hasard le même libellé.

### Récap du tableau en une phrase

> Étudiant : couverture actuelle intégrale. Parent : **réutilise à 100 % les pages Notes /
> CDT / Mes données**, avec l'accueil élagué (widgets gardés par nœud). Professeur :
> espace différent → seuls header, tav, informations, deconnexion, CDT, Documents, Compte
> sont plausibles sans adaptation.

---

## 5. Étape 4 — Inventaire à couvrir par profil (découverte sur compte réel)

### Parent

Probablement ≃ Élève avec quelques widgets en moins. À vérifier :

- accueil : widgets visibles (pas d'EDT personnel, pas de « mes DS ») ;
- les pages Notes / Compétences sont-elles identiques au DOM élève ? Si oui, il suffit de
  **déclarer le profil parent dans `PAGE_PROFILES`** de chaque module — pas de nouveau JS.

### Professeur

Espace réellement différent. Rubriques probables à découvrir (`source de la page` →
`ancre stable` → module dédié, comme toujours) :

| Espace pressenti | Module à créer (noms ASCII) | À vérifier sur compte prof |
|---|---|---|
| Accueil « Ma journée / Mes classes » | `Mes classes` / `journee` | widgets, ancre |
| « Cahier de textes » | réutilise CDT (ancres à confirmer) | différence de libellés ? |
| « Saisie des notes » / « Évaluations » | `saisienotes` | DOM type `.InterfaceDernieresNotes` ? |
| « Bulletins de classe » | `bulletinclasse` (déjà là) | ancres identiques ? |
| « Absences » / « Vie scolaire » | `absences` | tableau/nuage |

Règle : un nouvel espace prof → un dossier `.css`+`.js` par widget/page, déclaré en
doublon dans `manifest.json` (`content_scripts` + `web_accessible_resources`), avec ses
classes `pap-<prefixe>-*` propres, son ancre **stricte + `isProfile('prof')`** et sa
demark.

---

## 6. Étape 5 — Règles d'architecture à respecter

1. **Ancre stricte ET profil** : ne jamais élargir une ancre particulière (regex ou
   `aria-label` fragmenté) pour couvrir un autre profil ; ajouter `isProfile()`.
   Rappel des règles d'exclusivité mutuelle (5 Notes + mes évaluations + difficultés) —
   y ajouter désormais la dimension profil.
2. **Garde par nœud partout** : un module dont le nœud est absent est inerte. Ne pas
   « enrichir » un module pour qu'il ait un effet sur un DOM qu'il ne connaît pas.
3. **Jamais de `textContent` écrit à chaque `processAll()`** — toujours tester
   `if (el.textContent !== txt)` avant d'écrire (boucle infinie du `childList`).
4. **`demark()` + `processAll(true)` au boot** : déjà en place, indispensable car un
   changement de compte revient à « naviguer vers une autre page » dans le même `<main>`.
5. **CSS scopé au profil** quand un sélecteur est ambigu : préfixer par
   `html.pap-profil-prof …` (ex. un `.PanelDonneesEleveListe` prof vs élève).
6. **Boutons `.btnImage`, bannières masquées (`display:none`), `visibility:hidden`,
   largeurs/hauteurs inline** : renvoyer aux pièges de CLAUDE.md ; les refaire par page,
   jamais en global hors de la page.
7. **Mode sombre** : re-déclarer chaque nouveau sélecteur en
   `html.papillon-dark …` (jamais de `@media (prefers-color-scheme)`).
8. **Le skill `/papillon-pronote` reste la source de vérité** design (palette, rayons,
   Papicons, MutationObserver).

---

## 7. Étape 6 — Le manifeste

1. Ajouter `profil.js` **en premier** dans `content_scripts.js` du block PRONOTE ET en
   premier dans son entrée `web_accessible_resources.resources` :
   ```json
   "js": [
     "content/pronote/accueil/profil.js",
     "content/pronote/accueil/pronote.js",
     …
   ],
   …
   "resources": [
     "content/pronote/accueil/profil.js",
     …
   ]
   ```
   (même double déclaration que tous les autres fichiers — vérifiable avec
   `npm run check` du build, cf. MULTI-NAVIGATEURS.md).
2. **Aucun changement de `matches`** : `https://*.index-education.net/pronote/*` couvre
   les trois comptes.
3. Bumper la `version` après chaque ajout de module (pratique déjà en vigueur).

---

## 8. Tests

### Étudiant (régression — ne rien casser)

1. Chemin complet : accueil, CDT (chronologique + hebdomadaire), Mes données,
   Notes (les 5), Compétences (2).
2. Bascule Clair ↔ Sombre.
3. Console : `html` porte `pap-profil-eleve`, `main` ne porte qu'un seul marqueur de
   page à la fois.

### Parent (nouveau)

1. Connexion avec un compte parent : le marqueur passe à `pap-profil-parent`.
2. Accueil : les widgets présents sont stylés, pas de doublon ; aucun résidu `pap-edt-*`
   s'il n'y a pas d'EDT.
3. Notes → Relevé / Bulletins : cartes d'état vide correctes.
4. Console : `main` ne porte toujours qu'un seul marqueur de page.

### Professeur (nouveau)

1. Le marqueur passe à `pap-profil-prof`.
2. Aucune classe `pap-mn-*`, `pap-rlv-*`, `pap-ev-*`, `pap-dp-*` **ne doit être posée**
   (ancres + `isProfile('eleve','parent')` les bloquent).
3. Le header / tav / informations (espaces communs) restent stylés.
4. Rien ne déborde sous le bas de l'écran, thème Clair ↔ Sombre OK.

### Inter-profil (le plus important)

1. Dans le **même onglet** : `eleve.html` → déconnexion → login → `parent.html`.
   En console, `html` passe de `pap-profil-eleve` à `pap-profil-parent`, et aucune
   marque `pap-*` d'élève ne reste sur le nouvel accueil.
2. Recharger l'extension sur une page déjà connectée en parent/prof : les modules
   re-s'exécutent sur un DOM déjà marqué → `demark()` + `processAll(true)` nettoient ;
   vérifier qu'il ne reste qu'un seul marqueur de page.

---

## 9. Pièges

- **Changement de compte dans le même onglet** : l'URL passe par `/login` (aucune
  détection) puis revient sur un fichier différent (`parent.html` au lieu de
  `eleve.html`). `profil.js` doit re-détecter via URL et lever l'événement de
  changement, sinon les marques du profil précédent restent collées sur le `<main>`
  réutilisé.
- **Même DOM entre profils** : le parent voit presque le même DOM élève. Si un module
  garde son `onPage()` sans profil, il stylera aussi le parent — c'est souvent **désiré**
  (mêmes pages), le seul vrai danger est de styler une page **prof** qui partagerait une
  ancre (ex. « Bulletins de classe », « Cahier de textes »). Toujours vérifier
  `isProfile(...)` en excluant `prof` sur les ancres Notes.
- **Le fallback texte est fragile** : des libellés (« Mes classes », « Saisie des
  notes ») doivent être confirmés sur un compte réel avant d'en faire une ancre.
- **Ne pas réécrire `textContent` à chaque mutation** (boucle infinie) — voir Étape 5.3.
- **Les widgets accueil sont auto-gardés mais pas scopés** : sans `isProfile()`, un
  widget prof ayant le même sélecteur (ex. `section.widget`) serait stylé à tort. La
  garde par nœud protège des absences, pas des similitudes de noms de classe.
- **Ne jamais trahir la mutuelle exclusivité des ancres Notes** : ajouter le profil ne
  veut pas dire élargir une regex existante (cf. Piège `Notes/relevé` dans CLAUDE.md).
- **`paper-cut` de session** : `chrome.storage.session` n'existe pas derrière chaque
  CSP ; toujours envelopper les appels dans un `try/catch` (fait dans le squelette).