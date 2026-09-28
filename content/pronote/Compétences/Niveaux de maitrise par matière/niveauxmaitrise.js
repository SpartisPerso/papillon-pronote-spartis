/* ============================================================
   PAGE COMPÉTENCES — « NIVEAUX DE MAITRISE PAR MATIÈRE »
   façon Papillon (JS)
   Cible : page « Compétences → Bilan par domaine → Niveaux de
   maitrise par matière » PRONOTE, repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Niveaux de maitrise par matière"].

   Action : poser des classes de marquage idempotentes (côté CSS)
   et transformer le message d'état vide de PRONOTE (« Le bulletin
   de compétences ne contient aucune évaluation. ») en carte vide
   Papillon (icône + texte). Le restyle est porté par
   niveauxmaitrise.css ; le thème (html.papillon-dark) est géré par
   pronote.js.

   Ancrages :
   - .pap-nm          sur le <main> de la page (fond de page via
                      :has() dans niveauxmaitrise.css, cf.
                      .interface_affV).
   - .pap-nm-empty    sur le <div role="note"> de l'état vide.
   - .pap-nm-empty-icon : icône injectée par ce module (démarquée
                      et retirée en demark()).

   Aucun comportement natif n'est modifié : sélecteur de période du
   troisième menu (le SEUL sélecteur de cette page, contrairement à
   « Évaluations par compétence »), boutons d'enregistrement / PDF
   et navigation restent ceux de PRONOTE.

   PIÈGE 1 — ne pas confondre avec la page voisine « Évaluations
   par compétence » (même sous-menu « Bilan par domaine », DOM aussi
   basé sur une grille via le troisième menu) : l'ancre est une
   égalité stricte sur « Niveaux de maitrise par matière ». Ne pas
   l'élargir en regex ni en préfixe, sinon les deux pages se
   marquent en même temps.

   PIÈGE 2 — le DOM de l'état vide est minimal : une simple chaîne
   main.interface_affV_client > .interface_affV.interface_affV_padding
   > .interface_affV_client > [role="note"] > p. Aucun .Espace,
   aucun .Table.BorderBox, aucun .liste-* : le test porte donc sur
   le <p> (texte non vide) ET la classe pap-* pour ne jamais
   révéler de coquille vide si la page change de contenu.

   PIÈGE 3 — le <main> de PRONOTE est RÉUTILISÉ d'une page à
   l'autre : les classes d'un module restent donc collées quand on
   navigue ailleurs. Ce module dé-classe ses propres marques hors
   de sa page (demark), avec un balayage forcé au boot (après un
   rechargement de l'extension, les modules re-s'exécutent sur un
   DOM déjà marqué).
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Niveaux de maitrise par matière';

  const ICON_CACHE = new Map();
  const ICON_FILES = {
    graduation: 'graduation-hat.svg',
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
     reste inerte sur « Évaluations par compétence » et sur les
     autres pages, au DOM parfois proche). */
  function onPage() {
    const bc = document.getElementById('breadcrumbBandeau');
    return !!bc && bc.getAttribute('aria-label') === PAGE_LABEL;
  }

  /* PRONOTE masque ce qui n'est pas encore publié avec un display:none
     en ligne : on remonte la chaîne jusqu'au <main> et on ne stylera
     jamais un bloc ainsi masqué, sinon une règle !important
     révélerait une coquille vide. */
  function isHidden(el) {
    if (!el) return true;
    if (el.hidden) return true;
    try {
      if (getComputedStyle(el).display === 'none') return true;
    } catch (e) {
      /* ignore */
    }
    const main = document.querySelector('main.interface_affV_client');
    let node = el.parentElement;
    while (node && node !== main) {
      if (node.hidden) return true;
      if (node.style && node.style.display === 'none') return true;
      node = node.parentElement;
    }
    return false;
  }

  /* Retire une marque (classe + jeton) posée par ce module. */
  function unmark(el, cls, token) {
    if (!el) return;
    el.classList.remove(cls);
    delete el.dataset[token];
  }

  /* Retire la carte d'état vide d'un <div role="note"> (icône
     comprise) et rend le noeud à PRONOTE. */
  function unmarkEmpty(note) {
    if (!note || !note.classList.contains('pap-nm-empty')) return;
    const ico = note.querySelector('.pap-nm-empty-icon');
    if (ico) ico.remove();
    unmark(note, 'pap-nm-empty', 'papNmEmpty');
  }

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à niveauxmaitrise.css de cibler .interface_affV:has(.pap-nm)
     (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main || main.classList.contains('pap-nm')) return;
    main.classList.add('pap-nm');
    main.dataset.papNm = '1';
  }

  /* Message d'état vide (« Le bulletin de compétences ne contient
     aucune évaluation. ») → carte vide Papillon. Le test porte sur
     le texte ET sur la classe pap-* : PRONOTE peut réutiliser le
     même <div role="note"> en réécrivant son <p>. Inverse : dès que
     le message disparaît (évaluations publiées, PRONOTE masque ou
     vide le <p>), on DÉMARQUE — sinon .pap-nm-empty (display:flex
     !important) afficherait une carte vide à côté du contenu. */
  function processEmpty() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main) return;
    /* Le <div role="note"> de l'état vide est enfant direct de la
       chaîne main > .interface_affV.interface_affV_padding >
       .interface_affV_client : on cible ce nœud imbriqué précisément,
       pas n'importe quel [role="note"] du <main> (d'autres pages en
       portent plusieurs). */
    const note = main.querySelector('.interface_affV_client [role="note"]');
    if (!note) return;

    const p = note.querySelector('p');
    const txt = p ? (p.textContent || '').trim() : '';
    const isMessage = txt.length > 0 && /comp[eé]tence|[ée]valuation|bulletin/i.test(txt);

    if (isHidden(note) || !isMessage) {
      unmarkEmpty(note);
      return;
    }

    if (!note.classList.contains('pap-nm-empty')) {
      note.classList.add('pap-nm-empty');
      note.dataset.papNmEmpty = '1';
    }

    const ico = icon('graduation');
    if (ico && !note.querySelector('.pap-nm-empty-icon')) {
      const span = svgWrap(ico, 'graduation');
      span.className = 'pap-nm-empty-icon papillon-icon';
      note.prepend(span);
    }
  }

  /* Hors de la page : on retire nos marques du <main> partagé, sinon
     elles survivent à la navigation (le <main> de PRONOTE est
     réutilisé d'une page à l'autre). Le drapeau évite de reparcourir
     le DOM à chaque mutation, sauf au boot où le balayage est
     forcé. */
  let marked = false;

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    const main = document.querySelector('main.interface_affV_client');
    if (main) unmark(main, 'pap-nm', 'papNm');

    document.querySelectorAll('main.interface_affV_client [role="note"]').forEach((note) => {
      unmarkEmpty(note);
    });
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
    processEmpty();
  }

  function init() {
    Promise.all(Object.keys(ICON_FILES).map((k) => loadIcon(k))).then(() => {
      /* Balayage initial forcé : le <main> peut déjà porter un résidu */
      processAll(true);

      /* Recapter les re-rendus de PRONOTE (changement de période,
         publication des évaluations, navigation) */
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