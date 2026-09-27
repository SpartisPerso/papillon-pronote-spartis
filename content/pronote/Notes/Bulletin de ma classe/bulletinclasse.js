/* ============================================================
   PAGE NOTES — « BULLETIN DE MA CLASSE » façon Papillon (JS)
   Cible : page « Notes → Bulletins → Bulletin de ma classe »
   PRONOTE, repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Bulletin de ma classe"].

   Action : poser des classes de marquage idempotentes (côté CSS)
   et transformer le message d'attente de PRONOTE en carte vide
   Papillon (icône papicon + date mise en valeur). Le restyle est
   porté par bulletinclasse.css ; le thème (html.papillon-dark)
   est géré par pronote.js.

   Ancrages :
   - .pap-bc          sur le <main> de la page (fond de page via
                       :has() dans bulletinclasse.css, cf. .interface_affV).
   - .pap-bc-empty    sur le <div role="note"> de l'état vide
                       (« Le bulletin de la classe sera publié à
                       partir du … »).

   Aucun comportement natif n'est modifié : sélecteur de période du
   troisième menu, boutons d'enregistrement / PDF et navigation
   restent ceux de PRONOTE.

   PIÈGE 1 — ne pas confondre avec les trois autres pages Notes :
   l'ancre est une égalité stricte sur « Bulletin de ma classe ».
   Elle ne matche ni « Mon bulletin de notes » (bulletin.js), ni
   « Mon relevé de notes » (releve.js), ni la regex
   /^d[ée]tail de mes notes/i de MesNotes.js : les quatre modules
   restent mutuellement exclusifs. Ne surtout pas élargir l'ancre
   en regex, sinon les trois pages Notes se marquent en même temps.

   PIÈGE 2 — le DOM est presque identique à celui du Relevé et de
   « Mon bulletin de notes » (mêmes .Espace, même _PiedBull masqué)
   et le <main> de PRONOTE est RÉUTILISÉ entre les pages : les
   classes d'un module restent donc collées quand on navigue
   ailleurs. Chaque module dé-classe ses propres marques hors de sa
   page (demark), avec un balayage forcé au boot (après un
   rechargement de l'extension, les modules re-s'exécutent sur un
   DOM déjà marqué).

   PIÈGE 3 — le sélecteur d'état vide est scopé sur
   .Espace > [role="note"] + test sur le texte : le second menu
   contient une bannière « Consultation temporaire » (elle aussi en
   [role="note"], mais hors de <main>) que PRONOTE masque avec
   style="display:none" et qu'il ne faut surtout pas révéler.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Bulletin de ma classe';

  const ICON_CACHE = new Map();
  const ICON_FILES = {
    user: 'user.svg',
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
     reste inerte sur les autres pages Notes). */
  function onPage() {
    const bc = document.getElementById('breadcrumbBandeau');
    return !!bc && bc.getAttribute('aria-label') === PAGE_LABEL;
  }

  /* PRONOTE masque ce qui n'est pas encore publié avec un display:none
     en ligne (inline ou feuille de style) : on ne le stylise jamais,
     sinon une règle !important révélerait un bloc vide. */
  function isHidden(el) {
    if (!el || el.hidden) return true;
    if (el.style && el.style.display === 'none') return true;
    try {
      return getComputedStyle(el).display === 'none';
    } catch (e) {
      return false;
    }
  }

  /* Retire une marque (classe + jeton) posée par ce module. */
  function unmark(el, cls, token) {
    if (!el) return;
    el.classList.remove(cls);
    delete el.dataset[token];
  }

  /* Enrobe la date « 23/11/26 » du message dans un <b> Papillon.
     Découpage du nœud texte puis insertion : le texte d'origine est
     conservé mot pour mot, on ne fait que l'encadrer. */
  function wrapDate(p) {
    if (p.querySelector('.pap-bc-empty-date')) return;
    const re = /\d{2}\/\d{2}\/\d{2}/;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const m = re.exec(node.nodeValue || '');
      if (m) {
        const after = node.splitText(m.index);
        after.nodeValue = after.nodeValue.slice(m[0].length);
        const b = document.createElement('b');
        b.className = 'pap-bc-empty-date';
        b.textContent = m[0];
        node.parentNode.insertBefore(b, after);
        return;
      }
      node = walker.nextNode();
    }
  }

  /* Rastitue la <b> de date : on remet le texte à plat pour laisser
     le DOM PRONOTE tel qu'il était. */
  function unwrapDate(note) {
    const b = note.querySelector('.pap-bc-empty-date');
    if (!b) return;
    b.replaceWith(document.createTextNode(b.textContent));
  }

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à bulletinclasse.css de cibler .interface_affV:has(.pap-bc)
     (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main || main.classList.contains('pap-bc')) return;
    main.classList.add('pap-bc');
    main.dataset.papBc = '1';
  }

  /* Message d'attente (« sera publié à partir du … ») → carte vide
     Papillon. Le test porte sur le texte ET sur la classe pap-* :
     PRONOTE peut réutiliser le même <div role="note"> en réécrivant
     son <p>, auquel cas le jeton survivrait et l'enrobage de la
     date ne serait jamais refait. */
  function processEmpty() {
    const note = document.querySelector('main.interface_affV_client .Espace > [role="note"]');
    if (!note) return;
    /* Une fois le bulletin publié, PRONOTE masque ce message : on le
       DÉMARQUE, sinon .pap-bc-empty (display:flex !important)
       afficherait une carte vide à côté du bulletin. */
    if (isHidden(note)) {
      if (note.classList.contains('pap-bc-empty')) {
        unwrapDate(note);
        const ico = note.querySelector('.pap-bc-empty-icon');
        if (ico) ico.remove();
        unmark(note, 'pap-bc-empty', 'papBcEmpty');
      }
      return;
    }
    const p = note.querySelector('p');
    if (!p || !/bulletin/i.test(p.textContent || '')) return;

    if (!note.classList.contains('pap-bc-empty')) {
      note.classList.add('pap-bc-empty');
      note.dataset.papBcEmpty = '1';
    }

    wrapDate(p);

    const ico = icon('user');
    if (ico && !note.querySelector('.pap-bc-empty-icon')) {
      const span = svgWrap(ico, 'user');
      span.className = 'pap-bc-empty-icon papillon-icon';
      note.prepend(span);
    }
  }

  /* Hors de la page : on retire nos marques du <main> partagé, sinon
     elles survivent à la navigation (le <main> de PRONOTE est
     réutilisé d'une page à l'autre). Le drapeau évite de reparcourir
     le DOM sur toutes les pages Notes, sauf au boot où le balayage
     est forcé. */
  let marked = false;

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    const main = document.querySelector('main.interface_affV_client');
    if (main) unmark(main, 'pap-bc', 'papBc');

    document.querySelectorAll('main.interface_affV_client .Espace > [role="note"]').forEach((note) => {
      if (!note.classList.contains('pap-bc-empty')) return;
      unwrapDate(note);
      const ico = note.querySelector('.pap-bc-empty-icon');
      if (ico) ico.remove();
      unmark(note, 'pap-bc-empty', 'papBcEmpty');
    });
  }

  function processAll(force) {
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
         publication du bulletin, navigation) */
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
