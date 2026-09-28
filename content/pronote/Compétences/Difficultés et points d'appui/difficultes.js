/* ============================================================
   PAGE COMPÉTENCES — « DIFFICULTÉS ET POINTS D'APPUI » (JS)
   Cible : page « Compétences → Évaluations → Difficultés et points
   d'appui » PRONOTE, repérée par son fil d'Ariane
   h1#breadcrumbBandeau[aria-label="Difficultés et points d'appui"].

   Cette page affiche DEUX panneaux empilés, un par niveau de maîtrise
   (d'après le DOM réellement observé, période sans compétence) :

     main.interface_affV_client
       div.SuiviResultatsCompetences.interface_affV
         div#…_pageDonnees.PageDonnees.interface_affV_client
           div#…_pageDonneesEleve.PageDonneesEleve
             div.PanelDonneesEleveListe.m-bottom-l
               div.BandeauTitreTypeResultats  « Compétences non maîtrisées : 0 »
               div > div.ObjetListe … .DonneesListe_SuiviResultatsCompEleve.vide
             div.PanelDonneesEleveListe
               div.BandeauTitreTypeResultats  « Compétences maîtrisées : 0 »
               div > div.ObjetListe … .DonneesListe_SuiviResultatsCompEleve.vide

    Ce que fait le module :
    1. pose le marquage idempotent .pap-dp sur le <main> de la page ;
    2. pose les deux cartes (.pap-dp-panel) côte à côte et leur pastille
       d'icône (.pap-dp-neg pour les compétences non maîtrisées,
       .pap-dp-pos pour les compétences maîtrisées) ;
    3. transforme chaque liste VIDE (PRONOTE la marque .vide et ne pose
       alors qu'un tableau squelette : barre d'outils, colonnes
       « Items / Évaluations » et viewport vide) en bloc d'état vide
       Papillon — icône papicon + message + pastilles de période et de
       cycle — injecté DANS la carte, sous le titre natif, le squelette
       natif étant masqué au CSS (une seule carte, pas deux imbriquées) ;
    4. habille, quand elles existent, les lignes de la grille
       (colonnes figées en inline à 417px/416px, viewport figé à
       40px) et neutralise les dimensions figées pour que rien ne
       déborde de la carte.

   Le restyle est porté par difficultes.css, le thème
   (html.papillon-dark) par pronote.js.

   Aucun comportement natif n'est modifié : les sélecteurs de période
   et de cycle du troisième menu, la recherche, le pliage de la liste
   et les boutons d'enregistrement / PDF du second menu.

   PIÈGE 1 — ancre en ÉGALITÉ STRICTE sur « Difficultés et points
   d'appui ». Elle ne matche ni l'ancêtre « Détail de mes
   évaluations » (mesevaluations.js) ni les cinq ancres Notes : les
   sept modules restent mutuellement exclusifs. Ne pas élargir
   l'ancre en regex — « Difficultés et points d'appui » ne contient ni
   « Détail de mes évaluations » ni « Détail de mes notes », mais une
   regex careless capturerait d'autres pages Compétences.

   PIÈGE 2 — le <main> et #…_pageDonneesEleve sont RÉUTILISÉS d'une
   page à l'autre : le module dé-classe toutes ses marques hors de sa
   page (demark) et retire les nœuds qu'il a injectés, sinon
   difficultes.css continuerait de s'appliquer chez la voisine (fond
   de page, cartes, boutons du second menu). Balayage forcé au boot,
   car après un rechargement de l'extension les modules re-s'exécutent
   sur un DOM déjà marqué.

   PIÈGE 3 — le fil d'Ariane peut être réécrit EN PLACE (même <h1>,
   aria-label changé) : les observateurs childList ne le voient pas,
   d'où watchBreadcrumb() qui surveille l'attribut et ré-attache
   l'observateur quand PRONOTE remplace le nœud.

   PIÈGE 4 — deux sélecteurs dans le troisième menu (« Sélectionner
   une période » PUIS « Sélectionnez un cycle ») : il ne faut surtout
   pas lire le PREMIER .ocb-libelle en aveugle pour la pastille, on
   cible chaque sélecteur par son aria-label (cf. selectLabel()).

   PIÈGE 5 — ne jamais styler les <li> de .menu-commandes : le
   troisième porte la bannière « Consultation temporaire » que
   PRONOTE masque en display:none, et un display:flex !important la
   ferait réapparaître. On n'agit que sur les <i class="btnImage">.

    PIÈGE 6 — PRONOTE masque deux blocs de cette page avec un
    display:none en ligne (#…_pageMessage et #…_pageDonneesClasse, le
    panneau « données de la classe ») : cette feuille ne les stylise
    surtout pas, sinon une règle !important révélerait un bloc vide.

    PIÈGE 7 — l'état vide d'une liste est signalé par la CLASSE .vide
    (et la hauteur du viewport est recalculée dans son style) : ce sont
    des mutations d'ATTRIBUT, qu'un observateur `childList` ne voit
    JAMAIS. Les deux panneaux n'étant pas rendus d'un seul coup, le
    second restait donc avec son tableau natif (largeurs 845px/833px,
    viewport figé) pour le reste de la session. D'où les trois
    précautions de onMutations() : observer `attributes` en plus de
    `childList`, ne relancer que sur une mutation qui nous concerne
    (les deux cartes ou le troisième menu) et une seule fois par image,
    et poser les observateurs AVANT le premier processAll() — protégé
    par un try/catch — pour qu'une exception survenue trop tôt ne
    les empêche jamais d'exister. La mise en page de difficultes.css
    est en outre scopée sur .pap-dp-panel et non sur un marqueur de
    liste, pour qu'un panneau non traité reste correct.

   DOM NON ENCORE CONNU — le contenu d'une ligne de compétence (le
   tableau des compétences est vide sur toutes les périodes testées,
   .ObjetListe.vide). Tant qu'aucune période n'affiche de compétence,
   la feuille ne style QUE le squelette (cartes, état vide, largeurs,
   en-têtes de colonnes) : le restyle des lignes est à faire d'après
   un DOM peuplé, comme le bulletin de releve.css.
   ============================================================ */

