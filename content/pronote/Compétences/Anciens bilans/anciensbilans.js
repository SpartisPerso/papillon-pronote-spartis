/* ============================================================
   PAGE COMPÉTENCES — « ANCIENS BILANS » façon Papillon (JS)
   Cible : page « Compétences → Anciens bilans » PRONOTE, repérée
   par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Anciens bilans"].

   ⚠ NE PAS CONFONDRE avec « Notes → Bulletins → Anciens bulletins »
   (modules anciensbulletins.js / .pap-ab-*). Les deux pages se
   ressemblent (même famille de listes PRONOTE) mais vivent dans
   deux rubriques différentes et portent des jetons distincts :
   ici .pap-anb, là-bas .pap-ab. Comme un sélecteur de classe
   matche un JETON ENTIER, `.pap-ab` ne matche jamais `pap-anb`
   (et l'inverse non plus) : les deux feuilles ne se contaminent
   pas. Ne jamais « raccourcir » pap-anb en pap-ab.

   Cette page affiche une VRAIE LISTE : l'arbre des bilans
   périodiques déjà publiés, groupés par année (parent, niveau 1,
   avec chevron de dépliage) puis par trimestre (enfants, niveau 2,
   feuilles). Chaque trimestre porte un aria-label="Générer le PDF".

   Action : poser des classes de marquage idempotentes (côté CSS),
   poser une icône papicon par ligne, révéler le libellé que
   PRONOTE cache en sr-only (titre de la carte) et poser un
   compteur. Le restyle est porté par anciensbilans.css ; le thème
   (html.papillon-dark) est géré par pronote.js.

   Ancrages :
   - .pap-anb                sur le <main> de la page.
   - .pap-anb-list           sur le .ObjetListe (la carte).
   - .pap-anb-row[-year|-bilan] sur chaque ligne de l'arbre.
   - .pap-anb-empty          sur le .liste_messageVide (liste vide).

   Aucun comportement natif n'est modifié : recherche, dépliage de
   l'année, sélection d'un trimestre, génération du PDF et boutons
   du second menu.

   PIÈGE 1 — ancre en égalité stricte sur « Anciens bilans ». Les
   douze autres ancres (5 Notes + mes évaluations + difficultés +
   mon bilan périodique + bilan de ma classe + évaluations par
   compétence + niveaux de maitrise + livret numérique + anciens
   bulletins) restent mutuellement exclusives. Ne pas élargir
   l'ancre en regex ni en préfixe : « Anciens bilans » vs
   « Anciens bulletins » ne se recoupent pas, mais un préfixe
   commun « Ancien… » les ferait toutes les deux se marquer.

   PIÈGE 2 — `role="treeitem"`, `aria-level`, `aria-expanded` et
   `aria-selected` sont sur le div INTÉRIEUR de la ligne
   (`.liste_contenu_cellule`), PAS sur la ligne elle-même
   (`.fd_ligne`, qui ne porte qu'un `data-colonne`). Cibler
   `.fd_ligne[role="treeitem"]` ne matche donc RIEN : il faut
   descendre dans la ligne pour lire le niveau et la sélection.

   PIÈGE 3 — le <main> de PRONOTE est RÉUTILISÉ entre les pages :
   le module dé-classe ses marques hors de sa page (demark) et
   repose les classes à chaque traitement (les classes pap-* peuvent
   être écrasées si PRONOTE réécrit l'attribut class de la ligne,
   seul le jeton dataset y survit). Balayage forcé au boot, car
   après un rechargement de l'extension les modules re-s'exécutent
   sur un DOM déjà marqué.

   PIÈGE 4 — le troisième menu de cette page est VIDE et masqué par
   PRONOTE (nav#ligne_bandeau en display:none, sans aucun enfant) :
   cette feuille ne doit surtout pas le révéler, sinon une règle
   !important afficherait une bande blanche vide sous le second
   menu. header.css:260 (nav…:not(:has(*))) couvre déjà ce cas.

   PIÈGE 5 — PRONOTE fige des dimensions en inline sur TOUTE la
   chaîne (max-width:45rem sur le wrapper, width:450px sur
   .liste_btnentete et .liste_zone, width:433px sur la grille,
   width:432px sur .liste_contenu_cellule_contenu, height:847px
   sur le viewport #…_Zone_1) : les remplacer par des largeurs
   fluides + max-height, sinon la carte reste étroite et la liste
   déborde sous le bas de l'écran.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Anciens bilans';

  const ICON_CACHE = new Map();
  const ICON_FILES = {
    year: 'papicons/calendar.svg',
    bilan: 'graduation-hat.svg',
    ghost: 'papicons/ghost.svg',
  };

  function icon(name) {
    return ICON_CACHE.get(name) || null;
  }

  async function loadIcon(name) {
    const file = ICON_FILES[name];
    if (!file || ICON_CACHE.has(name)) return;
    try {
      const url = chrome.runtime.getURL(`assets/icons/${file}`);
      const res = await fetch(url);
      const text = await res.text();
      ICON_CACHE.set(name, text.replace(/fill="black"/g, 'fill="currentColor"'));
    } catch (e) {
      /* ignore — l'icône est optionnelle */
    }
  }

  function svgWrap(inner, component) {
    const span = document.createElement('span');
    span.className = 'papillon-icon';
    span.dataset.papicon = component;
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = inner;
    return span;
  }

  /* Ancre de page : sans elle, on ne pose AUCUNE classe (le module
     reste inerte sur les autres pages Compétences et Notes). */
  function onPage() {
    const bc = document.getElementById('breadcrumbBandeau');
    return !!bc && bc.getAttribute('aria-label') === PAGE_LABEL;
  }

  /* PRONOTE masque certaines zones avec un display:none en ligne :
     on ne les stylise jamais, sinon une règle !important révélerait
     un bloc vide. */
  function isHidden(el) {
    if (!el || el.hidden) return true;
    if (el.style && el.style.display === 'none') return true;
    try {
      return getComputedStyle(el).display === 'none';
    } catch (e) {
      return false;
    }
  }

  function addClass(el, cls, token) {
    if (!el || el.classList.contains(cls)) return;
    el.classList.add(cls);
    el.dataset[token] = '1';
  }

  function unmark(el, cls, token) {
    if (!el) return;
    el.classList.remove(cls);
    delete el.dataset[token];
  }

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à anciensbilans.css de cibler .interface_affV:has(.pap-anb)
     (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main) return;
    addClass(main, 'pap-anb', 'papAnb');
  }

  /* La carte : le .ObjetListe de la liste des bilans. */
  function markList() {
    const list = document.querySelector('main.interface_affV_client.pap-anb .ObjetListe');
    if (!list) return;
    addClass(list, 'pap-anb-list', 'papAnbList');
    markTitle(list);
  }

  /* ---------- Titre de carte ----------
     Sur cette page, PRONOTE n'affiche AUCUN titre : le libellé
     « Anciens bilans » est un <span class="sr-only" id="…_labelListe">
     posé en fin de liste, uniquement référencé par l'aria-labelledby
     de la grille role="tree". On l'injecte donc en copie visible dans
     .liste_btnentete (le sr-only reste en place pour l'accessibilité).
     Si une version de PRONOTE expose déjà un .liste_enteteTxt, on
     s'abstient pour ne pas afficher deux titres. */
  function listTitle(list) {
    const natif = list.querySelector('.liste_enteteTxt');
    if (natif && natif.textContent.trim()) return null;
    const sr = list.querySelector('[id$="_labelListe"]');
    if (sr && sr.textContent.trim()) return sr.textContent.trim();
    const grid = list.querySelector('[aria-labelledby]');
    const by = grid && grid.getAttribute('aria-labelledby');
    const ref = by && list.querySelector(`[id="${by}"]`);
    if (ref && ref.textContent.trim()) return ref.textContent.trim();
    return PAGE_LABEL;
  }

  function markTitle(list) {
    const entete = list.querySelector('.liste_btnentete');
    if (!entete) return;
    const titre = listTitle(list);
    if (!titre) return; /* PRONOTE fournit déjà un titre visible */

    let el = entete.querySelector('.pap-anb-title');
    if (!el) {
      el = document.createElement('span');
      el.className = 'pap-anb-title';
      el.textContent = titre;
      entete.insertBefore(el, entete.firstChild);
    } else if (el.textContent !== titre) {
      /* ⚠ Écriture UNIQUEMENT si le texte diffère : l'observateur
         body (childList) se redéclencherait sinon sur chaque passage,
         ce qui boucle à l'infini et gèle l'onglet. */
      el.textContent = titre;
    }
  }

  /* Compteur « N bilans » à côté du titre (un bilan par trimestre). */
  function markCount() {
    const list = document.querySelector('main.interface_affV_client.pap-anb .ObjetListe');
    if (!list || !list.querySelector('.pap-anb-title')) return;
    const n = list.querySelectorAll('.pap-anb-row-bilan').length;
    let el = list.querySelector('.pap-anb-count');
    if (!n) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.className = 'pap-anb-count';
      el.setAttribute('aria-hidden', 'true');
      list.querySelector('.pap-anb-title').after(el);
    }
    const txt = n > 1 ? `${n} bilans` : '1 bilan';
    if (el.textContent !== txt) el.textContent = txt; /* cf. plus haut */
  }

  /* Une ligne = une année (aria-level=1, avec le chevron de dépliage)
     ou un bilan de trimestre (aria-level=2, .zone-deploiement vide
     avec .indentation-fils-1). Le libellé reste celui de PRONOTE ; on
     n'ajoute qu'une icône en tête de ligne et une pastille de
     trimestre à droite. */
  function processRow(row) {
    const item = row.querySelector('[role="treeitem"]');
    const titre = row.querySelector('.titre-principal, .titre-principale');
    const texte = (titre ? titre.textContent : row.textContent) || '';
    const annee =
      (item && item.getAttribute('aria-level') === '1') || /^\s*Ann[ée]e\b/i.test(texte);

    addClass(row, 'pap-anb-row', 'papAnbRow');
    row.classList.toggle('pap-anb-row-year', annee);
    row.classList.toggle('pap-anb-row-bilan', !annee);
    if (annee) row.dataset.papAnbYear = '1';
    else delete row.dataset.papAnbYear;

    const ligne = row.querySelector('.liste_contenu_ligne');
    if (!ligne) return;

    /* Pastille de trimestre : « Trimestre 2 » → « T2 ». Purement
       décoratif (aria-hidden), le libellé complet reste celui de
       PRONOTE — on ne modifie jamais son texte. */
    const trim = texte.match(/trimestre\s*(\d+)/i);
    let pastille = ligne.querySelector('.pap-anb-trim');
    if (trim) {
      if (!pastille) {
        pastille = document.createElement('span');
        pastille.className = 'pap-anb-trim';
        pastille.setAttribute('aria-hidden', 'true');
        ligne.appendChild(pastille);
      }
      const txt = `T${trim[1]}`;
      if (pastille.textContent !== txt) pastille.textContent = txt; /* cf. plus haut */
    } else if (pastille) {
      pastille.remove();
    }

    if (row.querySelector('.pap-anb-icon')) return;
    const ico = icon(annee ? 'year' : 'bilan');
    if (!ico) return;
    const span = svgWrap(ico, annee ? 'calendar' : 'graduation-hat');
    span.className = 'pap-anb-icon papillon-icon';
    ligne.prepend(span);
  }

  function processRows() {
    const rows = document.querySelectorAll(
      'main.interface_affV_client.pap-anb .ObjetListe .liste_content_lignes > .fd_ligne'
    );
    rows.forEach(processRow);
  }

  /* Liste vide : PRONOTE écrit le message sous forme de texte nu dans
     .liste_messageVide → on l'encadre en carte pointillée centrée
     (EmptyItem Papillon). Non observé sur le DOM fourni (l'arbre
     compte au moins une année), mais c'est le composant de liste
     natif : même recette que les pages Notes / Compétences voisines. */
  function processEmpty() {
    const empty = document.querySelector('main.interface_affV_client.pap-anb .liste_messageVide');
    if (!empty || isHidden(empty)) return;
    addClass(empty, 'pap-anb-empty', 'papAnbEmpty');
    const ico = icon('ghost');
    if (ico && !empty.querySelector('.pap-anb-empty-icon')) {
      const span = svgWrap(ico, 'ghost');
      span.className = 'pap-anb-empty-icon papillon-icon';
      empty.prepend(span);
    }
  }

  /* Hors de la page : on retire TOUTES nos marques, où qu'elles
     soient — le <main> est réutilisé d'une page à l'autre. On cible
     nos propres classes pap-anb-* (et rien d'autre), pour ne jamais
     toucher aux marques d'un autre module. Le drapeau évite de
     reparcourir le DOM à chaque mutation, sauf au boot où le balayage
     est forcé. */
  let marked = false;

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    unmark(document.querySelector('main.interface_affV_client'), 'pap-anb', 'papAnb');

    document.querySelectorAll('.pap-anb-list').forEach((el) => {
      unmark(el, 'pap-anb-list', 'papAnbList');
    });

    document.querySelectorAll('.pap-anb-row').forEach((row) => {
      row.classList.remove('pap-anb-row', 'pap-anb-row-year', 'pap-anb-row-bilan');
      delete row.dataset.papAnbRow;
      delete row.dataset.papAnbYear;
    });

    document.querySelectorAll('.pap-anb-empty').forEach((empty) => {
      unmark(empty, 'pap-anb-empty', 'papAnbEmpty');
    });

    /* Les noeuds injectés (titre, compteur, icônes, pastilles de
       trimestre) sont créés par ce module : on les retire, sans quoi
       ils survivraient, orphelins et figés, au re-rendu de PRONOTE. */
    document
      .querySelectorAll(
        '.pap-anb-icon, .pap-anb-empty-icon, .pap-anb-title, .pap-anb-count, .pap-anb-trim'
      )
      .forEach((node) => node.remove());
  }

  function processAll(force) {
    watchBreadcrumb();
    if (!onPage()) {
      demark(force);
      return;
    }
    marked = true;
    markPage();
    markList();
    processRows();
    markCount();
    processEmpty();
  }

  /* PRONOTE reconstruit le fil d'Ariane à chaque navigation, mais peut
     aussi en changer l'aria-label EN PLACE : l'observateur sur body
     (childList) ne voit alors pas le changement et nos marques
     survivraient à un changement de page. On surveille donc le <h1>
     lui-même, et on ré-attache l'observateur quand PRONOTE le
     remplace (le nœud n'est jamais le même d'une page à l'autre). */
  let observedBc = null;
  let bcObserver = null;

  function watchBreadcrumb() {
    const bc = document.getElementById('breadcrumbBandeau');
    if (bc === observedBc) return;
    if (bcObserver) bcObserver.disconnect();
    observedBc = bc;
    if (!bc) return;
    bcObserver = new MutationObserver(() => processAll());
    bcObserver.observe(bc, { attributes: true, attributeFilter: ['aria-label'] });
  }

  function init() {
    Promise.all(Object.keys(ICON_FILES).map((k) => loadIcon(k))).then(() => {
      /* Balayage initial forcé : le <main> peut déjà porter un résidu */
      processAll(true);

      /* Recapter les re-rendus de PRONOTE (recherche, dépliage d'une
         année, sélection d'un trimestre, navigation) */
      new MutationObserver(() => processAll())
        .observe(document.body, { childList: true, subtree: true });

      /* Re-traiter si le thème change (reprocess idempotent) */
      new MutationObserver(() => processAll())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
