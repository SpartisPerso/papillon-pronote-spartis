<div align="center">

# Papillon — Portail ENT

[![Architecture diagram](https://gitdiagram.com/diagram-badge.svg)](https://gitdiagram.com/cyprien63/papillon-pronote?utm_source=readme&utm_medium=badge)
[![Voir la vidéo de présentation](https://gitdiagram.com/video-badge.svg)](https://gitdiagram.com/cyprien63/papillon-pronote/video)

Extension Chrome (Manifest V3) qui refond les pages scolaires avec le design de
l'application [Papillon](https://papillon.bzh/).

</div>

<video controls src="cyprien63-papillon-pronote-explained.mp4" title="Présentation de papillon-pronote"></video>

## Sommaire

- [Pages couvertes](#pages-couvertes)
- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Utilisation](#utilisation)
- [Structure du projet](#structure-du-projet)
- [Fonctionnement](#fonctionnement)
- [Roadmap](#roadmap)
- [Crédits et licences](#crédits-et-licences)

## Pages couvertes

| Espace | URL | État |
| --- | --- | --- |
| Portail ENT (Skolengo CAS) | `cas.ent.auvergnerhonealpes.fr/login*` | ✅ |
| EduConnect | `educonnect.education.gouv.fr` | ✅ |
| PRONOTE — accueil Élèves | `*.index-education.net/pronote` | ✅ |
| PRONOTE — Cahier de textes | Contenus, Travail à faire, Forums | ✅ |
| PRONOTE — Mes données | Compte, Documents | ✅ |
| PRONOTE — Notes | Détail de mes notes, Relevé, Mon bulletin de notes, Bulletin de ma classe, Anciens bulletins | ✅ |
| PRONOTE — Compétences | Mes évaluations, Difficultés et points d'appui, Mon bilan périodique, Bilan périodique de ma classe, Évaluations par compétence, Niveaux de maitrise par matière, Livret de compétences numériques, Anciens bilans | ✅ |

## Fonctionnalités

### Pages de connexion

- **Portail ENT (Skolengo CAS)** : bandeau dégradé avec le logotype Papillon, panneau
  central, mise en page desktop plein écran ; cartes de choix d'établissement (Élève ou
  parent / Enseignant / Accélérateur) arrondies et cliquables sur toute la carte, état de
  sélection en vert Papillon (`#29947A`) ; accordéons et logo Skolengo masqués ou
  neutralisés, icônes `+`/`−` en couleur Papillon.
- **EduConnect** : bannière Papillon pleine largeur, panneau 560px, tabs, champs et
  boutons aux couleurs Papillon, profils Élève / Responsable avec icônes dédiées.

### Espace PRONOTE

- **Accueil Élèves** : bandeau dégradé avec logotype Papillon (logo PRONOTE/établissement
  masqué), menu principal avec icônes **Papicons**, widgets en cartes arrondies avec
  badges, emploi du temps et travail à faire restylés, pied de page épuré.
- **Cahier de textes** : Contenus et Travail à faire, en vue chronologique **et**
  hebdomadaire, plus les Forums.
- **Mes données** : Compte et Documents.
- **Notes** : carte des moyennes (historique SVG) et détail des notes, cartes d'état vide
  pour le relevé et les deux bulletins tant que le document n'est pas publié, arbre des
  anciens bulletins par année et par trimestre, pop-up de dépôt du PDF.
- **Compétences** : cartes des compétences maîtrisées / non maîtrisées, états vides des
  bilans périodiques, grilles Évaluations par compétence et Livret de compétences
  numériques, arbre des anciens bilans.

### Thème

- **Mode sombre** réglable depuis les **paramètres de l'extension** (thème Clair / Sombre),
  appliqué à toutes les pages (connexions + PRONOTE) et rechargé en direct.

## Installation

Aucune étape de build : le dossier est chargé tel quel.

1. Ouvrir `chrome://extensions`
2. Activer le **mode développeur**
3. **Charger l'extension non empaquetée** → sélectionner ce dossier

## Utilisation

- Se rendre sur une des pages couvertes : le thème s'applique automatiquement.
- Pour changer de thème : clic droit sur l'icône de l'extension → **Options**.
- Le restylage est purement visuel et ne modifie pas le comportement des formulaires
  (radios, `wayf.js`, SAML, soumission PRONOTE).

## Structure du projet

```
manifest.json              Manifeste MV3 (content_scripts, options_ui, storage,
                           web_accessible_resources — chaque .css/.js est déclaré en doublon)
content/portal/            Content script + thème de la page ENT (Skolengo CAS)
content/educonnect/        Content script + thème de la page EduConnect
content/pronote/
  accueil/                 Script commun PRONOTE (pronote.css + pronote.js, bootstrap)
    elements/<nom>/        Un dossier .css + .js par widget : header, edt, tav, grades,
                           viescolaire, informations, ressources, deconnexion,
                           devoirsurveille (dossier ASCII `elements`, sans accent)
  Cahier de textes/<page>/ Pages CDT : Contenus, TravailAFaire, Forums
    Vue hebdomadaire/      Vue hebdo de Contenus et de TravailAFaire
  Mes données/<page>/      Compte, Documents
  Notes/<page>/            Mes Notes, relevé, bulletin, bulletinclasse, anciensbulletins
  Compétences/<page>/      mes évaluations, difficultes, monbilanperiodique,
                           bilanperiodiqueclasse, evaluationsparcompetence,
                           niveauxmaitrise, livretnumerique, anciensbilans
                           → un dossier par page, voir CLAUDE.md pour le détail du DOM
options/                   Page d'options (thème Clair / Sombre, stocké dans chrome.storage.sync)
assets/brand/              Assets officiels Papillon (logotype, favicon, splash)
assets/icons/papicons/     Icônes Papicons (SVG, licence MIT) injectées dans PRONOTE
styles/fonts/              Police Inter (woff2 locales)
icons/                     Icônes d'extension
```

## Fonctionnement

- Les content scripts injectent leur CSS et leur branding dans la page, et appliquent la
  classe `papillon-dark` sur `<html>` selon le thème enregistré.
- Le DOM PRONOTE est réécrit à chaque navigation (généré par `eleve.js`) : chaque module de
  page est **idempotent** (garde `data-papillon`, jeton `dataset.pap*` par élément) et
  s'appuie sur un `MutationObserver` double — `document.body` (`childList` + `subtree`) pour
  rejouer `processAll()`, `document.documentElement` (`attributeFilter: ['class']`) pour le
  re-thème.
- Le `<main>` de PRONOTE étant réutilisé d'une page à l'autre, chaque module **dé-classe**
  ses marques hors de sa propre page (`demark()` appelé quand son ancre de fil d'Ariane ne
  matche plus, avec balayage forcé au boot).
- Les icônes Papicons sont chargées via `chrome.runtime.getURL(...)`, mises en cache puis
  injectées **inline** dans un `<span class="papillon-icon">`, avec `fill="currentColor"`.
- Le choix de thème est lu dans `chrome.storage.sync` (`theme` : `light` par défaut, `dark`
  sinon) et appliqué en direct via l'événement `storage.onChanged`.

## Roadmap

- [x] Pages de connexion ENT (Skolengo CAS) et EduConnect.
- [x] PRONOTE — accueil Élèves (bandeau, menu, widgets, emploi du temps, travail à faire).
- [x] PRONOTE — Cahier de textes, Mes données, Notes, Compétences.
- [ ] Contenu publié des documents (relevé, bulletins, bilans, livret) : DOM inconnu tant
      qu'aucune période n'est publiée, à traiter au même titre que les états vides.
- [ ] Élargir aux autres académies / portails Skolengo CAS (`*.ent.auvergnerhonealpes.fr`
      déjà visé).
- [ ] Firefox (voir « a ajouter plus tard/MULTI-NAVIGATEURS.md ») et profils
      Étudiant / Parent / Professeur (voir « a ajouter plus tard/PROFIL-…-prof.md »).

## Crédits et licences

- Les assets graphiques proviennent du dépôt officiel **Papillon** (branche `dev`).
- Les icônes proviennent de **Papicons**
  ([PapillonApp/Papicons](https://github.com/PapillonApp/Papicons), licence **MIT**).
- Ce projet est un fork/restyle personnel, non affilié à Papillon ni à l'académie.

---

[![Architecture diagram of cyprien63/papillon-pronote](https://gitdiagram.com/cyprien63/papillon-pronote/diagram.png)](https://gitdiagram.com/cyprien63/papillon-pronote?utm_source=readme&utm_medium=picture)
