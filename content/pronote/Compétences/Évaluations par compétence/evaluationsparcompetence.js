/* ============================================================
   PAGE COMPÉTENCES — « ÉVALUATIONS PAR COMPÉTENCE » façon Papillon (JS)
   Cible : page « Compétences → Bilan par domaine → Évaluations par
   compétence » PRONOTE, repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Évaluations par compétence"].

   Action : poser des classes de marquage idempotentes (côté CSS)
   sur la grille Items / Niveau / Validé le et injecter dans
   .liste_btnentete le titre de la carte (« Évaluations par
   compétence », qui vit ici dans un <span class="sr-only"
   id="…_labelListe">), un compteur du nombre d'éléments et une
   pastille de compétence (lue dans le sélecteur du troisième menu).
   Le restyle est porté par evaluationsparcompetence.css ; le thème
   (html.papillon-dark) est géré par pronote.js.

   Ancrages :
   - .pap-bpd          sur le <main> de la page (fond de page via
                       :has() dans evaluationsparcompetence.css).
   - .pap-bpd-list     sur le .ObjetListe — la carte.
   - .pap-bpd-title / .pap-bpd-count / .pap-bpd-comp : titre,
                       compteur et pastille de compétence injectés
                       par ce module (retirés en demark()).
   - .pap-bpd-cell / .pap-bpd-domaine / .pap-bpd-item sur chaque
                       cellule de la grille. ⚠ Ici la « ligne » n'est
                       PAS un élément : chaque ligne est un groupe de
                       TROIS .liste_celluleGrid adjacents (une par
                       colonne Items / Niveau / Validé le). Le domaine
                       (ligne en gras, dépliable) est repéré par la
                       présence du petit cylindre de dépliage
                       (.liste_contenu_cellule_deploiement) dans sa
                       première cellule.

   Aucun comportement natif n'est modifié : recherche, tout
   réduire/déplier, dépliage d'un domaine, choix de la compétence /
   de l'évaluation, checkbox « Uniquement les éléments avec
   évaluations », sélection d'une ligne et navigation restent ceux
   de PRONOTE.

   PIÈGE 1 — l'ancre est une égalité STRICTE sur « Évaluations par
   compétence ». Ne pas l'élargir en regex ni en préfixe : la page
   voisine « Mes évaluations » est ancrée sur « Détail de mes
   évaluations » (regex dans mesevaluations.js) — les deux ancres
   doivent rester mutuellement exclusives. De même, ne pas confondre
   les jetons .pap-bpd-* avec .pap-ev-* ni .pap-dp-*.

   PIÈGE 2 — le <main> de PRONOTE est RÉUTILISÉ d'une page à
   l'autre : demark() retire nos marques hors de la page, avec un
   balayage forcé au boot (après un rechargement de l'extension, les
   modules re-s'exécutent sur un DOM déjà marqué).

   PIÈGE 3 — ne JAMAIS réécrire le textContent d'un nœud injecté à
   chaque processAll() : on ne l'écrit que si le texte diffère,
   sinon l'observateur body (childList) boucle à l'infini et gèle
   l'onglet.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Évaluations par compétence';

  const ICON_CACHE = new Map();
  const ICON_FILES = {
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
    span.innerHTML = inner;
    return span;
  }

  /* Ancre de page : sans elle, on ne pose AUCUNE classe (le module
     reste inerte sur « Mes évaluations », « Difficultés et points
     d'appui », les bilans et les pages Notes). */
  function onPage() {
    const bc = document.getElementById('breadcrumbBandeau');
    return !!bc && bc.getAttribute('aria-label') === PAGE_LABEL;
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

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à evaluationsparcompetence.css de cibler .interface_affV:has(.pap-bpd)
     (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main) return;
    addClass(main, 'pap-bpd', 'papBpd');
  }

  /* La carte : le .ObjetListe de la grille. */
  function markList() {
    const list = document.querySelector('main.interface_affV_client.pap-bpd .ObjetListe');
    if (!list) return;
    addClass(list, 'pap-bpd-list', 'papBpdList');
    markTitle(list);
    markCompetence(list);
  }

  /* ---------- Titre de carte ----------
     PRONOTE n'affiche AUCUN titre sur cette page : le libellé
     « Évaluations par compétence » est un <span class="sr-only"
     id="…_labelListe"> posé en fin de liste, uniquement référencé
     par l'aria-labelledby de la grille. On l'injecte en copie
     visible dans .liste_btnentete (le sr-only reste en place pour
     l'accessibilité). Si PRONOTE expose déjà un titre, on s'abstient
     pour ne pas afficher deux titres. */
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

    let el = entete.querySelector('.pap-bpd-title');
    if (!el) {
      el = document.createElement('span');
      el.className = 'pap-bpd-title';
      el.textContent = titre;
      entete.insertBefore(el, entete.firstChild);
    } else if (el.textContent !== titre) {
      /* ⚠ Écriture UNIQUEMENT si le texte diffère (cf. PIÈGE 3) */
      el.textContent = titre;
    }

    markCount(list);
  }

  /* Compteur « 16 éléments » à côté du titre : le nombre d'items
     est le nombre de CELLULES de la colonne « Items » (chaque ligne
     compte 3 cellules adjacentes, une par colonne). */
  function markCount(list) {
    if (!list.querySelector('.pap-bpd-title')) return;
    const n = list.querySelectorAll(
      '.liste_content_lignes > .liste_celluleGrid[data-colonne="0"]'
    ).length;
    let el = list.querySelector('.pap-bpd-count');
    if (!n) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.className = 'pap-bpd-count';
      el.setAttribute('aria-hidden', 'true');
      list.querySelector('.pap-bpd-title').after(el);
    }
    const txt = n > 1 ? `${n} éléments` : '1 élément';
    if (el.textContent !== txt) el.textContent = txt; /* cf. PIÈGE 3 */
  }

  /* Pastille de compétence : libellé du sélecteur du troisième menu
     (« Sélectionnez une compétence »), normalisé (espaces
     insécables → espaces simples). Affichée sous le titre, sans
     jamais modifier le libellé natif. */
  function markCompetence(list) {
    const entete = list.querySelector('.liste_btnentete');
    const ref = list.querySelector('.pap-bpd-count');
    if (!entete || !ref) return;

    const combo = document.querySelector(
      'nav#ligne_bandeau [aria-label="Sélectionnez une compétence"]'
    );
    const lib = combo ? combo.querySelector('.ocb-libelle') : null;
    const raw = (lib ? lib.textContent : combo ? combo.textContent : '') || '';
    const label = raw.replace(/\s+/g, ' ').trim();
    if (!label) return;

    let el = entete.querySelector('.pap-bpd-comp');
    if (!el) {
      el = document.createElement('span');
      el.className = 'pap-bpd-comp';
      el.setAttribute('aria-hidden', 'true');
      ref.after(el);
    }
    if (el.textContent !== label) el.textContent = label; /* cf. PIÈGE 3 */
  }

  /* ---------- Cellules de la grille ----------
     La grille liste chaque ligne sous forme de cellules ADJACENTES
     (.liste_celluleGrid, une colonne chacune : Items puis Niveau puis
     Validé le, repérées par data-colonne="0|1|2"). Une « ligne » est
     donc le GROUPE de cellules consécutives dont la colonne croît
     depuis 0 — PRONOTE fige l'ordre des colonnes en inline
     (grid-column:1|2|3), on s'appuie donc sur data-colonne pour
     grouper. Le domaine (ligne en gras, dépliable) est repéré par le
     cylindre de dépliage dans sa PREMIÈRE cellule ; on marque alors
     TOUTES les cellules du groupe (même teinte pleine largeur côté
     CSS), jamais seulement la première. */
  function tagCell(cell, isDomain) {
    addClass(cell, 'pap-bpd-cell', 'papBpdCell');
    cell.classList.toggle('pap-bpd-domaine', isDomain);
    cell.classList.toggle('pap-bpd-item', !isDomain);
    if (isDomain) cell.dataset.papBpdDomaine = '1';
    else delete cell.dataset.papBpdDomaine;

    /* Niveau / Validé le vides : PRONOTE laisse un &nbsp; (texte
       invisible). On marque la cellule pour afficher un tiret doux
       côté CSS, sinon la case semble « vide de tout ». */
    const ligne = cell.querySelector('.liste_contenu_ligne');
    const blank = !ligne || ligne.textContent.trim() === '';
    cell.classList.toggle('pap-bpd-cell-vide', blank);
    if (blank) cell.dataset.papBpdVide = '1';
    else delete cell.dataset.papBpdVide;
  }

  function processCells() {
    const cells = Array.prototype.slice.call(
      document.querySelectorAll(
        'main.interface_affV_client.pap-bpd .pap-bpd-list .liste_content_lignes > .liste_celluleGrid'
      )
    );
    let i = 0;
    while (i < cells.length) {
      const first = cells[i];
      const serie = [first];
      let col = 1;
      while (
        i + col < cells.length &&
        cells[i + col].getAttribute('data-colonne') === String(col)
      ) {
        serie.push(cells[i + col]);
        col += 1;
      }
      const isDomain = !!first.querySelector('.liste_contenu_cellule_deploiement');
      serie.forEach((cell) => tagCell(cell, isDomain));
      i += serie.length;
    }
  }

  /* Colonnes Niveau / Validé le entièrement vides → repli.
     Si AUCUNE cellule d'une colonne (data-colonne 1 ou 2) ne porte de
     texte, la colonne ne sert à rien : on la retire entièrement (ligne
     « Items » pleine largeur seul, plus de rangée de cases vides à
     droite). Posé sur .pap-bpd-list → côté CSS (pap-bpd-no-niveau /
     pap-bpd-no-valide) : la grille repasse à 2 puis 1 colonne, les
     cellules concernées reçoivent display:none. */
  function processCols() {
    const list = document.querySelector(
      'main.interface_affV_client.pap-bpd .pap-bpd-list'
    );
    if (!list) return;
    const emptyCol = (col) => {
      const cells = Array.prototype.slice.call(
        list.querySelectorAll(
          `.liste_content_lignes > .liste_celluleGrid[data-colonne="${col}"]`
        )
      );
      return (
        cells.length > 0 &&
        cells.every((c) => c.classList.contains('pap-bpd-cell-vide'))
      );
    };
    list.classList.toggle('pap-bpd-no-niveau', emptyCol('1'));
    list.classList.toggle('pap-bpd-no-valide', emptyCol('2'));
  }

  /* Alignement en-tête / lignes : le viewport (#…_Zone_1) est un
     conteneur défilant qui réserve la largeur de sa barre de
     défilement ; l'en-tête (sœur, non défilante) est donc ~10px plus
     large et ses colonnes se décalent. On mesure la largeur de barre
     réelle et on la facture à l'en-tête via --pap-bpd-sb
     (padding-right sur .liste-titre-contenu, cf. CSS) :
     les colonnes se calent pile les unes sous les autres, quel que
     soit l'OS / thème / zoom. */
  let sbMeasured = 0;

  function measureScrollbar(list) {
    if (!list) return;
    if (sbMeasured > 0) {
      if (list.style.getPropertyValue('--pap-bpd-sb') !== `${sbMeasured}px`) {
        list.style.setProperty('--pap-bpd-sb', `${sbMeasured}px`);
      }
      return;
    }
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:absolute;top:-9999px;left:-9999px;width:50px;height:50px;' +
      'overflow-y:scroll;pointer-events:none;';
    document.body.appendChild(probe);
    sbMeasured = 50 - probe.clientWidth;
    document.body.removeChild(probe);
    list.style.setProperty('--pap-bpd-sb', `${sbMeasured}px`);
  }

  /* Liste vide (« Aucun élément » et assimilés sur une compétence
     sans item) : PRONOTE écrit le message sous forme de texte nu
     dans .liste_messageVide → on l'encadre en carte pointillée. */
  function processEmpty() {
    const main = document.querySelector('main.interface_affV_client.pap-bpd');
    if (!main) return;
    const empty = main.querySelector('.pap-bpd-list .liste_messageVide');
    if (!empty || isHidden(empty)) return;
    addClass(empty, 'pap-bpd-empty', 'papBpdEmpty');
    const ico = icon('ghost');
    if (ico && !empty.querySelector('.pap-bpd-empty-icon')) {
      const span = svgWrap(ico, 'ghost');
      span.className = 'pap-bpd-empty-icon papillon-icon';
      empty.prepend(span);
    }
  }

  /* Hors de la page : on retire TOUTES nos marques du <main> partagé
     et les nœuds injectés, sinon ils survivent à la navigation. Le
     drapeau évite de reparcourir le DOM sur chaque mutation, sauf au
     boot où le balayage est forcé. */
  let marked = false;

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    unmark(document.querySelector('main.interface_affV_client'), 'pap-bpd', 'papBpd');

    document.querySelectorAll('.pap-bpd-list').forEach((el) => {
      unmark(el, 'pap-bpd-list', 'papBpdList');
      el.classList.remove('pap-bpd-no-niveau', 'pap-bpd-no-valide');
    });

    document.querySelectorAll('.pap-bpd-cell').forEach((cell) => {
      cell.classList.remove('pap-bpd-cell', 'pap-bpd-domaine', 'pap-bpd-item', 'pap-bpd-cell-vide');
      delete cell.dataset.papBpdCell;
      delete cell.dataset.papBpdDomaine;
      delete cell.dataset.papBpdVide;
    });

    document.querySelectorAll('.pap-bpd-empty').forEach((empty) => {
      unmark(empty, 'pap-bpd-empty', 'papBpdEmpty');
    });

    document
      .querySelectorAll('.pap-bpd-title, .pap-bpd-count, .pap-bpd-comp, .pap-bpd-empty-icon')
      .forEach((node) => node.remove());
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

  function processAll(force) {
    watchBreadcrumb();
    if (!onPage()) {
      demark(force);
      return;
    }
    marked = true;
    markPage();
    markList();
    processCells();
    processCols();
    measureScrollbar(
      document.querySelector('main.interface_affV_client.pap-bpd .pap-bpd-list')
    );
    processEmpty();
  }

  function init() {
    Promise.all(Object.keys(ICON_FILES).map((k) => loadIcon(k))).then(() => {
      /* Balayage initial forcé : le <main> peut déjà porter un résidu */
      processAll(true);

      /* Recapter les re-rendus de PRONOTE (changement de compétence ou
         d'évaluation, dépliage d'un domaine, recherche, navigation) */
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