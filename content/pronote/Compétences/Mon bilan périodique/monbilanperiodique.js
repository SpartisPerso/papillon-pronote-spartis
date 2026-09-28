/* ============================================================
   PAGE COMPÉTENCES — « MON BILAN PÉRIODIQUE » façon Papillon (JS)
   Cible : page « Compétences → Bilan périodique → Mon bilan
   périodique » PRONOTE, repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Mon bilan périodique"].

   Action : poser des classes de marquage idempotentes (côté CSS)
   et transformer le message d'attente de PRONOTE (« Le bulletin de
   compétences sera publié à partir du 23/11/26. ») en carte vide
   Papillon (icône papicon + date mise en valeur). Le restyle est
   porté par monbilanperiodique.css ; le thème (html.papillon-dark)
   est géré par pronote.js.

   Ancrages :
   - .pap-bp          sur le <main> de la page (fond de page via
                       :has() dans monbilanperiodique.css, cf.
                       .interface_affV).
   - .pap-bp-empty    sur le <div role="note"> de l'état vide.
   - .pap-bp-empty-date / .pap-bp-empty-icon : <b> de date et icône
                       injectés par ce module (démarqués et retirés
                       en demark()).

   Aucun comportement natif n'est modifié : sélecteur de période du
   troisième menu, boutons d'enregistrement / PDF et navigation
   restent ceux de PRONOTE.

   PIÈGE 1 — ne pas confondre avec la page voisine « Bilan
   périodique de ma classe » (même rubrique, DOM quasi identique) :
   l'ancre est une égalité stricte sur « Mon bilan périodique ».
   Ne surtout pas l'élargir en regex ni en préfixe, sinon les deux
   pages se marquent en même temps et deux cartes s'affichent.

   PIÈGE 2 — le DOM est presque identique à celui des pages Notes
   (« Mon relevé de notes », « Mon bulletin de notes », « Bulletin
   de ma classe ») : mêmes .Espace / .EspaceBas, même
   #…_PiedBull masqué, même bloc .Table de 70rem. Le <main> de
   PRONOTE est RÉUTILISÉ d'une page à l'autre : les classes d'un
   module restent donc collées quand on navigue ailleurs. Chaque
   module dé-classe ses propres marques hors de sa page (demark),
   avec un balayage forcé au boot (après un rechargement de
   l'extension, les modules re-s'exécutent sur un DOM déjà marqué).

   PIÈGE 3 — contrairement aux pages Notes, le <div role="note">
   du message n'est PAS un enfant direct de .Espace : ici la
   chaîne est .Espace > .Table.BorderBox > .EspaceBas > [role=note]
   (avec un #…_conteneur-tabs masqué et un #…_bull_legende masqué
   à côté). D'où le sélecteur descendant `.Espace [role="note"]`.

   PIÈGE 4 — le <main> contient DEUX <div role="note"> : celui de
   l'état vide (dans .Espace) et celui du bloc .Table de 70rem
   (graphe / légende du bilan, enfant direct de <main>, <p> vide).
   Le premier sélecteur est donc borné à .Espace, et le second est
   de toute façon rejeté par le test de texte (p vide). Idem pour la
   bannière « Consultation temporaire » du second menu : elle est
   aussi en [role="note"] mais hors de <main> ET en display:none
   en ligne — ne jamais la révéler.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Mon bilan périodique';

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
     reste inerte sur « Bilan périodique de ma classe » et sur les
     pages Notes, au DOM pourtant identique). */
  function onPage() {
    const bc = document.getElementById('breadcrumbBandeau');
    return !!bc && bc.getAttribute('aria-label') === PAGE_LABEL;
  }

  /* PRONOTE masque ce qui n'est pas encore publié avec un display:none
     en ligne : sur CETTA page, le masquage peut porter sur le
     <div role="note"> ou sur l'un de ses parents (.EspaceBas,
     .Espace…), donc on remonte la chaîne jusqu'au <main>. Ne jamais
     styler un bloc ainsi masqué, sinon une règle !important
     révélerait une coquille vide.
     La remontée se fait sur le style en ligne (gratuit) et le seul
     getComputedStyle est celui du message lui-même : processAll()
     tourne à chaque mutation de PRONOTE, on évite d'y forcer un
     recalcul de style à chaque maillon. */
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

  /* Enrobe la date « 23/11/26 » du message dans un <b> Papillon.
     Découpage du nœud texte puis insertion : le texte d'origine est
     conservé mot pour mot, on ne fait que l'encadrer. */
  function wrapDate(p) {
    if (p.querySelector('.pap-bp-empty-date')) return;
    const re = /\d{2}\/\d{2}\/\d{2}/;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const m = re.exec(node.nodeValue || '');
      if (m) {
        const after = node.splitText(m.index);
        after.nodeValue = after.nodeValue.slice(m[0].length);
        const b = document.createElement('b');
        b.className = 'pap-bp-empty-date';
        b.textContent = m[0];
        node.parentNode.insertBefore(b, after);
        return;
      }
      node = walker.nextNode();
    }
  }

  /* Retire la <b> de date : on remet le texte à plat pour laisser
     le DOM PRONOTE tel qu'il était. */
  function unwrapDate(note) {
    const b = note.querySelector('.pap-bp-empty-date');
    if (!b) return;
    b.replaceWith(document.createTextNode(b.textContent));
  }

  /* Retire la carte d'état vide d'un <div role="note"> (icône
     comprise) et rend le noeud à PRONOTE. */
  function unmarkEmpty(note) {
    if (!note || !note.classList.contains('pap-bp-empty')) return;
    unwrapDate(note);
    const ico = note.querySelector('.pap-bp-empty-icon');
    if (ico) ico.remove();
    unmark(note, 'pap-bp-empty', 'papBpEmpty');
  }

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à monbilanperiodique.css de cibler .interface_affV:has(.pap-bp)
     (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main || main.classList.contains('pap-bp')) return;
    main.classList.add('pap-bp');
    main.dataset.papBp = '1';
  }

  /* Message d'attente (« Le bulletin de compétences sera publié à
     partir du … ») → carte vide Papillon. Le test porte sur le texte
     ET sur la classe pap-* : PRONOTE peut réutiliser le même
     <div role="note"> en réécrivant son <p>, auquel cas le jeton
     survivrait et l'enrobage de la date ne serait jamais refait.
     Inverse : dès que le message disparaît (bilan publié, PRONOTE
     masque ou vide le <p>), on DÉMARQUE — sinon .pap-bp-empty
     (display:flex !important) afficherait une carte vide à côté du
     bilan. */
  function processEmpty() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main) return;
    const note = main.querySelector('.Espace [role="note"]');
    if (!note) return;

    const p = note.querySelector('p');
    const txt = p ? (p.textContent || '').trim() : '';
    /* Le second [role="note"] de la page (bloc 70rem) a un <p> vide :
       le test de texte suffit à l'écarter, la borne .Espace aussi. */
    const isMessage = txt.length > 0 && /bulletin|bilan|publi[ée]/i.test(txt);

    if (isHidden(note) || !isMessage) {
      unmarkEmpty(note);
      return;
    }

    if (!note.classList.contains('pap-bp-empty')) {
      note.classList.add('pap-bp-empty');
      note.dataset.papBpEmpty = '1';
    }

    wrapDate(p);

    const ico = icon('graduation');
    if (ico && !note.querySelector('.pap-bp-empty-icon')) {
      const span = svgWrap(ico, 'graduation');
      span.className = 'pap-bp-empty-icon papillon-icon';
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
    if (main) unmark(main, 'pap-bp', 'papBp');

    document.querySelectorAll('main.interface_affV_client .Espace [role="note"]').forEach((note) => {
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
         publication du bilan, navigation) */
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
