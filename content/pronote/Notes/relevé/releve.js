/* ============================================================
   PAGE NOTES — « MON RELEVÉ DE NOTES » façon Papillon (JS)
   Cible : page « Notes → Relevé » PRONOTE, repérée par son fil
   d'Ariane h1#breadcrumbBandeau[aria-label="Mon relevé de notes"].

   Action : poser des classes de marquage idempotentes (côté CSS)
   et transformer le message d'attente de PRONOTE en carte vide
   Papillon (icône papicon + date mise en valeur). Le restyle est
   porté par releve.css ; le thème (html.papillon-dark) est géré
   par pronote.js.

   Ancrages :
   - .pap-rlv          sur le <main> de la page (fond de page via
                       :has() dans releve.css, cf. .interface_affV).
   - .pap-rlv-cols     sur le conteneur du relevé publié
                       (div.Espace.AlignementBas), qui contient les
                       quatre colonnes .EspaceBas.
   - .pap-rlv-empty    sur le <div role="note"> qui porte le message
                       « Le relevé de notes sera publié à partir du … ».
   - .pap-rlv-fenetre  sur les deux modales « Méthode de calcul de
                       la moyenne », qui vivent dans #zone_fenetre,
                       donc HORS de <main> : marquage séparé, sur le
                       modèle de markFenetre() dans VueHebdomadaire.js.

   Aucun comportement natif n'est modifié : sélecteur de période du
   troisième menu, boutons d'enregistrement / PDF, ouverture des
   modales et navigation restent ceux de PRONOTE.

   PIÈGE — ne pas confondre avec MesNotes.js : cette page est
   repérée par une égalité stricte sur « Mon relevé de notes », qui
   ne matche pas la regex /^d[ée]tail de mes notes/i de MesNotes.js.
   Les deux pages restent donc mutuellement exclusives.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page (comme VueHebdomadaire.js) */
  const PAGE_LABEL = 'Mon relevé de notes';

  const ICON_CACHE = new Map();
  const ICON_FILES = {
    clock: 'papicons/clock.svg',
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
     sinon une règle !important revealerait un bloc vide. */
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
     à releve.css de cibler .interface_affV:has(.pap-rlv) (ancêtre). */
  function markPage() {
    const main = document.querySelector('main.interface_affV_client');
    if (!main || main.classList.contains('pap-rlv')) return;
    main.classList.add('pap-rlv');
    main.dataset.papRlv = '1';
  }

  /* Conteneur du relevé publié (div.Espace.AlignementBas). Il est
     présent dans le DOM même quand le relevé n'est pas encore
     publié : PRONOTE le pose alors en display:none et le laisse vide.
     On ne marque donc QUE s'il est réellement visible ET rempli —
     sinon releve.css (qui force le display des cartes et des
     colonnes) afficherait quatre bulles blanches sous l'état vide. */
  function markBulletin() {
    document.querySelectorAll('main.interface_affV_client .Espace.AlignementBas').forEach((el) => {
      const rempli = Array.prototype.some.call(
        el.querySelectorAll('.EspaceBas'),
        (c) => c.children.length > 0 || (c.textContent || '').trim().length > 0
      );
      /* Masqué ou vide → on DÉMARQUE : le CSS force le display des
         cartes, une classe résiduelle suffirait à faire réapparaître
         quatre bulles. Le retour à l'état publié re-marque tout. */
      if (isHidden(el) || !rempli) {
        el.classList.remove('pap-rlv-cols');
        delete el.dataset.papRlvCols;
        return;
      }
      if (el.classList.contains('pap-rlv-cols')) return;
      el.classList.add('pap-rlv-cols');
      el.dataset.papRlvCols = '1';
    });
  }

  /* Les deux modales « Méthode de calcul de la moyenne » sont dans
     #zone_fenetre, hors de <main>. Ciblage par PRÉFIXE de classe :
     les identifiants et le suffixe _racine changent d'une version à
     l'autre de PRONOTE. */
  function markFenetre() {
    const sel = '#zone_fenetre .ObjetFenetre_Espace[class*="ObjetFenetre_MethodeCalculMoyenne"],' +
      '#zone_fenetre .ObjetFenetre_Espace[class*="ObjetFenetre_MoyenneTableauResultats"]';
    document.querySelectorAll(sel).forEach((el) => {
      if (el.classList.contains('pap-rlv-fenetre')) return;
      el.classList.add('pap-rlv-fenetre');
      el.dataset.papRlvFenetre = '1';
    });
  }

  /* Enrobe la date « 23/11/26 » du message dans un <b> Papillon.
     Découpage du nœud texte puis insertion : le texte d'origine est
     conservé mot pour mot, on ne fait que l'encadrer. */
  function wrapDate(p) {
    if (p.querySelector('.pap-rlv-empty-date')) return;
    const re = /\d{2}\/\d{2}\/\d{2}/;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const m = re.exec(node.nodeValue || '');
      if (m) {
        const after = node.splitText(m.index);
        after.nodeValue = after.nodeValue.slice(m[0].length);
        const b = document.createElement('b');
        b.className = 'pap-rlv-empty-date';
        b.textContent = m[0];
        node.parentNode.insertBefore(b, after);
        return;
      }
      node = walker.nextNode();
    }
  }

  /* Message d'attente (« sera publié à partir du … ») → carte vide
     Papillon. Le test porte sur le texte ET sur la classe pap-* :
     PRONOTE peut réutiliser le même <div role="note"> en réécrivant
     son <p>, auquel cas le jeton survivrait et l'enrobage de la
     date ne serait jamais refait. */
  function processEmpty() {
    const note = document.querySelector('main.interface_affV_client .Espace > [role="note"]');
    if (!note) return;
    /* Une fois le relevé publié, PRONOTE masque ce message : on le
       DÉMARQUE, sinon .pap-rlv-empty (display:flex !important)
       afficherait une carte vide à côté du bulletin. */
    if (isHidden(note)) {
      note.classList.remove('pap-rlv-empty');
      delete note.dataset.papRlvEmpty;
      return;
    }
    const p = note.querySelector('p');
    if (!p || !/relev/i.test(p.textContent || '')) return;

    if (!note.classList.contains('pap-rlv-empty')) {
      note.classList.add('pap-rlv-empty');
      note.dataset.papRlvEmpty = '1';
    }

    wrapDate(p);

    const ico = icon('clock');
    if (ico && !note.querySelector('.pap-rlv-empty-icon')) {
      const span = svgWrap(ico, 'clock');
      span.className = 'pap-rlv-empty-icon papillon-icon';
      note.prepend(span);
    }
  }

  function processAll() {
    if (!onPage()) return;
    markPage();
    markBulletin();
    markFenetre();
    processEmpty();
  }

  function init() {
    Promise.all(Object.keys(ICON_FILES).map((k) => loadIcon(k))).then(() => {
      processAll();

      /* Recapter les re-rendus de PRONOTE (changement de période,
         publication du relevé, ouverture d'une modale) */
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
