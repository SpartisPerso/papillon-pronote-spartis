/* ============================================================
   PAGE COMPÉTENCES — « MES ÉVALUATIONS » façon Papillon (JS)
   Cible : page « Compétences → Évaluations → Mes évaluations »
   PRONOTE, repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Détail de mes évaluations"].

   Cette page réutilise le widget «InterfaceDernieresNotes» de la
   page « Détail de mes notes » (même div racine .InterfaceDernieresNotes,
   mêmes deux sections .ListeDernieresNotes / .Zone-DetailsNotes, mêmes
   largeurs inline --liste-width:625px / --detail-width:600px), mais
   pour les évaluations par compétence.

   Ce que fait le module (d'après le DOM réellement observé, période
   sans évaluation) :
   1. pose le marquage idempotent .pap-ev sur le <main> de la page ;
   2. pose la grille à deux colonnes (.pap-ev-grid) et les deux
      cartes (.pap-ev-list / .pap-ev-detail) ;
   3. masque la colonne de détail tant qu'elle est vide
      (.pap-ev-detail-vide : ni contenu, ni masquée par PRONOTE) et
      ramène alors la grille à une colonne — sinon on verrait une
      carte blanche à côté du message d'attente ;
   4. transforme le message « Aucune évaluation disponible pour
      cette période » en carte vide Papillon (icône papicon ghost +
      pastille de période) ;
   5. neutralise les dimensions inline figées par PRONOTE dans la
      liste (largeurs figées, hauteur du viewport de défilement)
      pour que rien ne déborde de la carte.

   Le restyle est porté par mesevaluations.css, le thème
   (html.papillon-dark) par pronote.js.

   Aucun comportement natif n'est modifié : sélecteur de période,
   tri « Par ordre chronologique / Par matière » (masqué par
   PRONOTE en visibility:hidden — c'est header.css qui retire la
   boîte, ne pas le refaire ici), navigation clavier dans la liste,
   boutons d'enregistrement / PDF et Légende du second menu.

   PIÈGE 1 — ancre en ÉGALITÉ STRICTE sur « Détail de mes
   évaluations ». Elle ne matche ni la regex /^d[ée]tail de mes
   notes/i de MesNotes.js, ni les ancres des autres pages Notes
   (« Mon relevé de notes », « Mon bulletin de notes », « Bulletin
   de ma classe », « Anciens bulletins ») : les six modules restent
   mutuellement exclusifs. Ne pas élargir l'ancre en regex, et ne
   pas élargir celle de MesNotes.js (les deux pages se partagent le
   même widget, donc le même DOM racine .InterfaceDernieresNotes).

   PIÈGE 2 — le <main> et le widget sont RÉUTILISÉS d'une page à
   l'autre : le module dé-classe toutes ses marques hors de sa page
   (demark) et retire les nœuds qu'il a injectés, sinon
   mesevaluations.css continuerait de s'appliquer chez la voisine
   (fond de page, boutons du second menu, cartes). Balayage forcé au
   boot, car après un rechargement de l'extension les modules
   re-s'exécutent sur un DOM déjà marqué.

   PIÈGE 3 — le fil d'Ariane peut être réécrit EN PLACE (même <h1>,
   aria-label changé) : les observateurs childList ne le voient
   pas, d'où watchBreadcrumb() qui surveille l'attribut et
   ré-attache l'observateur quand PRONOTE remplace le nœud.

   PIÈGE 4 — ne jamais styler les <li> de .menu-commandes : le
   troisième porte la bannière « Consultation temporaire » que
   PRONOTE masque en display:none, et un display:flex !important la
   ferait réapparaître. On n'agit que sur les <i class="btnImage">.

   PIÈGE 5 — le display:none de .pap-ev-detail-vide (colonne de
   détail vide) est en concurrence avec le display:flex du bloc
   « les deux cartes » de mesevaluations.css. Les deux déclarations
   sont en !important : à spécificité égale c'est l'ORDRE de la
   feuille qui tranche, et le flex l'emportait → la carte blanche du
   détail restait visible sous l'état vide, soit DEUX widgets
   empilés. La règle est donc écrite après, sur le couple de classes
   `.pap-ev-detail.pap-ev-detail-vide` (spécificité supérieure) :
   toute nouvelle règle display sur .pap-ev-list / .pap-ev-detail
   doit respecter cet ordre.

   DOM NON ENCORE CONNU — le contenu des lignes d'évaluation et le
   panneau de détail d'une évaluation sélectionnée. Tant qu'aucune
   période n'affiche d'évaluation, la feuille ne style QUE le
   squelette (cartes, état vide, largeurs) : le restyle des lignes
   et du détail est à faire d'après un DOM peuplé, comme le
   bulletin de releve.css.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = 'Détail de mes évaluations';

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
    span.setAttribute('aria-hidden', 'true');
    span.innerHTML = inner;
    return span;
  }

  /* Ancre de page : sans elle, on ne pose AUCUNE classe (le module
     reste inerte sur les autres pages Notes / Compétences). */
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

  /* Sélecteurs de la page. Le widget .InterfaceDernieresNotes est
     PARTAGÉ avec « Détail de mes notes » (même div racine, mêmes
     sections) : tout ce qui est dans le <main> est donc ancré sur
     .pap-ev, qu'on pose en premier. Les sélecteurs de demark()
     ciblent à l'inverse les classes pap-ev-* elles-mêmes, pour
     retrouver les marques même après la navigation. */
  const MAIN_EL = 'main.interface_affV_client';
  const MAIN = MAIN_EL + '.pap-ev';
  const GRID = MAIN + ' .InterfaceDernieresNotes';
  const LIST = GRID + ' section.ListeDernieresNotes';
  const DETAIL = GRID + ' section.Zone-DetailsNotes';

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à mesevaluations.css de cibler .interface_affV:has(.pap-ev)
     (le wrapper est un ancêtre, pas un descendant). */
  function markPage() {
    addClass(document.querySelector(MAIN_EL), 'pap-ev', 'papEv');
  }

  /* Grille à deux colonnes + les deux cartes. */
  function markLayout() {
    addClass(document.querySelector(GRID), 'pap-ev-grid', 'papEvGrid');
    addClass(document.querySelector(LIST), 'pap-ev-list', 'papEvList');
    addClass(document.querySelector(DETAIL), 'pap-ev-detail', 'papEvDetail');
  }

  /* La colonne de détail ne sert à rien tant qu'aucune évaluation
     n'est sélectionnée : PRONOTE y laisse un simple « &nbsp; ».
     On la masque (et on ramène la grille à une colonne) plutôt que
     d'afficher une carte blanche. Tant que le DOM de l'évaluation
     sélectionnée est inconnu, on se contente de ce test. */
  function markDetailVide() {
    const detail = document.querySelector(DETAIL);
    if (!detail) return;
    /* On retire d'abord NOTRE marque : le CSS .pap-ev-detail-vide
       (display:none) ferait passer isHidden(detail) à true, et le
       panneau resterait masqué pour toujours, même après
       l'apparition du contenu d'une évaluation sélectionnée. */
    unmark(detail, 'pap-ev-detail-vide', 'papEvDetailVide');
    const texte = (detail.textContent || '').replace(/[\s\u00a0\u202f\u2009]/g, '');
    const vide = texte.length === 0 || isHidden(detail);
    if (vide) addClass(detail, 'pap-ev-detail-vide', 'papEvDetailVide');
  }

  /* ---------- Liste des évaluations ----------
     PRONOTE fige la largeur de la zone de liste et du viewport
     (#…_Zone_1) en inline : on les rend fluides, et surtout on
     transforme le viewport en vrai conteneur de défilement borné
     par le budget vertical (même recette que MesNotes).

     Tant que la période n'affiche aucune évaluation, il n'y a pas
     de .ObjetListe : c'est la <section> elle-même qui sert
     d'enveloppe transparente à la carte d'état vide. Dès que la
     liste existe, cette marque doit être RETIRÉE de la section,
     sinon elle y reste collée (le <main> et le widget sont
     réutilisés d'une page à l'autre) et la règle
     `.pap-ev-objet { background:transparent; border:none; … }`
     aplatit la carte de liste. */
  function markListe() {
    const list = document.querySelector(LIST);
    if (!list) return;
    const objet = list.querySelector('.ObjetListe');
    if (!objet) unmark(list, 'pap-ev-objet', 'papEvObjet');
    addClass(objet || list, 'pap-ev-objet', 'papEvObjet');
  }

  /* ---------- Message d'attente ----------
     <div role="note"><p …>Aucune évaluation disponible pour cette
     période</p></div> → carte vide Papillon (icône + pastille de
     période). Le test porte sur le texte ET sur la classe : PRONOTE
     peut réutiliser le même <div role="note"> en réécrivant son
     <p>, auquel cas le jeton survivrait et l'icône ne serait
     jamais reposée. */
  function processEmpty() {
    const note = document.querySelector(LIST + ' [role="note"]');
    if (!note) return;
    const p = note.querySelector('p');
    /* Une fois des évaluations publiées, PRONOTE masque ce message :
       on le DÉMARQUE, sinon .pap-ev-empty (display:flex !important)
       afficherait une carte vide à côté de la liste. */
    if (isHidden(note) || !p || !/[ée]valuation/i.test(p.textContent || '')) {
      unmark(note, 'pap-ev-empty', 'papEvEmpty');
      const ico = note.querySelector('.pap-ev-empty-icon');
      if (ico) ico.remove();
      const pill = note.querySelector('.pap-ev-empty-periode');
      if (pill) pill.remove();
      return;
    }

    addClass(note, 'pap-ev-empty', 'papEvEmpty');

    const ico = icon('ghost');
    if (ico && !note.querySelector('.pap-ev-empty-icon')) {
      const span = svgWrap(ico, 'ghost');
      span.className = 'pap-ev-empty-icon papillon-icon';
      note.prepend(span);
    }

    /* Pastille de période (« Trimestre 1 ») : lue dans le sélecteur
       du troisième menu, le message de PRONOTE n'en contenant pas. */
    const periode = periodLabel();
    if (!periode) {
      const stale = note.querySelector('.pap-ev-empty-periode');
      if (stale) stale.remove();
      return;
    }
    let pill = note.querySelector('.pap-ev-empty-periode');
    if (!pill) {
      pill = document.createElement('span');
      pill.className = 'pap-ev-empty-periode';
      pill.setAttribute('aria-hidden', 'true');
      note.appendChild(pill);
    }
    /* ⚠ Écriture UNIQUEMENT si le texte diffère : l'observateur body
       (childList) se redéclencherait sinon sur chaque passage, ce
       qui boucle à l'infini et gèle l'onglet. */
    if (pill.textContent !== periode) pill.textContent = periode;
  }

  function periodLabel() {
    const el = document.querySelector(
      '#ligne_bandeau.objetBandeauEntete_thirdmenu .ocb-libelle'
    );
    return el ? (el.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  /* Hors de la page : on retire TOUTES nos marques, où qu'elles
     soient, et les nœuds injectés (icône, pastille) : le <main> et
     le widget sont réutilisés d'une page à l'autre. On ne cible que
     nos propres classes pap-ev-*, pour ne jamais toucher aux marques
     d'un autre module. Le drapeau évite de reparcourir le DOM à
     chaque mutation, sauf au boot où le balayage est forcé. */
  let marked = false;

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    unmark(document.querySelector(MAIN_EL), 'pap-ev', 'papEv');
    unmark(document.querySelector('.pap-ev-grid'), 'pap-ev-grid', 'papEvGrid');
    unmark(document.querySelector('.pap-ev-list'), 'pap-ev-list', 'papEvList');
    unmark(document.querySelector('.pap-ev-detail'), 'pap-ev-detail', 'papEvDetail');

    document.querySelectorAll('.pap-ev-detail-vide').forEach((el) => {
      unmark(el, 'pap-ev-detail-vide', 'papEvDetailVide');
    });

    document.querySelectorAll('.pap-ev-objet').forEach((el) => {
      unmark(el, 'pap-ev-objet', 'papEvObjet');
    });

    document.querySelectorAll('.pap-ev-empty').forEach((note) => {
      unmark(note, 'pap-ev-empty', 'papEvEmpty');
    });

    document
      .querySelectorAll('.pap-ev-empty-icon, .pap-ev-empty-periode')
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
    markLayout();
    markDetailVide();
    markListe();
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

      /* Recapter les re-rendus de PRONOTE (changement de période,
         publication d'une évaluation, sélection d'une ligne) */
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