(() => {
  'use strict';

  /* Libellé exact du fil d'Ariane de la page */
  const PAGE_LABEL = "Difficultés et points d'appui";

  const ICON_CACHE = new Map();
  const ICON_FILES = {
    ghost: 'papicons/ghost.svg',
    cross: 'papicons/cross.svg',
    check: 'papicons/check.svg',
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

  /* Sélecteurs de la page. Tout ce qui est dans le <main> est donc
     ancré sur .pap-dp, qu'on pose en premier ; les sélecteurs de
     demark() ciblent à l'inverse les classes pap-dp-* elles-mêmes,
     pour retrouver les marques même après la navigation. */
  const MAIN_EL = 'main.interface_affV_client';
  const MAIN = MAIN_EL + '.pap-dp';
  const ROOT = MAIN + ' .SuiviResultatsCompetences';
  const PAGES = ROOT + ' .PageDonnees';
  const ELEVES = PAGES + ' .PageDonneesEleve';
  const PANEL = ELEVES + ' .PanelDonneesEleveListe';
  const LIST = PANEL + ' .ObjetListe';

  /* Racine de page : le <main> PRONOTE porte la classe, ce qui permet
     à difficultes.css de cibler .interface_affV:has(.pap-dp)
     (le wrapper est un ancêtre, pas un descendant). */
  function markPage() {
    addClass(document.querySelector(MAIN_EL), 'pap-dp', 'papDp');
  }

  /* Les deux panneaux deviennent deux cartes côte à côte, chacune
     avec sa pastille d'icône : croix pour les compétences non
     maîtrisées (difficultés), coche pour les compétences maîtrisées
     (points d'appui). Le libellé et le compte « : 0 » restent le
     texte NATIF de PRONOTE — on ne réécrit jamais textContent, on
     injecte seulement la pastille d'icône devant lui. */
  function processPanel(panel) {
    addClass(panel, 'pap-dp-panel', 'papDpPanel');

    const titre = panel.querySelector('.BandeauTitreTypeResultats');
    const texte = ((titre ? titre.textContent : panel.textContent) || '')
      .replace(/\s+/g, ' ')
      .trim();
    /* « Compétences non maîtrisées » contient aussi « maîtrisées » :
       c'est donc « non maîtrisées » qu'il faut tester en premier. */
    const difficile =
      /non\s+ma[îi]tris/i.test(texte) || /difficult/i.test(texte) || /appui/i.test(texte);

    panel.classList.toggle('pap-dp-neg', difficile);
    panel.classList.toggle('pap-dp-pos', !difficile);
    if (difficile) panel.dataset.papDpNiveau = 'neg';
    else delete panel.dataset.papDpNiveau;

    markPuce(panel, titre, difficile);
  }

  /* Pastille d'icône de la carte, injectée dans le titre natif. */
  function markPuce(panel, titre, difficile) {
    const nom = difficile ? 'cross' : 'check';
    if (!titre) return;

    let puce = panel.querySelector('.pap-dp-puce');
    if (puce && puce.dataset.papicon !== nom) {
      puce.remove();
      puce = null;
    }
    const ico = icon(nom);
    if (puce || !ico) return;

    puce = svgWrap(ico, nom);
    puce.className = 'pap-dp-puce papillon-icon';
    titre.insertBefore(puce, titre.firstChild);
  }

  function processPanels() {
    document.querySelectorAll(PANEL).forEach(processPanel);
  }

  /* ---------- Les listes ----------
     PRONOTE fige la largeur de toute la chaîne de la liste en inline
     (845px sur .liste_zone / .liste_btnentete, 833px sur la grille et
     son contenu) et la hauteur du viewport (#…_Zone_1) à 40px : le
     CSS rend tout cela fluide, pour que rien ne déborde de la carte.

     La mise en page est portée par la CARTE (.pap-dp-panel) et non par
     un marqueur posé sur la liste : PRONOTE peut remplacer le nœud
     .ObjetListe entre deux rendus, et une liste non marquée doit
     rester aussi belle que les autres. */
  function processLists() {
    document.querySelectorAll(PANEL).forEach((panel) => {
      const list = panel.querySelector('.ObjetListe');
      if (!list) {
        unmark(panel, 'pap-dp-panel-vide', 'papDpPanelVide');
        unmarkEmpty(panel);
        return;
      }

      /* Liste vide : PRONOTE la marque .vide et ne remplit alors aucun
         tableau (juste la barre d'outils, les colonnes et un viewport
         vide). On masque ce squelette et on affiche l'état vide. */
      const rows = list.querySelectorAll('.liste_content_lignes > .fd_ligne');
      const vide = list.classList.contains('vide') || rows.length === 0;

      if (vide) markEmpty(panel, list);
      else unmarkEmpty(panel);
    });
  }

  /* ---------- État vide ----------
     PRONOTE n'écrit aucun message : la carte vide est donc entièrement
     construite par ce module (icône + message + pastilles de période
     et de cycle, lues dans le troisième menu). Elle est injectée dans
     le .ObjetListe — que PRONOTE peut re-rendre à tout moment, auquel
     cas l'observateur la repose. */
  const EMPTY_MSG = {
    neg: 'Aucune compétence non maîtrisée',
    pos: 'Aucune compétence maîtrisée',
  };

  function markEmpty(panel, list) {
    addClass(panel, 'pap-dp-panel-vide', 'papDpPanelVide');

    let vide = list.querySelector('.pap-dp-empty');
    /* ⚠ Ne JAMAIS re-appendre une carte déjà en place : appendChild()
       déplace le nœud (il redevient le dernier enfant), ce qui émet une
       mutation childList, donc un nouveau processAll(), donc une boucle
       infinie qui gèle l'onglet. */
    if (!vide) {
      vide = document.createElement('div');
      vide.className = 'pap-dp-empty';
      vide.setAttribute('role', 'note');
      list.appendChild(vide);
    }

    const difficile = panel.classList.contains('pap-dp-neg');
    const msg = EMPTY_MSG[difficile ? 'neg' : 'pos'];

    const ico = icon('ghost');
    if (ico && !vide.querySelector('.pap-dp-empty-icon')) {
      const span = svgWrap(ico, 'ghost');
      span.className = 'pap-dp-empty-icon papillon-icon';
      vide.prepend(span);
    }

    let texte = vide.querySelector('.pap-dp-empty-msg');
    if (!texte) {
      texte = document.createElement('p');
      texte.className = 'pap-dp-empty-msg';
      vide.appendChild(texte);
    }
    /* ⚠ Écriture UNIQUEMENT si le texte diffère : l'observateur body
       (childList) se redéclencherait sinon sur chaque passage, ce qui
       boucle à l'infini et gèle l'onglet. */
    if (texte.textContent !== msg) texte.textContent = msg;

    markMeta(vide);
  }

  function unmarkEmpty(panel) {
    unmark(panel, 'pap-dp-panel-vide', 'papDpPanelVide');
    const list = panel.querySelector('.ObjetListe');
    const vide = list && list.querySelector('.pap-dp-empty');
    if (vide) vide.remove();
  }

  /* Pastilles de contexte (« Trimestre 1 », « Cycle 4 ») : le tableau
     vide de PRONOTE n'en contient aucune, et le troisième menu de
     cette page porte DEUX sélecteurs — il faut donc les cibler par leur
     aria-label, pas par leur position. */
  function markMeta(vide) {
    const valeurs = [
      selectLabel('Sélectionner une période'),
      selectLabel('Sélectionnez un cycle'),
    ].filter(Boolean);

    let meta = vide.querySelector('.pap-dp-meta');
    if (!valeurs.length) {
      if (meta) meta.remove();
      return;
    }
    if (!meta) {
      meta = document.createElement('span');
      meta.className = 'pap-dp-meta';
      meta.setAttribute('aria-hidden', 'true');
      vide.appendChild(meta);
    }
    /* Une pastille par valeur, dans l'ordre, sans jamais réécrire un
       texte identique (cf. plus haut). */
    while (meta.children.length > valeurs.length) meta.lastChild.remove();
    valeurs.forEach((val, i) => {
      let pill = meta.children[i];
      if (!pill) {
        pill = document.createElement('span');
        pill.className = 'pap-dp-meta-pill';
        meta.appendChild(pill);
      }
      if (pill.textContent !== val) pill.textContent = val;
    });
  }

  function selectLabel(re) {
    const labels = Array.from(
      document.querySelectorAll(
        '#ligne_bandeau.objetBandeauEntete_thirdmenu .ocb-libelle[aria-label]'
      )
    );
    const hit = labels.find((n) => re.test(n.getAttribute('aria-label') || ''));
    return hit ? (hit.textContent || '').replace(/\s+/g, ' ').trim() : '';
  }

  /* ---------- Lignes de la grille ----------
     La grille est en DEUX colonnes (« Items » et « Évaluations »,
     figées à 417px/416px en inline) et le viewport à 40px : on rend
     les deux fluides et on borne le défilement dans la carte. Le
     CONTENU d'une ligne n'est pas encore connu (aucune période
     n'affiche de compétence) : on se contente d'un habillage générique
     de pilule, à compléter d'après un DOM peuplé. */
  function processRows() {
    document
      .querySelectorAll(LIST + ' .liste_content_lignes > .fd_ligne')
      .forEach((row) => {
        addClass(row, 'pap-dp-row', 'papDpRow');
      });
  }

  /* Hors de la page : on retire TOUTES nos marques, où qu'elles
     soient, et les nœuds injectés (puce d'icône, état vide) : le
     <main> et les panneaux sont réutilisés d'une page à l'autre. On ne
     cible que nos propres classes pap-dp-*, pour ne jamais toucher aux
     marques d'un autre module. Le drapeau évite de reparcourir le DOM
     à chaque mutation, sauf au boot où le balayage est forcé. */
  let marked = false;

  function demark(force) {
    if (!force && !marked) return;
    marked = false;

    unmark(document.querySelector(MAIN_EL), 'pap-dp', 'papDp');

    document.querySelectorAll('.pap-dp-panel').forEach((el) => {
      unmark(el, 'pap-dp-panel', 'papDpPanel');
    });

    document.querySelectorAll('.pap-dp-neg, .pap-dp-pos').forEach((el) => {
      el.classList.remove('pap-dp-neg', 'pap-dp-pos');
    });
    document.querySelectorAll('[data-pap-dp-niveau]').forEach((el) => {
      delete el.dataset.papDpNiveau;
    });

    document.querySelectorAll('.pap-dp-panel-vide').forEach((el) => {
      unmark(el, 'pap-dp-panel-vide', 'papDpPanelVide');
    });

    document.querySelectorAll('.pap-dp-row').forEach((el) => {
      unmark(el, 'pap-dp-row', 'papDpRow');
    });

    /* Les noeuds injectés (puce d'icône, carte d'état vide) sont créés
       par ce module : on les retire, sans quoi ils survivraient,
       orphelins et figés, au re-rendu de PRONOTE. */
    document.querySelectorAll('.pap-dp-puce, .pap-dp-empty').forEach((node) => node.remove());
  }

  /* Un passage qui lève (bug de script, nœud retiré par PRONOTE au
     milieu du parcours) ne doit surtout pas laisser la page à moitié
     traitée : les observateurs sont posés AVANT le premier passage et
     chaque passage est protégé. Sans cela, une exception survenue au
     tout premier processAll() suffisait à ce qu'aucun observateur ne
     soit jamais posé — les deux panneaux restaient alors dans des
     états différents pour le reste de la session. */
  function processAll(force) {
    try {
      watchBreadcrumb();
      if (!onPage()) {
        demark(force);
        return;
      }
      marked = true;
      markPage();
      processPanels();
      processLists();
      processRows();
    } catch (e) {
      /* On ne bloque jamais la page : le prochain passage reprendra. */
    }
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

  /* ---------- Réactions aux mutations de PRONOTE ----------
     PRONOTE fait bouger la page en continu (re-rendu d'une liste, bascule
     de .vide, recalcul de la hauteur du viewport, changement de période
     ou de cycle) : on observe le corps en childList ET en attributs, mais
     on ne relance un passage que pour une mutation qui nous concerne
     (la zone des deux cartes, ou le troisième menu d'où viennent les
     pastilles), et une seule fois par image — sinon le simple survol
     d'une ligne, qui pose des classes, ferait repasser tout le monde. */
  const ZONE = '.pap-dp-panel, .ObjetListe, .BandeauTitreTypeResultats, .liste_zoneFils, #ligne_bandeau';

  function mutationTouchesPage(mutations) {
    return mutations.some((m) => {
      const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      return !!el && typeof el.closest === 'function' && !!el.closest(ZONE);
    });
  }

  let pending = 0;

  function onMutations(mutations) {
    if (!mutationTouchesPage(mutations)) return;
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      processAll();
    });
  }

  function init() {
    Promise.all(Object.keys(ICON_FILES).map((k) => loadIcon(k))).then(() => {
      /* ⚠ Les observateurs sont posés AVANT le premier processAll() :
         une exception levée par ce premier passage (avant que le
         second panneau soit rendu par PRONOTE) ne doit pas les
         empêcher d'exister, sinon plus rien ne re-traiterait la page. */
      new MutationObserver(onMutations)
        .observe(document.body, {
          childList: true,
          subtree: true,
          /* ⚠ PRONOTE signale l'état vide d'une liste en basculant la
             CLASSE .vide, et recalcule la hauteur du viewport en
             écrivant son style : ce sont des mutations d'ATTRIBUT, que
             le seul childList ne voit jamais. Sans cette surveillance,
             le second panneau restait avec son tableau natif (largeurs
             845px/833px figées) pour toute la session. */
          attributes: true,
          attributeFilter: ['class', 'style'],
        });

      /* Re-traiter si le thème change (reprocess idempotent) */
      new MutationObserver(() => processAll())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      /* Balayage initial forcé : le <main> peut déjà porter un résidu
         d'un module passé (après un rechargement de l'extension, les
         modules re-s'exécutent sur un DOM déjà marqué). */
      processAll(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
