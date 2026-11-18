/**
 * Client half, three jobs on the sidebar session list:
 *
 *  1. Keep a project icon in front of every session row, in every state.
 *  2. Move the row's status marker to the trailing edge.
 *  3. Hide the relative time while that row shows a status marker, and hide the
 *     marker itself while the row is hovered (the hover strip takes its place).
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
  factory() {
    const ROUTE = '/api/project-icon';
    const ROW = '[role="treeitem"][data-row-key^="session:"]';

    /**
     * The stylesheet.
     *
     * The leading cell keeps its place in the DOM but collapses to zero width,
     * so the shipped 16px box never eats space next to the icon gutter; when it
     * holds a status marker it moves to the end and regains its width there.
     */
    const STYLESHEET = `
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
`;

    /** First character of a project name, used when it has no icon. */
    const initialOf = (label) => {
      const trimmed = typeof label === 'string' ? label.trim() : '';
      return trimmed === '' ? '?' : Array.from(trimmed)[0].toUpperCase();
    };

    /** The icon URL the Host serves for one project directory. */
    const iconUrl = (projectPath) => `${ROUTE}?path=${encodeURIComponent(projectPath)}`;

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

    return {
      inject: ['sessions', 'workspaces'],
      apply(ctx) {
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-project-icons';
          style.textContent = STYLESHEET;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'project-icons: row layout stylesheet');

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
              const workspace = workspaces.items.find((item) => item.sessionIds.includes(sessionId));
              const summary = sessions.byId[sessionId];
              const projectPath = workspace?.path ?? summary?.cwd;
              const label = workspace?.title ?? summary?.title ?? sessionId;
              const hasPath = projectPath !== undefined && projectPath !== '';
              // Include the resolved artwork state so a letter-then-artwork swap
              // reruns once the path becomes known.
              const signature = `${projectPath ?? ''}\u0000${label}`;

              if (written.get(row) === signature) continue;

              // A row with no known project still gets a letter tile: a freshly
              // opened project settles its Workspace a tick later, and a blank
              // gutter would flash. The next reconcile swaps in the artwork.
              if (!hasPath) {
                row.style.setProperty('--rsr-letter', contentString(initialOf(label)));
                row.style.removeProperty('--rsr-url');
                const tile = tileColour(projectPath ?? label);
                row.style.setProperty('--rsr-tile-bg', tile);
                row.style.setProperty('--rsr-tile-fg', readableOn(tile));
                written.set(row, signature);
                continue;
              }

              // Show the letter immediately so the gutter is never empty while
              // the artwork is fetched; the background image replaces it on arrival.
              row.style.setProperty('--rsr-letter', '""');
              row.style.removeProperty('--rsr-url');
              row.style.setProperty('--rsr-tile-bg', 'transparent');
              written.set(row, signature);

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
            for (const pending of iconCache.values()) {
              pending.then((url) => { if (url !== null) URL.revokeObjectURL(url); }).catch(() => {});
            }
          };
        }, 'project-icons: project icon (pseudo-element)');
      },
    };
  },
});
