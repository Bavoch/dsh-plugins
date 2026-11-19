/**
 * Client half, project identity and status in the sidebar:
 *
 *  1. Keep a project icon in front of every session row, in every state.
 *  2. Move the row's status marker to the trailing edge.
 *  3. Hide the relative time while that row shows a status marker, and hide the
 *     marker itself while the row is hovered (the hover strip takes its place).
 *  4. Paint the same project icon into the workspace (project) row, in place of
 *     the shipped folder glyph, so a project is identified by its own artwork
 *     rather than by a generic folder.
 *  5. Show the session's project name and path in its native hover card.
 *
 * Why the icon is painted here at all: `ui-workspace` renders the row's leading
 * cell as an either/or —
 *
 *   showStatus ? <SessionStatusDots/> : renderSlot('sidebar.session.row.leading')
 *
 * so once a row is running, waiting, or freshly done, the icon seat is not
 * mounted and no stylesheet can bring it back. A running row would therefore
 * lose its icon exactly when the user is looking for it.
 *
 * Implementation: the row is `display:flex`. The stylesheet reserves a fixed
 * gutter at the row's start, pushes the status marker to the trailing edge with
 * `order`, and hides the time while a marker is present. The icon is a
 * `::before` pseudo-element in that gutter, driven by per-row custom properties
 * (`--rsr-url` / `--rsr-letter`) set with `style.setProperty`.
 *
 * Why a pseudo-element rather than an inserted node: a session row is a React
 * element that re-renders constantly while it runs (status/clock ticks) and on
 * pointer-enter (the title marquee arms on hover). Any DOM node appended into it
 * by hand is dropped on each of those renders, which is exactly why the icon
 * used to vanish while a task ran and while the row was hovered. A generated
 * pseudo-element is not in React's child list, so it survives every re-render;
 * the custom properties live in the row's inline style, which React leaves alone
 * because the row carries no `style` prop.
 *
 * Selectors use structure (`:first-child`, sibling position) and stable
 * attributes (`data-row-key`, `data-state`), never ui-workspace's hashed class
 * names, which change whenever that package is rebuilt.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-project-icons',
  factory(require) {
    const { createElement: h } = require('react');
    const { IconFolderCloseRegular } = require('@deepseek-ai/dsh-client-ui-primitives');
    const LOCALE = 'project-icons';
    const HOVER_SLOT = 'sidebar.session.row.hover';
    const SIDEBAR_HANDLE = '[data-side="sidebar"]';
    const SIDEBAR_MIN_WIDTH = 176;
    const SIDEBAR_SIZE = `[data-dsh-sidebar-size]:has(> ${SIDEBAR_HANDLE})`;

    function workspaceForSession(workspaces, sessionId) {
      return workspaces.items.find((item) => item.sessionIds.includes(sessionId));
    }

    function ProjectLine({ sessionId, useWorkspaces, t }) {
      const workspaces = useWorkspaces((snapshot) => snapshot);
      const workspace = workspaceForSession(workspaces, sessionId);
      if (workspace === undefined) return null;

      const trimmedPath = workspace.path.replace(/[/\\]+$/, '');
      const lastSeparator = Math.max(trimmedPath.lastIndexOf('/'), trimmedPath.lastIndexOf('\\'));
      const projectName = trimmedPath.slice(lastSeparator + 1);
      return h('div', { className: 'dsh-hover-project', title: workspace.path }, [
        h(IconFolderCloseRegular, { key: 'icon', size: 14 }),
        h('span', { key: 'name', className: 'dsh-hover-project-name' }, projectName),
        h('span', { key: 'role', className: 'dsh-hover-project-role' }, t('tip.project')),
      ]);
    }

    /**
     * The Host asset route, as an absolute URL.
     *
     * A page whose own route is not the site root would resolve `/api/...`
     * against the wrong base and the request would never reach the Host, so the
     * path is anchored to the origin the page was served from.
     * @param pathname - one registered Host route.
     * @param query - its query string, without the leading `?`.
     * @returns the absolute URL to fetch.
     */
    const hostUrl = (pathname, query) => `${window.location.origin}${pathname}?${query}`;

    const ROUTE = '/api/project-icon';
    /**
     * The route used while a row's directory is still unknown.
     *
     * The session catalog already names every Session's directory, but a step
     * refresh may deliver a page whose rows have no owning project yet. This
     * route resolves the directory from the persisted Session log instead, so a
     * row keeps real artwork rather than falling back to the letter tile. The
     * two routes only differ in how the directory is found, so both are served
     * by the same Host handler.
     */
    const SESSION_ROUTE = '/api/session-icon';
    const ROW = '[role="treeitem"][data-row-key^="session:"]';
    /** One workspace (project) row; its leading cell holds the folder glyph. */
    const WORKSPACE_ROW = '[role="treeitem"][data-row-key^="workspace:"]';
    /** Presence marks a workspace row whose leading cell shows real artwork. */
    const WORKSPACE_ARTWORK = 'data-workspace-icon';

    /**
     * The stylesheet.
     *
     * The leading cell keeps its place in the DOM but collapses to zero width,
     * so the shipped 16px box never eats space next to the icon gutter; when it
     * holds a status marker it moves to the end and regains its width there.
     */
    const STYLESHEET = `
${SIDEBAR_SIZE} {
  grid-template-columns: var(--dsh-sidebar-width) var(--dsh-sidebar-other-tracks) !important;
}
html[data-windows-titlebar] ${SIDEBAR_SIZE} {
  --dsh-windows-sidebar-width: var(--dsh-sidebar-width) !important;
}
${SIDEBAR_SIZE} > ${SIDEBAR_HANDLE} { left: var(--dsh-sidebar-width) !important; }
${SIDEBAR_SIZE} > * > [data-slot="sidebar"] > div { width: var(--dsh-sidebar-width) !important; }
[data-dsh-sidebar-resizing],
[data-dsh-sidebar-resizing] > ${SIDEBAR_HANDLE} { transition: none !important; }

${ROW} {
  --rsr-icon-size: 16px;
  --rsr-icon-gap: 6px;
  position: relative;
  padding-inline-start: calc(var(--dsh-workspace-indent, 0px) + 8px + var(--rsr-icon-size) + var(--rsr-icon-gap)) !important;
}

/* Cell 1 collapses: the icon gutter above replaces it, and any glyph it holds
   (a status marker) is moved to the end below. */
${ROW} > :first-child {
  width: 0 !important;
  min-width: 0 !important;
  margin-inline: 0 !important;
  overflow: visible;
  justify-content: flex-start !important;
}

/* 1. A status marker jumps to the trailing edge of the row. */
${ROW} > :first-child:has([data-state]) {
  order: 9;
  width: auto !important;
  margin-inline-start: auto !important;
  padding-inline-start: 6px;
}

/* 2. The marker keeps its own size; it is only repositioned. */
${ROW} > :first-child:has([data-state]) > [data-state] { flex: none; }

/* 3. A row showing a non-idle status hides its relative time. */
${ROW}:has([data-state]:not([data-state="idle"])) > :nth-child(3) { display: none !important; }

/* 4. A pinned row keeps its pin glyph before the trailing marker. */
${ROW} > :nth-child(4) { order: 8; }

/* 5. The hover strip stays last, so it can replace the marker in place. */
${ROW} > :nth-child(5) { order: 10; }

/* 6. Hovering a row hides its status marker: the hover strip takes that spot,
   so the two would otherwise stack on the trailing edge. */
${ROW}:hover > :first-child:has([data-state]) { display: none !important; }

/* 7. The row never shows a time label on hover either — the marker and the
   hover strip own the trailing edge, and a timestamp beside them reads as
   clutter. This also covers rows whose marker was hidden by rule 6. */
${ROW}:hover > :nth-child(3) { display: none !important; }

/* The project icon cell, painted as a pseudo-element.
   It used to be a DOM node appended into the row, but a row is a React element
   that re-renders on every status tick while a task runs and again on
   pointer-enter (the title marquee arms on hover) — and each render drops the
   foreign child it never rendered itself, so the icon vanished exactly when the
   user was looking for it (running, or hovering). A generated pseudo-element is
   not part of React's child list and survives every re-render, so it stays put
   while the session runs and while the row is hovered. Its content comes from
   per-row custom properties written with Element.style.setProperty, which
   React does not manage (the row carries no style prop), so they persist too.

   Artwork only, never interactive; it sits in a reserved gutter at the row
   start (see the padding above), above every row cell. */
${ROW}::before {
  content: var(--rsr-letter, "");
  position: absolute;
  inset-inline-start: calc(var(--dsh-workspace-indent, 0px) + 8px);
  top: 50%;
  transform: translateY(-50%);
  width: var(--rsr-icon-size);
  height: var(--rsr-icon-size);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  /* Letter fallbacks read as a round avatar; a real project icon is drawn on
     the square slot but the tile colour stays transparent, so the rounded
     shape never shows behind artwork. */
  border-radius: 50%;
  box-sizing: border-box;
  background-image: var(--rsr-url, none);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  background-color: var(--rsr-tile-bg, transparent);
  color: var(--rsr-tile-fg, var(--dsw-alias-label-tertiary));
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  pointer-events: none;
  z-index: 3;
  user-select: none;
}

/* The workspace (project) row already reserves a 16px folder cell at its own
   indented start, so the project's artwork is painted into that cell instead of
   opening a second gutter: the row keeps its geometry, and the shipped hover
   swap to the expand chevron still owns exactly the same cell. The cell is
   addressed structurally (first child of the row) because ui-workspace's class
   names are hashed and change whenever that package is rebuilt. */
${WORKSPACE_ROW}[${WORKSPACE_ARTWORK}] > :first-child {
  background-image: var(--wsr-url, none);
  background-size: 16px 16px;
  background-position: center;
  background-repeat: no-repeat;
}

/* The shipped folder glyph would otherwise draw on top of the artwork. */
${WORKSPACE_ROW}[${WORKSPACE_ARTWORK}] > :first-child > svg { display: none !important; }

.dsh-hover-project {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: #cfd3d6;
  font-size: 12px;
  line-height: 16px;
}

.dsh-hover-project > svg {
  flex: none;
  opacity: 0.8;
}

.dsh-hover-project-name {
  min-width: 0;
  color: #ffffff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dsh-hover-project-role {
  flex: none;
  color: #adb2b8;
}
`;

    /** First character of a project name, used when it has no icon. */
    const initialOf = (label) => {
      const trimmed = typeof label === 'string' ? label.trim() : '';
      return trimmed === '' ? '?' : Array.from(trimmed)[0].toUpperCase();
    };

    /** The icon URL the Host serves for one project directory. */
    const iconUrl = (projectPath) => hostUrl(ROUTE, `path=${encodeURIComponent(projectPath)}`);

    /**
     * A stable, well-spread colour for a project's letter tile.
     *
     * Hashes the project key (path, else label) to a hue, then fixes a
     * medium saturation and a mid lightness, so tiles are distinguishable from
     * one another without shouting, yet stay legible behind white text in both
     * light and dark themes. Deterministic: the same project always gets the
     * same colour.
     * @param key - the project's path or label.
     * @returns an `hsl(...)` colour string.
     */
    /**
     * A six-entry palette of medium-saturation tiles.
     *
     * A fixed set (rather than a free hue) keeps the sidebar's colours
     * intentional and balanced: six well-separated hues at the same medium
     * saturation and lightness, so any two projects read as different chips
     * without any of them shouting. Projects map onto entries by a stable hash.
     * @type {readonly number[]}
     */
    const TILE_HUES = Object.freeze([210, 160, 45, 340, 265, 20]);

    const tileColour = (key) => {
      const text = typeof key === 'string' && key !== '' ? key : '?';
      let hash = 0;
      for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
      }
      const hue = TILE_HUES[hash % TILE_HUES.length];
      return `hsl(${hue} 42% 48%)`;
    };

    /**
     * The letter colour that reads against a given tile background.
     *
     * Parses the tile's own HSL and flips the text between near-black and
     * near-white by the background's relative luminance (WCAG), so a light tile
     * gets dark letters and a dark tile gets light letters — never a fixed white
     * that disappears on pale hues.
     * @param bg - the `hsl(h s% l%)` string written to `--rsr-tile-bg`.
     * @returns a legible text colour.
     */
    const readableOn = (bg) => {
      const match = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/.exec(String(bg));
      if (match === null) return 'var(--dsw-alias-label-primary)';
      const hue = Number(match[1]);
      const light = Number(match[3]);
      // Same-hue twin of the tile, not black/white: a light, more saturated
      // tint on the medium-dark tile (or a deep, saturated shade if the tile is
      // ever painted light), so the letter stays harmonious with its own colour
      // and still clears the tile behind it.
      return light <= 55
        ? `hsl(${hue} 75% 88%)`  /* pale, vivid tint of the same hue */
        : `hsl(${hue} 70% 22%)`; /* deep, vivid shade of the same hue */
    };

    function installSidebarResize(ctx) {
      const listeners = new AbortController();
      let sizing;
      let drag;
      let pendingFrame = 0;

      const nativeTracks = frame => /^(\d+(?:\.\d+)?)px\s+(.+)$/.exec(frame.style.gridTemplateColumns);
      const clearWidth = frame => {
        if (!frame.hasAttribute('data-dsh-sidebar-size')) return;
        frame.removeAttribute('data-dsh-sidebar-size');
        frame.style.removeProperty('--dsh-sidebar-width');
        frame.style.removeProperty('--dsh-sidebar-other-tracks');
      };
      const syncWidth = () => {
        if (!sizing) return;
        const { frame, layout, width, nativeWidth } = sizing;
        if (!frame.isConnected || (!drag && layout.getSnapshot().layoutInfo.sidebar !== nativeWidth)) {
          observer.disconnect();
          clearWidth(frame);
          sizing = undefined;
          return;
        }
        const tracks = nativeTracks(frame);
        if (!tracks || Number(tracks[1]) === width) {
          clearWidth(frame);
          return;
        }
        const cssWidth = `${width}px`;
        if (frame.style.getPropertyValue('--dsh-sidebar-width') !== cssWidth) {
          frame.style.setProperty('--dsh-sidebar-width', cssWidth);
        }
        if (frame.style.getPropertyValue('--dsh-sidebar-other-tracks') !== tracks[2]) {
          frame.style.setProperty('--dsh-sidebar-other-tracks', tracks[2]);
        }
        frame.toggleAttribute('data-dsh-sidebar-size', true);
      };
      const observer = new MutationObserver(syncWidth);

      const resizeTo = x => {
        if (!drag || !sizing) return;
        const requestedWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.round(drag.startWidth + x - drag.startX));
        if (requestedWidth === sizing.width) return;
        sizing.layout.actions.setSidebar(requestedWidth);
        sizing.nativeWidth = sizing.layout.getSnapshot().layoutInfo.sidebar;
        sizing.width = Math.min(requestedWidth, sizing.nativeWidth);
        syncWidth();
      };
      const endDrag = () => {
        if (!drag) return;
        const { frame, handle, pointerId } = drag;
        drag = undefined;
        cancelAnimationFrame(pendingFrame);
        pendingFrame = 0;
        if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        frame.removeAttribute('data-dsh-sidebar-resizing');
        syncWidth();
      };
      const startDrag = event => {
        if (drag || event.button !== 0 || event.defaultPrevented) return;
        const handle = event.target instanceof Element ? event.target.closest(SIDEBAR_HANDLE) : null;
        const frame = handle?.parentElement;
        if (!frame?.querySelector(':scope > [data-shell-bottom]') || !nativeTracks(frame)) return;
        // The root registration exposes the same bound layout store used by DSH's handle.
        const entry = ctx.slots.entries('root').find(({ options }) => options.children?.sidebar && options.children?.rightbar);
        const layout = entry?.options.store?.create?.();
        if (typeof layout?.actions?.setSidebar !== 'function' || typeof layout.getSnapshot !== 'function') return;
        const width = parseFloat(getComputedStyle(frame).gridTemplateColumns);
        if (!Number.isFinite(width) || width <= 0) return;

        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
        if (sizing && sizing.frame !== frame) clearWidth(sizing.frame);
        sizing = { frame, layout, width, nativeWidth: layout.getSnapshot().layoutInfo.sidebar };
        drag = { frame, handle, pointerId: event.pointerId, startWidth: width, startX: event.clientX, latestX: event.clientX };
        observer.disconnect();
        observer.observe(frame, { attributes: true, attributeFilter: ['style'], childList: true });
        frame.setAttribute('data-dsh-sidebar-resizing', '');
      };
      const moveDrag = event => {
        if (drag?.pointerId !== event.pointerId) return;
        drag.latestX = event.clientX;
        if (pendingFrame) return;
        pendingFrame = requestAnimationFrame(() => {
          pendingFrame = 0;
          if (drag) resizeTo(drag.latestX);
        });
      };
      const finishDrag = event => {
        if (drag?.pointerId !== event.pointerId) return;
        if (event.type === 'pointerup') resizeTo(event.clientX);
        endDrag();
      };
      const options = { capture: true, signal: listeners.signal };
      document.addEventListener('pointerdown', startDrag, options);
      document.addEventListener('pointermove', moveDrag, options);
      document.addEventListener('pointerup', finishDrag, options);
      document.addEventListener('pointercancel', finishDrag, options);
      document.addEventListener('lostpointercapture', finishDrag, options);
      return () => {
        listeners.abort();
        observer.disconnect();
        endDrag();
        if (sizing) clearWidth(sizing.frame);
      };
    }

    return {
      inject: ['sessions', 'workspaces', 'slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-project-icons';
          style.textContent = STYLESHEET;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'project-icons: sidebar stylesheet');

        ctx.effect(() => installSidebarResize(ctx), 'project-icons: compact sidebar resize');

        ctx.effect(() => {
          const disposers = [];
          try {
            disposers.push(ctx.locale.register(LOCALE, 'zh', { 'tip.project': '项目' }));
            disposers.push(ctx.locale.register(LOCALE, 'en', { 'tip.project': 'Project' }));
          } catch (error) {
            for (const dispose of disposers.reverse()) dispose();
            throw error;
          }
          return () => { for (const dispose of disposers) dispose(); };
        }, 'project-icons: hover translations');

        ctx.slots.inject(HOVER_SLOT, () => ctx.slots.register({
          name: HOVER_SLOT,
          id: 'project',
          order: 5,
          locale: LOCALE,
        }, ProjectLine));

        /**
         * Paint each rendered row's project icon through a CSS custom property.
         *
         * The icon is a `::before` pseudo-element, so it is never a DOM child
         * React could drop. Reconciliation only writes `--rsr-url`/`--rsr-letter`
         * on the row element (which React does not manage) and is idempotent: it
         * walks the rows that exist now, skips rows already showing the right
         * project, and clears the properties on rows whose project is gone.
         */
        ctx.effect(() => {
          /** The signature last written to each row (weak: rows may unmount). */
          const written = new WeakMap();
          /** Object URLs for project artwork, keyed by project path. */
          const iconCache = new Map();

          /**
           * The artwork URL for a project, fetched once and reused.
           * @param projectPath - the project directory.
           * @returns a promise of an object URL, or of null when it has no icon.
           */
          const artworkFor = (projectPath) => {
            const hit = iconCache.get(projectPath);
            if (hit !== undefined) return hit;
            const pending = fetch(iconUrl(projectPath), { credentials: 'same-origin' })
              .then((response) => (response.ok ? response.blob() : null))
              .then((blob) => (blob === null ? null : URL.createObjectURL(blob)))
              .catch(() => null);
            iconCache.set(projectPath, pending);
            return pending;
          };

          /**
           * The artwork URL for one Session, resolved Host-side from its log.
           *
           * Cached under its own key space so it can never collide with the
           * per-directory entries above; two Sessions in the same project each
           * hold their own object URL, which is what makes cleanup exact.
           * @param sessionId - the Session whose project icon is requested.
           * @returns a promise of an object URL, or of null when it has no icon.
           */
          const sessionArtworkFor = (sessionId) => {
            const key = `session\u0000${sessionId}`;
            const hit = iconCache.get(key);
            if (hit !== undefined) return hit;
            const pending = fetch(hostUrl(SESSION_ROUTE, `session=${encodeURIComponent(sessionId)}`), { credentials: 'same-origin' })
              .then((response) => (response.ok ? response.blob() : null))
              .then((blob) => (blob === null ? null : URL.createObjectURL(blob)))
              .catch(() => null);
            iconCache.set(key, pending);
            return pending;
          };

          /** Quote a string for use as the `content` value of a pseudo-element. */
          const contentString = (text) => `"${String(text).replace(/["\\]/g, '\\$&')}"`;

          /** Reset every project-icon property on one row. */
          const clearRow = (row) => {
            row.style.removeProperty('--rsr-url');
            row.style.removeProperty('--rsr-letter');
            row.style.removeProperty('--rsr-tile-bg');
            row.style.removeProperty('--rsr-tile-fg');
            written.delete(row);
          };

          const reconcile = () => {
            const workspaces = ctx.get('workspaces').list.getSnapshot();
            const sessions = ctx.get('sessions').list.getSnapshot();

            for (const row of document.querySelectorAll(ROW)) {
              const sessionId = (row.getAttribute('data-row-key') ?? '').slice('session:'.length);
              if (sessionId === '') continue;
              const workspace = workspaceForSession(workspaces, sessionId);
              const summary = sessions.byId[sessionId];
              const projectPath = workspace?.path ?? summary?.cwd;
              const label = workspace?.title ?? summary?.title ?? sessionId;
              const hasPath = projectPath !== undefined && projectPath !== '';
              const signature = `${sessionId}\u0000${projectPath ?? ''}\u0000${label}`;

              if (written.get(row) === signature) continue;
              written.set(row, signature);

              // A row with no known project still gets a letter tile: a freshly
              // opened project settles its Workspace a tick later, and a blank
              // gutter would flash. The next reconcile swaps in the artwork.
              if (!hasPath) {
                row.style.setProperty('--rsr-letter', contentString(initialOf(label)));
                row.style.removeProperty('--rsr-url');
                const tile = tileColour(projectPath ?? label);
                row.style.setProperty('--rsr-tile-bg', tile);
                row.style.setProperty('--rsr-tile-fg', readableOn(tile));
                // The project is unknown, but the Session is not, and the
                // Host can read the directory straight from its log. Only after
                // that also fails does the letter tile stand, so a step refresh
                // that has not delivered the catalog yet never degrades a row.
                sessionArtworkFor(sessionId).then((url) => {
                  if (written.get(row) !== signature || !row.isConnected) return;
                  if (url === null) return;
                  row.style.setProperty('--rsr-url', `url("${url}")`);
                  row.style.setProperty('--rsr-letter', '""');
                  row.style.setProperty('--rsr-tile-bg', 'transparent');
                  row.style.removeProperty('--rsr-tile-fg');
                });
                continue;
              }

              // Show the letter immediately so the gutter is never empty while
              // the artwork is fetched; the background image replaces it on arrival.
              row.style.setProperty('--rsr-letter', '""');
              row.style.removeProperty('--rsr-url');
              row.style.setProperty('--rsr-tile-bg', 'transparent');
              const pendingSignature = signature;
              artworkFor(projectPath).then((url) => {
                // The row may have been reused for another project by now.
                if (written.get(row) !== pendingSignature || !row.isConnected) return;
                if (url === null) {
                  row.style.setProperty('--rsr-letter', contentString(initialOf(label)));
                  row.style.removeProperty('--rsr-url');
                  const tile = tileColour(projectPath ?? label);
                  row.style.setProperty('--rsr-tile-bg', tile);
                  row.style.setProperty('--rsr-tile-fg', readableOn(tile));
                  return;
                }
                row.style.setProperty('--rsr-url', `url("${url}")`);
                row.style.setProperty('--rsr-letter', '""');
                row.style.setProperty('--rsr-tile-bg', 'transparent');
                row.style.removeProperty('--rsr-tile-fg');
              });
            }

            // Workspace (project) rows: the session loop above keys a row by its
            // owning project, but a project row instead carries
            // `workspace:<workspaceId>`, so the registry is consulted directly for
            // the directory to read artwork from. A row whose workspace has no
            // known path, or a project without an icon, keeps the shipped folder
            // glyph untouched.
            const byWorkspaceId = new Map(
              workspaces.items.map((item) => [String(item.workspaceId), item]),
            );
            for (const row of document.querySelectorAll(WORKSPACE_ROW)) {
              const workspaceId = (row.getAttribute('data-row-key') ?? '').slice('workspace:'.length);
              const projectPath = byWorkspaceId.get(workspaceId)?.path;
              const signature = `workspace\u0000${projectPath ?? ''}`;

              if (written.get(row) === signature) continue;
              written.set(row, signature);

              if (projectPath === undefined || projectPath === '') {
                row.removeAttribute(WORKSPACE_ARTWORK);
                row.style.removeProperty('--wsr-url');
                continue;
              }

              const pendingSignature = signature;
              artworkFor(projectPath).then((url) => {
                // The row may have been reused for another project by now.
                if (written.get(row) !== pendingSignature || !row.isConnected) return;
                if (url === null) {
                  row.removeAttribute(WORKSPACE_ARTWORK);
                  row.style.removeProperty('--wsr-url');
                  return;
                }
                row.style.setProperty('--wsr-url', `url("${url}")`);
                row.setAttribute(WORKSPACE_ARTWORK, '');
              });
            }
          };

          /**
           * Reconcile on a frame, serialized through `frame`.
           *
           * The catalog subscriptions and the structural mutation observer both
           * request a pass. Passes are serialized so a change that lands during a
           * reconcile (React re-rendering a row) queues exactly one more pass
           * instead of interleaving. Writing a custom property does not add or
           * remove nodes, so the observer (childList only) does not loop on it.
           */
          let frame = 0;
          let running = false;
          let dirty = false;
          const schedule = () => {
            if (running) { dirty = true; return; }
            if (frame !== 0) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              running = true;
              try {
                reconcile();
              } finally {
                running = false;
                if (dirty) { dirty = false; schedule(); }
              }
            });
          };

          // Row components remount on list changes; observe only structural
          // changes so the icon follows rows that appear without a catalog tick
          // (expanding a project, reveal-after-search, drag settle).
          const observer = new MutationObserver(schedule);
          observer.observe(document.body, { childList: true, subtree: true });

          const stopSessions = ctx.get('sessions').list.subscribe(schedule);
          const stopWorkspaces = ctx.get('workspaces').list.subscribe(schedule);
          schedule();

          return () => {
            if (frame !== 0) cancelAnimationFrame(frame);
            observer.disconnect();
            stopSessions();
            stopWorkspaces();
            for (const row of document.querySelectorAll(ROW)) clearRow(row);
            for (const row of document.querySelectorAll(WORKSPACE_ROW)) {
              row.removeAttribute(WORKSPACE_ARTWORK);
              row.style.removeProperty('--wsr-url');
            }
            for (const pending of iconCache.values()) {
              pending.then((url) => { if (url !== null) URL.revokeObjectURL(url); }).catch(() => {});
            }
          };
        }, 'project-icons: project icon (pseudo-element)');
      },
    };
  },
});
