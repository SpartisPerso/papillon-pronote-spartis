/* ============================================================
   PAGE COMPÉTENCES — « LIVRET DE COMPÉTENCES NUMÉRIQUES » façon Papillon (JS)
   Cible : page « Compétences → Livret de compétences numériques »
   PRONOTE, repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Livret de compétences numériques"].

   Action : poser des classes de marquage idempotentes (côté CSS)
   sur la grille Compétences numériques / Évaluations / Niveau et son
   pied « Appréciation de l'élève », et injecter dans
   .liste_btnentete le titre de la carte (« Livret de compétences
   numériques », qui vit ici dans un <span class="sr-only"
   id="…labelListe">), un compteur du nombre d'éléments et une
   pastille de cycle (lue dans le sélecteur masqué du troisième menu).
   Le restyle est porté par livretnumerique.css ; le thème
   (html.papillon-dark) est géré par pronote.js.

   Ancrages :
   - .pap-lcn          sur le <main> de la page (fond de page via
                       :has() dans livretnumerique.css).
   - .pap-lcn-list     sur le .ObjetListe — la carte.
   - .pap-lcn-title / .pap-lcn-count / .pap-lcn-cycle : titre,
                       compteur et pastille de cycle injectés par ce
                       module (retirés en demark()).
   - .pap-lcn-cell / .pap-lcn-domaine / .pap-lcn-sousdomaine /
     .pap-lcn-item sur chaque cellule de la grille, plus le niveau
     dans data-pap-lcn-niveau sur la CASE INTÉRIEURE.
   - .pap-lcn-pied     sur le pied [id$="_pied"] (« Appréciation de
                       l'élève », 10rem réservées en bas de carte).
   - .pap-lcn-empty    sur le message « liste vide », le cas échéant.

   ⚠ DOM réel de cette page (à ne pas confondre avec la page voisine
   « Évaluations par compétence », quasi identique) :
   - c'est un ARBRE : la grille accessible est un
     <div class="sr-only" role="treegrid" aria-rowcount="184"> ; les
     cellules visibles portent data-colonne="0|1|2" ;
   - ⚠ il n'y a PAS d'`aria-level` sur ce DOM : le niveau
     domaine / sous-domaine / item se lit sur la MISE EN FORME
     INLINE de la cellule, via son background-color :
       --theme-moyen1-scalePlus10 → 1 (domaine)
       --theme-claire             → 2 (sous-domaine)
       --theme-neutre-moyen1      → 3 (item)
     avec, en repli, le cylindre de dépliage / aria-expanded ;
   - ⚠ l'indentation est posée par le JS sur la CASE INTÉRIEURE
     (.liste_contenu_cellule), jamais sur la cellule ;
   - ⚠ le libellé de la carte est un span.sr-only[id$="labelListe"] ;
     on cible par SUFFIXE court (« labelListe », sans underscore)
     pour couvrir les deux formes rencontrées sur PRONOTE
     (« …labelListe » et « …_labelListe ») ;
   - ⚠ pas de note CECRL ici : le bloc qui suit la carte est le PIED
     [id$="_pied"] (« Appréciation de l'élève », height:10rem), et
     #…_listeConteneur réserve déjà ces 10rem en calc(100% - 10rem).

   Aucun comportement natif n'est modifié : recherche, tout
   réduire/déplier, dépliage d'un domaine ou d'un sous-domaine,
   filtrage « Uniquement les items évalués », sélection d'une ligne
   et boutons du second menu restent ceux de PRONOTE. La textarea du
   pied est DÉSACTIVÉE par PRONOTE : elle est seulement stylée, JAMAIS
   réveillée.

   PIÈGE 1 — l'ancre est une égalité STRICTE sur « Livret de
   compétences numériques ». Ne pas l'élargir en regex ni en préfixe :
   les douze ancres Notes / Compétences doivent rester mutuellement
   exclusives. De même, ne jamais « raccourcir » les jetons .pap-lcn-*
   en .pap-lc-*.

   PIÈGE 2 — le <main> de PRONOTE est RÉUTILISÉ d'une page à
   l'autre : demark() retire nos marques hors de la page, avec un
   balayage forcé au boot (après un rechargement de l'extension, les
   modules re-s'exécutent sur un DOM déjà marqué).

   PIÈGE 3 — ne JAMAIS réécrire le textContent d'un nœud injecté à
   chaque processAll() : on ne l'écrit que si le texte diffère,
   sinon l'observateur body (childList) boucle à l'infini et gèle
   l'onglet.

   PIÈGE 4 — la grille est VIRTUALISÉE : seules ~20 lignes sur les
   184 de aria-rowcount sont dans le DOM à un instant donné (les
   espaces sont des .gabarit-refresh / ._range_* en pleine largeur).
   D'où le compteur par aria-rowcount (jamais par nombre de cellules
   rendues) et, côté CSS, la conservation des gouttières virtuelles.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Livret de compétences numériques';

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
     reste inerte sur les autres pages Notes / Compétences). */
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

  function list() {
    return document.querySelector('main.interface_affV_client.pap-lcn .pap-lcn-list');
  }

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à livretnumerique.css de cibler .interface_affV:has(.pap-lcn)
     (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main) return;
    addClass(main, 'pap-lcn', 'papLcn');
  }

  /* La carte : le .ObjetListe de la grille. */
  function markList() {
    const el = document.querySelector('main.interface_affV_client.pap-lcn .ObjetListe');
    if (!el) return;
    addClass(el, 'pap-lcn-list', 'papLcnList');
    markTitle(el);
    markCycle(el);
  }

  /* ---------- Titre de carte ----------
     PRONOTE n'affiche AUCUN titre sur cette page : le libellé
     « Livret de compétences numériques » est un <span class="sr-only"
     id="…labelListe"> posé en fin de liste, uniquement référencé
     par l'aria-labelledby de la grille et de la barre d'outils. On
     cible par SUFFIXE court pour couvrir les deux formes
     rencontrées sur PRONOTE (« …labelListe » et « …_labelListe »).
     On l'injecte en copie visible dans .liste_btnentete (le sr-only
     reste en place pour l'accessibilité). Si PRONOTE expose déjà un
     titre, on s'abstient pour ne pas afficher deux titres. */
  function listTitle(el) {
    const natif = el.querySelector('.liste_enteteTxt');
    if (natif && natif.textContent.trim()) return null;

    const sr = el.querySelector('span.sr-only[id$="labelListe"]');
    if (sr && sr.textContent.trim()) return sr.textContent.trim();

    const grid = el.querySelector('[aria-labelledby]');
    const by = grid && grid.getAttribute('aria-labelledby');
    const ref = by && el.querySelector(`[id="${by}"]`);
    if (ref && ref.textContent.trim()) return ref.textContent.trim();

    return PAGE_LABEL;
  }

  function markTitle(el) {
    const entete = el.querySelector('.liste_btnentete');
    if (!entete) return;
    const titre = listTitle(el);
    if (!titre) return; /* PRONOTE fournit déjà un titre visible */

    let title = entete.querySelector('.pap-lcn-title');
    if (!title) {
      title = document.createElement('span');
      title.className = 'pap-lcn-title';
      title.textContent = titre;
      entete.insertBefore(title, entete.firstChild);
    } else if (title.textContent !== titre) {
      /* ⚠ Écriture UNIQUEMENT si le texte diffère (cf. PIÈGE 3) */
      title.textContent = titre;
    }

    markCount(el);
  }

  /* Compteur « N éléments » à côté du titre.
     ⚠ PIÈGE 4 : la grille étant virtualisée, compter les cellules
     rendues ne donnerait que la vingtaine de lignes affichées. On lit
     donc l'aria-rowcount de la grille accessible (role="treegrid"),
     qui porte le total ; en repli (pas d'aria-rowcount), on ne compte
     que les lignes de la colonne 0 VISIBLES (getClientRects), car les
     lignes d'un domaine replié restent masquées par PRONOTE. */
  function markCount(el) {
    if (!el.querySelector('.pap-lcn-title')) return;

    let n = 0;
    const grid = el.querySelector('[role="treegrid"]');
    const aria = grid && parseInt(grid.getAttribute('aria-rowcount'), 10);
    if (isFinite(aria) && aria > 0) {
      n = aria;
    } else {
      const cells = el.querySelectorAll(
        '.liste_content_lignes > .liste_celluleGrid[data-colonne="0"]'
      );
      n = Array.prototype.filter.call(cells, (c) => c.getClientRects().length > 0).length;
    }

    let count = el.querySelector('.pap-lcn-count');
    if (!n) {
      if (count) count.remove();
      return;
    }
    if (!count) {
      count = document.createElement('span');
      count.className = 'pap-lcn-count';
      count.setAttribute('aria-hidden', 'true');
      el.querySelector('.pap-lcn-title').after(count);
    }
    const txt = n > 1 ? `${n} éléments` : '1 élément';
    if (count.textContent !== txt) count.textContent = txt; /* cf. PIÈGE 3 */
  }

  /* Pastille de cycle : libellé du sélecteur du troisième menu
     (« Sélectionnez un cycle » → « Compétences numériques »),
     normalisé (espaces insécables → espaces simples). Ce sélecteur est
     masqué en ligne par PRONOTE (cf. CSS) mais reste lisible. */
  function markCycle(el) {
    const entete = el.querySelector('.liste_btnentete');
    const ref = el.querySelector('.pap-lcn-count');
    if (!entete || !ref) return;

    const combo = document.querySelector(
      'nav#ligne_bandeau [aria-label="Sélectionnez un cycle"]'
    );
    const lib = combo ? combo.querySelector('.ocb-libelle') : null;
    const raw = (lib ? lib.textContent : combo ? combo.textContent : '') || '';
    const label = raw.replace(/\s+/g, ' ').trim();
    if (!label) return;

    let cycle = entete.querySelector('.pap-lcn-cycle');
    if (!cycle) {
      cycle = document.createElement('span');
      cycle.className = 'pap-lcn-cycle';
      cycle.setAttribute('aria-hidden', 'true');
      ref.after(cycle);
    }
    if (cycle.textContent !== label) cycle.textContent = label; /* cf. PIÈGE 3 */
  }

  /* ---------- Niveau d'une cellule ----------
     ⚠ Pas d'`aria-level` sur ce DOM réel : le niveau se déduit de la
     mise en forme INLINE, en-testing d'abord l'aria-level (au cas où
     PRONOTE l'ajouterait un jour), puis le background-color de la
     cellule, puis — en dernier recours — la présence du cylindre de
     dépliage / de aria-expanded. */
  function levelFromStyle(el) {
    if (!el) return 0;
    const css = el.getAttribute('style') || '';
    if (/--theme-moyen1-scalePlus10/.test(css)) return 1; /* domaine */
    if (/--theme-neutre-moyen1/.test(css)) return 3; /* item */
    if (/--theme-claire/.test(css)) return 2; /* sous-domaine */
    return 0;
  }

  function cellLevel(cell) {
    const inner = cell.querySelector('.liste_contenu_cellule');

    /* 1. aria-level, s'il apparaît un jour (cellule ou case interne) */
    const aria =
      cell.getAttribute('aria-level') || (inner && inner.getAttribute('aria-level'));
    if (aria) {
      const n = parseInt(aria, 10);
      if (isFinite(n) && n > 0) return n;
    }

    /* 2. mise en forme inline (le cas réel) */
    const byStyle = levelFromStyle(cell) || levelFromStyle(inner);
    if (byStyle) return byStyle;

    /* 3. repli : un groupe est dépliable, un item ne l'est pas */
    if (inner && inner.getAttribute('aria-expanded') !== null) return 1;
    if (cell.querySelector('.liste_contenu_cellule_deploiement')) return 1;
    return 3;
  }

  /* ---------- Cellules de la grille ----------
     La grille liste chaque ligne sous forme de cellules ADJACENTES
     (.liste_celluleGrid, une colonne chacune : Compétences
     numériques puis Évaluations puis Niveau, repérées par
     data-colonne="0|1|2"). Une « ligne » est donc le GROUPE de
     cellules consécutives dont la colonne croît depuis 0 — PRONOTE
     fige l'ordre des colonnes en inline (grid-column:1|2|3), on
     s'appuie donc sur data-colonne pour grouper. On marque alors
     TOUTES les cellules du groupe (même teinte pleine largeur côté
     CSS), jamais seulement la première. */
  function tagCell(cell, niveau) {
    addClass(cell, 'pap-lcn-cell', 'papLcnCell');
    cell.classList.toggle('pap-lcn-domaine', niveau === 1);
    cell.classList.toggle('pap-lcn-sousdomaine', niveau === 2);
    cell.classList.toggle('pap-lcn-item', niveau >= 3);

    /* L'indentation passe par la CASE INTÉRIEURE, jamais par la
       cellule : le padding inline de PRONOTE (12px / 24px) y est posé
       et il faut le remplacer par un diagramme cohérent. */
    const inner = cell.querySelector('.liste_contenu_cellule');
    if (inner) {
      if (inner.dataset.papLcnNiveau !== String(niveau)) {
        inner.dataset.papLcnNiveau = String(niveau);
      }
    }

    /* Évaluations / Niveau vides : PRONOTE laisse un &nbsp; (texte
       invisible). On marque la cellule pour afficher un tiret doux
       côté CSS, sinon la case semble « vide de tout ». */
    const ligne = cell.querySelector('.liste_contenu_ligne');
    const blank = !ligne || ligne.textContent.trim() === '';
    cell.classList.toggle('pap-lcn-cell-vide', blank);
  }

  function processCells() {
    const el = list();
    if (!el) return;
    const cells = Array.prototype.slice.call(
      el.querySelectorAll('.liste_content_lignes > .liste_celluleGrid')
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
      const niveau = cellLevel(first);
      serie.forEach((cell) => tagCell(cell, niveau));
      i += serie.length;
    }
  }

  /* Colonnes Évaluations / Niveau entièrement vides → repli.
     Tant qu'aucune évaluation n'existe, ces deux colonnes ne servent
     à rien et n'afficheraient qu'une rangée de cases vides à droite.
     processCols() pose alors .pap-lcn-no-eval / .pap-lcn-no-niveau
     sur la carte : côté CSS, la grille repasse à une seule colonne. */
  function processCols() {
    const el = list();
    if (!el) return;
    const emptyCol = (col) => {
      const cells = Array.prototype.slice.call(
        el.querySelectorAll(`.liste_content_lignes > .liste_celluleGrid[data-colonne="${col}"]`)
      );
      return (
        cells.length > 0 &&
        cells.every((c) => c.classList.contains('pap-lcn-cell-vide'))
      );
    };
    el.classList.toggle('pap-lcn-no-eval', emptyCol('1'));
    el.classList.toggle('pap-lcn-no-niveau', emptyCol('2'));
  }

  /* Alignement en-tête / lignes : le viewport (#…_Zone_1) est un
     conteneur défilant qui réserve la largeur de sa barre de
     défilement ; l'en-tête (sœur, non défilante) est donc ~10px plus
     large et ses colonnes se décalent. On mesure la largeur de barre
     réelle et on la facture à l'en-tête via --pap-lcn-sb
     (padding-right sur .liste-titre-contenu, cf. CSS) : les colonnes
     se calent pile les unes sous les autres, quel que soit l'OS /
     thème / zoom. */
  let sbMeasured = 0;

  function measureScrollbar(el) {
    if (!el) return;
    if (sbMeasured > 0) {
      if (el.style.getPropertyValue('--pap-lcn-sb') !== `${sbMeasured}px`) {
        el.style.setProperty('--pap-lcn-sb', `${sbMeasured}px`);
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
    el.style.setProperty('--pap-lcn-sb', `${sbMeasured}px`);
  }

  /* ---------- Pied de carte ----------
     Le bloc qui suit la carte est le PIED [id$="_pied"] (en fin d'id,
     PAS la classe .pied) : « Appréciation de l'élève » +
     textarea DÉSACTIVÉE, sur 10rem réservées par #…listeConteneur en
     calc(100% - 10rem). On le marque pour le styler ; la textarea est
     laissée dans son état natif (désactivée), jamais réveillée.
     ⚠ Tant qu'aucune appréciation n'est publiée, la textarea est VIDE :
     un champ vide de 10rem de haut n'apporte rien, donc on le masque
     (classe .pap-lcn-pied-vide) et la carte se réduit à son titre. Le
     test est fait ici plutôt qu'en CSS : sur un textarea, ni
     :placeholder-shown (pas de placeholder) ni :empty ( Jamais de
     pseudo-élément sur un champ de formulaire) ne fonctionnent. */
  function markPied() {
    const main = document.querySelector('main.interface_affV_client.pap-lcn');
    if (!main) return;
    const pied = main.querySelector('[id$="_pied"]');
    if (!pied || isHidden(pied)) return;
    addClass(pied, 'pap-lcn-pied', 'papLcnPied');
    const ta = pied.querySelector('textarea');
    if (ta) pied.classList.toggle('pap-lcn-pied-vide', !ta.value.trim());
  }

  /* Liste vide : PRONOTE écrit le message en texte nu dans
     .liste_messageVide → on l'encadre en carte pointillée. */
  function processEmpty() {
    const el = list();
    if (!el) return;
    const empty = el.querySelector('.liste_messageVide');
    if (!empty || isHidden(empty)) return;
    addClass(empty, 'pap-lcn-empty', 'papLcnEmpty');
    const ico = icon('ghost');
    if (ico && !empty.querySelector('.pap-lcn-empty-icon')) {
      const span = svgWrap(ico, 'ghost');
      span.className = 'pap-lcn-empty-icon papillon-icon';
      empty.prepend(span);
    }
  }

  /* Hors de la page : on retire TOUTES nos marques du <main> partagé
     et les nœuds injectés, sinon ils survivent à la navigation. Le
     drapeau évite de reparcourir le DOM sur chaque mutation, sauf au
     boot où le balayage est forcé. */
  let marked = false;

  function unmarkPied(el) {
    unmark(el, 'pap-lcn-pied', 'papLcnPied');
    el.classList.remove('pap-lcn-pied-vide');
  }

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    unmark(document.querySelector('main.interface_affV_client'), 'pap-lcn', 'papLcn');

    document.querySelectorAll('.pap-lcn-list').forEach((el) => {
      unmark(el, 'pap-lcn-list', 'papLcnList');
      el.classList.remove('pap-lcn-no-eval', 'pap-lcn-no-niveau');
    });

    document.querySelectorAll('.pap-lcn-cell').forEach((cell) => {
      cell.classList.remove(
        'pap-lcn-cell',
        'pap-lcn-domaine',
        'pap-lcn-sousdomaine',
        'pap-lcn-item',
        'pap-lcn-cell-vide'
      );
      delete cell.dataset.papLcnCell;
      const inner = cell.querySelector('.liste_contenu_cellule');
      if (inner) delete inner.dataset.papLcnNiveau;
    });

    document.querySelectorAll('.pap-lcn-pied').forEach(unmarkPied);

    document.querySelectorAll('.pap-lcn-empty').forEach((empty) => {
      unmark(empty, 'pap-lcn-empty', 'papLcnEmpty');
    });

    document
      .querySelectorAll(
        '.pap-lcn-title, .pap-lcn-count, .pap-lcn-cycle, .pap-lcn-empty-icon'
      )
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
    measureScrollbar(list());
    markPied();
    processEmpty();
  }

  function init() {
    Promise.all(Object.keys(ICON_FILES).map((k) => loadIcon(k))).then(() => {
      /* Balayage initial forcé : le <main> peut déjà porter un résidu */
      processAll(true);

      /* Recapter les re-rendus de PRONOTE (dépliage d'un domaine,
         changement de cycle, filtrage « Uniquement les items
         évalués », recherche, défilement virtualisé, navigation) */
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
