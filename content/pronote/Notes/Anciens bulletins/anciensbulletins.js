/* ============================================================
   PAGE NOTES — « ANCIENS BULLETINS » façon Papillon (JS)
   Cible : page « Notes → Bulletins → Anciens bulletins » PRONOTE,
   repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Anciens bulletins"].

   Contrairement aux trois autres pages Notes (Relevé, Mon bulletin
   de notes, Bulletin de ma classe) qui n'affichent qu'un message
   d'attente, celle-ci affiche une VRAIE LISTE : l'arbre des bulletins
   déjà publiés, groupés par année (parent) puis par trimestre
   (enfants), plus la POP-UP de dépôt du PDF (`.zone-fenetre`).

   Action : poser des classes de marquage idempotentes (côté CSS),
   poser une icône papicon par ligne, révéler le libellé que
   PRONOTE cache en sr-only (titre de la carte) et transformer
   l'éventuel message de liste vide en EmptyItem Papillon. Le
   restyle est porté par anciensbulletins.css ; le thème
   (html.papillon-dark) est géré par pronote.js.

   Ancrages :
   - .pap-ab                 sur le <main> de la page (fond de page via
                             :has() dans anciensbulletins.css).
   - .pap-ab-list            sur le .ObjetListe (la carte).
   - .pap-ab-row[-year|-bulletin] sur chaque ligne de l'arbre.
   - .pap-ab-empty           sur le .liste_messageVide (liste vide).
   - .pap-ab-fenetre         sur la pop-up de dépôt du PDF.
   - .pap-ab-cloud           sur chaque ligne de la liste des clouds.
   - .pap-ab-cloud-hint      sur la phrase « Cliquez sur un cloud… ».

   Aucun comportement natif n'est modifié : recherche, dépliage de
   l'année, ouverture de la pop-up, dépôt du PDF, boutons
   d'enregistrement / PDF du second menu.

   PIÈGE 1 — ancre en égalité stricte sur « Anciens bulletins ».
   Les quatre autres ancres Notes sont « Mon relevé de notes »,
   « Mon bulletin de notes », « Bulletin de ma classe » et la regex
   /^d[ée]tail de mes notes/i : les cinq modules restent mutuellement
   exclusifs. Ne pas élargir l'ancre en regex.

   PIÈGE 2 — `role="treeitem"`, `aria-level` et `aria-selected` sont
   sur le div INTÉRIEUR de la ligne (`.liste_contenu_cellule`), PAS sur
   la ligne elle-même (`.fd_ligne`, qui n'a qu'un `data-colonne`).
   Cibler `.fd_ligne[role="treeitem"]` ne matche donc RIEN : il faut
   descendre dans la ligne pour lire le niveau et la sélection.

   PIÈGE 3 — le <main> de PRONOTE est RÉUTILISÉ entre les pages, et
   #zone_fenetre avec : le module dé-classe ses marques hors de sa
   page (demark) et repose les classes à chaque traitement (les
   classes pap-* peuvent être écrasées si PRONOTE réécrit l'attribut
   class de la ligne, seul le jeton dataset y survit). Balayage forcé
   au boot, car après un rechargement de l'extension les modules
   re-s'exécutent sur un DOM déjà marqué.

   PIÈGE 4 — le troisième menu de cette page est VIDE et masqué par
   PRONOTE (nav#ligne_bandeau en display:none), et la pop-up contient
   un bouton « Voir le document » (ainsi que l'engrenage des options
   PDF) en display:none : cette feuille ne doit surtout pas les
   révéler, sinon une règle !important afficherait un bloc vide.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Anciens bulletins';

  const ICON_CACHE = new Map();
  const ICON_FILES = {
    year: 'papicons/calendar.svg',
    bulletin: 'newspaper.svg',
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
     reste inerte sur les autres pages Notes). */
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
     à anciensbulletins.css de cibler .interface_affV:has(.pap-ab)
     (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main) return;
    addClass(main, 'pap-ab', 'papAb');
  }

  /* La carte : le .ObjetListe de la liste des bulletins. */
  function markList() {
    const list = document.querySelector('main.interface_affV_client.pap-ab .ObjetListe');
    if (!list) return;
    addClass(list, 'pap-ab-list', 'papAbList');
    markTitle(list);
  }

  /* ---------- Titre de carte ----------
     Sur cette page, PRONOTE n'affiche AUCUN titre : le libellé
     « Anciens bulletins » est un <span class="sr-only" id="…_labelListe">
     posé en fin de liste, uniquement référencé par l'aria-labelledby
     de la grille. On l'injecte donc en copie visible dans
     .liste_btnentete (le sr-only reste en place pour l'accessibilité).
     Si une version de PRONOTE expose déjà un .liste_enteteTxt, on
     s'abstient pour ne pas afficher deux titres. */
  function listTitle(list) {
    /* Si PRONOTE expose déjà un titre visible, on s'abstient (pas de
       doublon) — c'est le cas des anciennes versions de la page. */
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

    let el = entete.querySelector('.pap-ab-title');
    if (!el) {
      el = document.createElement('span');
      el.className = 'pap-ab-title';
      el.textContent = titre;
      entete.insertBefore(el, entete.firstChild);
    } else if (el.textContent !== titre) {
      /* ⚠ Écriture UNIQUEMENT si le texte diffère : l'observateur
         body (childList) se redéclencherait sinon sur chaque passage,
         ce qui boucle à l'infini et gèle l'onglet. */
      el.textContent = titre;
    }
  }

  /* Compteur « N bulletins » à côté du titre. */
  function markCount() {
    const list = document.querySelector('main.interface_affV_client.pap-ab .ObjetListe');
    if (!list || !list.querySelector('.pap-ab-title')) return;
    const n = list.querySelectorAll('.pap-ab-row-bulletin').length;
    let el = list.querySelector('.pap-ab-count');
    if (!n) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.className = 'pap-ab-count';
      el.setAttribute('aria-hidden', 'true');
      list.querySelector('.pap-ab-title').after(el);
    }
    const txt = n > 1 ? `${n} bulletins` : '1 bulletin';
    if (el.textContent !== txt) el.textContent = txt; /* cf. plus haut */
  }

  /* Une ligne = une année (aria-level=1, avec le chevron de dépliage)
     ou un bulletin de trimestre (aria-level=2, .zone-deploiement vide
     avec .indentation-fils-1). Le libellé reste celui de PRONOTE ; on
     n'ajoute qu'une icône en tête de ligne et une pastille de
     trimestre à droite. */
  function processRow(row) {
    const item = row.querySelector('[role="treeitem"]');
    const titre = row.querySelector('.titre-principale, .titre-principal');
    const texte = (titre ? titre.textContent : row.textContent) || '';
    const annee =
      (item && item.getAttribute('aria-level') === '1') || /^\s*Ann[ée]e\b/i.test(texte);

    addClass(row, 'pap-ab-row', 'papAbRow');
    row.classList.toggle('pap-ab-row-year', annee);
    row.classList.toggle('pap-ab-row-bulletin', !annee);
    if (annee) row.dataset.papAbYear = '1';
    else delete row.dataset.papAbYear;

    const ligne = row.querySelector('.liste_contenu_ligne');
    if (!ligne) return;

    /* Pastille de trimestre : « Trimestre 2 » → « T2 ». Purement
       décoratif (aria-hidden), le libellé complet reste celui de
       PRONOTE — on ne modifie jamais son texte. */
    const trim = texte.match(/trimestre\s*(\d+)/i);
    let pastille = ligne.querySelector('.pap-ab-trim');
    if (trim) {
      if (!pastille) {
        pastille = document.createElement('span');
        pastille.className = 'pap-ab-trim';
        pastille.setAttribute('aria-hidden', 'true');
        ligne.appendChild(pastille);
      }
      const txt = `T${trim[1]}`;
      if (pastille.textContent !== txt) pastille.textContent = txt; /* cf. plus haut */
    } else if (pastille) {
      pastille.remove();
    }

    if (row.querySelector('.pap-ab-icon')) return;
    const ico = icon(annee ? 'year' : 'bulletin');
    if (!ico) return;
    const span = svgWrap(ico, annee ? 'calendar' : 'newspaper');
    span.className = 'pap-ab-icon papillon-icon';
    ligne.prepend(span);
  }

  function processRows() {
    const rows = document.querySelectorAll(
      'main.interface_affV_client.pap-ab .ObjetListe .liste_content_lignes > .fd_ligne'
    );
    rows.forEach(processRow);
  }

  /* Liste vide (« Aucun bulletin » et assimilés) : PRONOTE écrit le
     message sous forme de texte nu dans .liste_messageVide → on
     l'encadre en carte pointillée (EmptyItem Papillon). */
  function processEmpty() {
    const empty = document.querySelector('main.interface_affV_client.pap-ab .liste_messageVide');
    if (!empty || isHidden(empty)) return;
    addClass(empty, 'pap-ab-empty', 'papAbEmpty');
    const ico = icon('ghost');
    if (ico && !empty.querySelector('.pap-ab-empty-icon')) {
      const span = svgWrap(ico, 'ghost');
      span.className = 'pap-ab-empty-icon papillon-icon';
      empty.prepend(span);
    }
  }

  /* ---------- POP-UP de dépôt du PDF ----------
     Rendue par PRONOTE dans #zone_fenetre (donc hors du <main>), à
     l'ouverture d'un bulletin. On la marque par sa classe racine
     (.ObjetFenetre_SelectionClouds_racine), jamais par un id. Les
     logos des clouds (div.Image_Icone_Logo…) sont natifs : on n'y
     touche pas. */
  function markFenetre() {
    document.querySelectorAll('.ObjetFenetre_Espace.ObjetFenetre_SelectionClouds_racine').forEach((win) => {
      addClass(win, 'pap-ab-fenetre', 'papAbFenetre');

      /* Liste des clouds (Digiposte, Dropbox, One Drive) */
      win.querySelectorAll('.liste_content_lignes > .fd_ligne').forEach((row) => {
        addClass(row, 'pap-ab-cloud', 'papAbCloud');
      });

      /* Phrase d'invite « Cliquez sur un cloud pour y déposer le PDF. »
         → on la marque pour la styler en texte doux. */
      const hint = win.querySelector('.GrandEspaceHaut.EspaceBas');
      if (hint && !isHidden(hint)) addClass(hint, 'pap-ab-cloud-hint', 'papAbCloudHint');
    });
  }

  /* Hors de la page : on retire TOUTES nos marques, où qu'elles
     soient — le <main> et #zone_fenetre sont tous deux réutilisés
     d'une page à l'autre. On cible nos propres classes pap-ab-* (et
     rien d'autre), pour ne jamais toucher aux marques d'un autre
     module. Le drapeau évite de reparcourir le DOM sur toutes les
     pages Notes, sauf au boot où le balayage est forcé. */
  let marked = false;

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    unmark(document.querySelector('main.interface_affV_client'), 'pap-ab', 'papAb');

    document.querySelectorAll('.pap-ab-list').forEach((el) => {
      unmark(el, 'pap-ab-list', 'papAbList');
    });

    document.querySelectorAll('.pap-ab-row').forEach((row) => {
      row.classList.remove('pap-ab-row', 'pap-ab-row-year', 'pap-ab-row-bulletin');
      delete row.dataset.papAbRow;
      delete row.dataset.papAbYear;
    });

    document.querySelectorAll('.pap-ab-empty').forEach((empty) => {
      unmark(empty, 'pap-ab-empty', 'papAbEmpty');
    });

    document.querySelectorAll('.pap-ab-fenetre').forEach((win) => {
      unmark(win, 'pap-ab-fenetre', 'papAbFenetre');
    });

    document.querySelectorAll('.pap-ab-cloud').forEach((row) => {
      unmark(row, 'pap-ab-cloud', 'papAbCloud');
    });

    document.querySelectorAll('.pap-ab-cloud-hint').forEach((hint) => {
      unmark(hint, 'pap-ab-cloud-hint', 'papAbCloudHint');
    });

    /* Les noeuds injectés (titre, compteur, icônes, pastilles de
       trimestre) sont créés par ce module : on les retire, sans quoi
       ils survivraient, orphelins et figés, au re-rendu de PRONOTE. */
    document
      .querySelectorAll(
        '.pap-ab-icon, .pap-ab-empty-icon, .pap-ab-title, .pap-ab-count, .pap-ab-trim'
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
    markFenetre();
  }

  /* PRONOTE reconstruit le fil d'Ariane à chaque navigation, mais peut
     aussi en changer l'aria-label EN PLACE : l'observateur sur body
     (childList) ne voit alors pas le changement et nos marques
     survivraient à un changement de page. On surveille donc le
     <h1> lui-même, et on ré-attache l'observateur quand PRONOTE le
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
         année, ouverture/fermeture de la pop-up, navigation) */
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
