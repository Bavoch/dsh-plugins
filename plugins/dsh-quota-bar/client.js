/**
 * Client half: a full-width status bar at the bottom of the window showing the
 * account's remaining balance, modeled on PandaGO's `StatusBar` + `AiQuotaBar`:
 * a compact reading (ring + amount) that expands into detail on hover.
 *
 * Why this data source: PandaGO queries its own `/api/ai-quota`, which DSH does
 * not have. DSH exposes the same shape through the account controller —
 * `ctx.remote.account.getBalance(client)` returns the recharge-wallet balances
 * and a usage link — so the bar reads that instead of inventing a number. When
 * the account is signed out the call answers `null`, and the bar renders
 * nothing and reserves no height.
 *
 * The seat is `shell.bottom`: a full-width row below all three columns, mounted
 * across navigation, whose own height is whatever the occupant renders.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-quota-bar',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const ReactDOM = require('react-dom');
    const { IconSettingsOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'quota-bar';

    /** How long one snapshot is reused before asking the Host again. */
    const REFRESH_MS = 45_000;

    /** The Host route that projects magpie's live quota snapshot. */
    const ROUTE = '/api/model-quotas';

    /** Browser-local key for the per-account display settings. */
    const SETTINGS_KEY = 'dsh-quota-bar.settings.v1';

    /**
     * Per-account display preferences.
     *
     * These are presentation choices about one reader's own line, so they live in
     * browser storage rather than in the Host profile: the same Host can be open
     * in two browsers, and neither should rearrange the other's status line.
     *
     * Shape: `{ [accountId]: { name?: string, hidden?: boolean } }` plus `order`,
     * the account ids in the reader's own order. An account absent from `order`
     * keeps the Host's order, after the ones that were placed.
     */
    const EMPTY_SETTINGS = { order: [], entries: {} };

    /** Read the stored settings, tolerating any old or malformed payload. */
    const loadSettings = () => {
      try {
        const raw = window.localStorage.getItem(SETTINGS_KEY);
        if (raw === null) return EMPTY_SETTINGS;
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') return EMPTY_SETTINGS;
        const order = Array.isArray(parsed.order) ? parsed.order.filter((id) => typeof id === 'string') : [];
        const entries = {};
        if (parsed.entries !== null && typeof parsed.entries === 'object') {
          for (const [id, value] of Object.entries(parsed.entries)) {
            if (value === null || typeof value !== 'object') continue;
            entries[id] = {
              ...typeof value.name === 'string' && value.name.trim() !== '' ? { name: value.name.trim() } : {},
              ...value.hidden === true ? { hidden: true } : {},
            };
          }
        }
        return { order, entries };
      } catch {
        return EMPTY_SETTINGS;
      }
    };

    /** Persist the settings, ignoring a browser that refuses storage. */
    const saveSettings = (next) => {
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // A refused write leaves the line as it was; the change is not persisted.
      }
    };

    /** Settings plus a setter, shared by the line and its panel. */
    function useSettings() {
      const [settings, setSettings] = React.useState(loadSettings);
      const update = React.useCallback((mutate) => {
        setSettings((current) => {
          const next = mutate(current);
          saveSettings(next);
          return next;
        });
      }, []);
      return [settings, update];
    }

    /**
     * Apply the stored preferences to a freshly projected row list.
     *
     * Hidden accounts drop out, renames replace the Host label, and the reader's
     * order wins where it names an account. An account the Host reports but the
     * reader never arranged keeps the Host position, after the arranged ones.
     * @param rows - rows as projected by the Host.
     * @param settings - stored preferences.
     * @returns the rows to render, in display order.
     */
    const applySettings = (rows, settings) => {
      const ranked = rows.map((row, index) => {
        const place = settings.order.indexOf(row.id);
        return { row, key: place === -1 ? rows.length + index : place };
      });
      ranked.sort((a, b) => a.key - b.key);

      return ranked
        .map(({ row }) => {
          const entry = settings.entries[row.id];
          if (entry?.hidden === true) return undefined;
          return entry?.name === undefined ? row : { ...row, name: entry.name };
        })
        .filter((row) => row !== undefined);
    };

    /**
     * Every connected model account, as the Host projects it.
     *
     * The rows come from magpie's own quota snapshot (one entry per signed-in
     * account), so each row is a real reading: percent remaining on the most
     * constrained window, the plan, and the reset time. Nothing is derived from
     * pricing or token history.
     */
    function useQuotas(ctx) {
      const [rows, setRows] = React.useState([]);

      React.useEffect(() => {
        let living = true;

        const load = async () => {
          try {
            // The route rides the authenticated `/api` channel, so the browser's
            // own credentials are what admit it.
            const response = await fetch(ROUTE, {
              credentials: 'same-origin',
              headers: { accept: 'application/json' },
            });
            if (!living) return;
            const payload = await response.json();
            if (!living) return;
            const next = Array.isArray(payload?.rows) ? payload.rows : [];
            setRows((previous) => (sameRows(previous, next) ? previous : next));
          } catch {
            // A failed read keeps the last known rows rather than blanking the line.
          }
        };

        void load();
        const timer = window.setInterval(() => {
          if (document.visibilityState === 'visible') void load();
        }, REFRESH_MS);

        return () => {
          living = false;
          window.clearInterval(timer);
        };
      }, [ctx]);

      return rows;
    }

    /**
     * Whether two snapshots describe the same line, so a unchanged poll does not
     * re-render the composer dock.
     * @param left - previous rows.
     * @param right - freshly read rows.
     * @returns true when nothing visible changed.
     */
    const sameRows = (left, right) => {
      if (left.length !== right.length) return false;
      return left.every((row, index) => {
        const other = right[index];
        return row.id === other.id
          && row.name === other.name
          && row.remaining === other.remaining
          && row.window === other.window
          && row.balance === other.balance
          && row.plan === other.plan
          && sameWindows(row.windows, other.windows);
      });
    };

    /**
     * Whether two rows' multi-window readings describe the same state.
     *
     * Antigravity rows carry both a five-hour and a seven-day window; a poll
     * that changed either one must re-render, or the bar could show a stale
     * share on the window the reader is watching.
     * @param left - previous windows (or undefined).
     * @param right - freshly read windows (or undefined).
     * @returns true when both lists are equivalent.
     */
    const sameWindows = (left, right) => {
      const a = Array.isArray(left) ? left : [];
      const b = Array.isArray(right) ? right : [];
      if (a.length !== b.length) return false;
      return a.every((win, index) => {
        const other = b[index];
        return win.key === other.key
          && win.remaining === other.remaining
          && win.resetAt === other.resetAt;
      });
    };

    /**
     * Number each provider's accounts so they can be told apart.
     *
     * A provider's own name is the label the reader recognises; the account behind
     * it is an implementation detail that does not belong in a one-line status
     * strip. Accounts of the same provider are therefore numbered in display
     * order — "#1", "#2" — and a provider with a single account keeps its bare
     * name.
     * @param rows - rows in display order.
     * @returns the suffix for each row id ("#1", "#2", …), or undefined when its
     *   provider has only one account.
     */
    const accountIndexes = (rows) => {
      const counts = new Map();
      for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
      const seen = new Map();
      const indexes = new Map();
      for (const row of rows) {
        if (counts.get(row.name) < 2) continue;
        const next = (seen.get(row.name) ?? 0) + 1;
        seen.set(row.name, next);
        indexes.set(row.id, `#${next}`);
      }
      return indexes;
    };

    /**
     * One account's reading.
     *
     * Minimal by design: a dot, the provider name, and the remaining share. The
     * plan, the account, the window name and the reset time live in the hover
     * detail, so the resting line stays a short phrase per account.
     * @param props - the row, whether its label needs disambiguating, and the locale seat.
     * @returns the reading.
     */
    /** Ring geometry: 12px box, 2px stroke, matching the stat line's scale. */
    const RING_SIZE = 12;
    const RING_STROKE = 2;
    const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
    const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

    /**
     * The state marker, drawn as remaining share.
     *
     * The row already states the amount, so the ring carries the same fact at a
     * glance: an arc proportional to what is left, over a faint track for the
     * part already spent. It switches to the warning tone once nothing remains,
     * which is the only case worth an alarm colour.
     * @param props - percent remaining (0..100, or undefined when unknown).
     * @returns the ring.
     */
    function Ring({ percent, exhausted }) {
      const known = typeof percent === 'number' && Number.isFinite(percent);
      // A fully spent allowance still needs a visible mark, or the warning
      // colour would be invisible on a zero-length arc.
      const filled = exhausted === true
        ? 0.12
        : known
          ? Math.max(0, Math.min(100, percent)) / 100
          : 1;
      const tone = exhausted === true
        ? 'var(--dsw-alias-state-warn-primary)'
        : 'var(--dsw-alias-state-idle-primary)';
      const centre = RING_SIZE / 2;

      return h('svg', {
        className: 'dsh-quota-ring',
        width: RING_SIZE,
        height: RING_SIZE,
        viewBox: `0 0 ${RING_SIZE} ${RING_SIZE}`,
        'aria-hidden': 'true',
      }, [
        h('circle', {
          key: 'track',
          cx: centre,
          cy: centre,
          r: RING_RADIUS,
          fill: 'none',
          stroke: 'currentColor',
          strokeOpacity: 0.25,
          strokeWidth: RING_STROKE,
        }),
        h('circle', {
          key: 'value',
          cx: centre,
          cy: centre,
          r: RING_RADIUS,
          fill: 'none',
          stroke: tone,
          strokeWidth: RING_STROKE,
          strokeLinecap: 'round',
          strokeDasharray: `${RING_LENGTH * filled} ${RING_LENGTH}`,
          transform: `rotate(-90 ${centre} ${centre})`,
        }),
      ]);
    }

    /**
     * A reset time the reader can act on.
     *
     * Quota windows reset within days, so a date is mostly noise: "今日 18:30"
     * says what "2026-11-04 18:30" makes the reader work out. Within the next two
     * calendar days the day is named (today, tomorrow); anything further keeps a
     * plain date, because "3 days later" stops being easier to read than a date.
     * The comparison is on calendar days in the reader's own zone, not on elapsed
     * hours: a reset at 00:10 tomorrow is tomorrow even though it is minutes away.
     * @param when - the reset instant.
     * @param t - the locale seat.
     * @returns the label, or undefined when the instant is not a valid date.
     */
    const resetLabel = (when, t) => {
      const date = new Date(when);
      if (Number.isNaN(date.getTime())) return undefined;

      const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

      // Whole calendar days between the two local midnights.
      const startOfDay = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate());
      const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);

      if (days === 0) return `${t('label.today')} ${time}`;
      if (days === 1) return `${t('label.tomorrow')} ${time}`;
      if (days === -1) return `${t('label.yesterday')} ${time}`;
      if (days > 1 && days <= 6) return `${t('label.inDays', { n: String(days) })} ${time}`;

      const now = new Date();
      const sameYear = date.getFullYear() === now.getFullYear();
      const datePart = date.toLocaleDateString(undefined, sameYear
        ? { month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' });
      return `${datePart} ${time}`;
    };

    /**
     * The short label for one quota window.
     *
     * Antigravity bills two windows: a rolling five-hour allowance and a
     * seven-day allowance. They read as "5 小时" / "7 天" (or "5h" / "7d"), the
     * same words the provider's own client uses, so the reader can tell at a
     * glance which allowance a percentage belongs to.
     * @param key - the window key (`5h` | `7d`).
     * @param t - the locale seat.
     * @returns the label.
     */
    const windowLabel = (key, t) => {
      if (key === '5h') return t('window.5h');
      if (key === '7d') return t('window.7d');
      return String(key ?? '');
    };

    /**
     * One account's reading, with its detail bubble.
     *
     * The bubble is portalled into the document body because the stat line is a
     * horizontal scroller, and a scroll container clips its descendants — drawn
     * inside, the bubble vanished behind the clip. It is positioned from the
     * item's own rect, so it tracks the row without any measurement machinery.
     * @param props - the row, whether its label needs disambiguating, and the locale seat.
     * @returns the reading.
     */
    function ProviderReading({ row, index, t }) {
      const itemRef = React.useRef(null);
      const [anchor, setAnchor] = React.useState(null);

      const exhausted = row.remaining === 0;
      // Multi-window rows (Antigravity) carry a five-hour and a seven-day
      // reading; they are shown side by side so the two allowances are never
      // confused. Every other provider keeps its single reading.
      const windows = Array.isArray(row.windows) ? row.windows : [];
      const hasWindows = windows.length > 0;
      // A credited allowance reads as an amount ("403.63 / 1100"); everything
      // else reads as the share left on its window.
      const value = row.credited === true && row.amount !== undefined
        ? row.amount
        : hasWindows ? undefined
          : typeof row.remaining === 'number' ? `${row.remaining}%` : row.balance;
      const label = index === undefined ? row.name : `${row.name} ${index}`;

      const detail = [];
      if (row.plan !== undefined) detail.push(`${t('label.plan')} ${row.plan}`);
      if (row.account !== undefined) detail.push(`${t('label.account')} ${row.account}`);
      if (row.credited === true && Array.isArray(row.detail) && row.detail.length > 0) {
        // The line already states the total; the pools are a breakdown of what is
        // left, so only the remaining amount is listed — the ceiling adds noise.
        if (row.detail.length > 1) {
          for (const pool of row.detail) {
            const amount = pool.amount ?? '?';
            detail.push(`${pool.name} ${amount}`);
          }
        }
        detail.push(`${t('label.total')} ${row.amount ?? '?'}`);
      } else if (hasWindows) {
        // Each window is its own line: "5 小时 · 剩余 92% · 重置 今日 18:30".
        for (const win of windows) {
          const reset = win.resetAt !== undefined ? resetLabel(win.resetAt, t) : undefined;
          const suffix = reset !== undefined ? ` · ${t('label.reset')} ${reset}` : '';
          detail.push(`${windowLabel(win.key, t)} · ${t('label.remaining')} ${win.remaining}%${suffix}`);
        }
      } else if (row.window !== undefined && typeof row.remaining === 'number') {
        detail.push(`${row.window} · ${t('label.remaining')} ${row.remaining}%`);
      }
      if (row.credited !== true && row.balance !== undefined) detail.push(`${t('label.balance')} ${row.balance}`);
      if (row.clearAt !== undefined) {
        const label = resetLabel(row.clearAt, t);
        if (label !== undefined) {
          const amt = row.clearAmount !== undefined ? ` (-${row.clearAmount})` : '';
          detail.push(`${t('label.clear')} ${label}${amt}`);
        }
      }
      // A single-window row states its reset here; a multi-window row already
      // stated each window's own reset above.
      if (!hasWindows && row.resetAt !== undefined) {
        const label = resetLabel(row.resetAt, t);
        if (label !== undefined) {
          const prefix = row.clearAt !== undefined ? t('label.nextReset') : t('label.reset');
          detail.push(`${prefix} ${label}`);
        }
      }

      const show = () => {
        const element = itemRef.current;
        if (element === null) return;
        setAnchor(element.getBoundingClientRect());
      };
      const hide = () => setAnchor(null);

      // The resting value: a multi-window row fans its windows out as compact
      // "5h 92% · 7d 88%" fragments; a single reading stays one value.
      const valueNodes = hasWindows
        ? windows.map((win, position) => h('span', {
          key: `win:${win.key}`,
          className: 'dsh-quota-win',
        }, [
          position > 0
            ? h('span', { key: 'dot', className: 'dsh-quota-windot', 'aria-hidden': 'true' }, '·')
            : null,
          h('span', { key: 'key', className: 'dsh-quota-winkey' }, windowLabel(win.key, t)),
          h('span', { key: 'val', className: 'dsh-quota-value' }, `${win.remaining}%`),
        ]))
        : value === undefined ? null : h('span', { key: 'value', className: 'dsh-quota-value' }, String(value));

      const ariaValue = hasWindows
        ? windows.map((win) => `${windowLabel(win.key, t)} ${win.remaining}%`).join(' ')
        : value;

      const item = h('span', {
        ref: itemRef,
        className: 'dsh-quota-item',
        'data-exhausted': exhausted ? 'true' : 'false',
        tabIndex: 0,
        'aria-label': `${label} ${ariaValue ?? ''}`.trim(),
        onMouseEnter: show,
        onMouseLeave: hide,
        onFocus: show,
        onBlur: hide,
      }, [
        h(Ring, { key: 'ring', percent: row.remaining, exhausted }),
        h('span', { key: 'name', className: 'dsh-quota-name' }, label),
        ...(Array.isArray(valueNodes) ? valueNodes : [valueNodes]),
      ]);

      if (anchor === null || detail.length === 0) return item;

      const bubble = ReactDOM.createPortal(
        h('span', {
          className: 'dsh-quota-detail',
          role: 'tooltip',
          style: {
            position: 'fixed',
            left: `${Math.round(anchor.left + anchor.width / 2)}px`,
            top: `${Math.round(anchor.top - 8)}px`,
            transform: 'translate(-50%, -100%)',
            zIndex: 9999,
          },
        }, detail.map((line) => h('span', { key: line, className: 'dsh-quota-line' }, line))),
        document.body,
      );

      return React.createElement(React.Fragment, null, item, bubble);
    }

    /**
     * One line of accounts that scrolls sideways.
     *
     * Scrolling is driven by the pointer rather than only by the wheel: the line
     * sits in a narrow composer row, where a trackpad swipe is not always
     * available and Shift+wheel is not discoverable. Press and drag anywhere on
     * the line to move it; a release that did not move keeps the hover detail
     * working, so reading a value is never a drag.
     * @param props - the rows, whether a label needs disambiguating, and the locale seat.
     * @returns the line.
     */
    function ScrollLine({ children }) {
      const ref = React.useRef(null);
      const drag = React.useRef(null);

      // Keep two things in step with the scroll position: whether the line can
      // scroll at all (the grab cursor), and how much of each edge is faded. A
      // soft edge only appears on the side that actually hides content, so the
      // first account is fully legible at the start and the last at the end.
      React.useEffect(() => {
        const element = ref.current;
        if (element === null) return undefined;

        const FADE = 24;

        const sync = () => {
          const overflow = element.scrollWidth - element.clientWidth;
          element.dataset.scrollable = overflow > 1 ? 'true' : 'false';
          const atStart = element.scrollLeft <= 1;
          const atEnd = element.scrollLeft >= overflow - 1;
          element.style.setProperty('--dsh-quota-fade-start', overflow <= 1 || atStart ? '0px' : `${FADE}px`);
          element.style.setProperty('--dsh-quota-fade-end', overflow <= 1 || atEnd ? '0px' : `${FADE}px`);
        };

        sync();
        element.addEventListener('scroll', sync, { passive: true });

        let observer;
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(sync);
          observer.observe(element);
          for (const child of element.children) observer.observe(child);
        }
        return () => {
          element.removeEventListener('scroll', sync);
          observer?.disconnect();
        };
      }, []);

      // Wheel over the line scrolls it sideways with easing. A trackpad already
      // sends fine deltas; a mouse wheel sends coarse steps that would otherwise
      // jump, so each step is animated toward its target.
      React.useEffect(() => {
        const element = ref.current;
        if (element === null) return undefined;

        let target = null;
        let frame = 0;

        const animate = () => {
          const from = element.scrollLeft;
          const to = target;
          // A third of the remaining distance per frame settles in a few frames
          // without overshooting.
          const next = from + (to - from) * 0.35;
          if (Math.abs(to - next) < 0.5) {
            element.scrollLeft = to;
            target = null;
            frame = 0;
            return;
          }
          element.scrollLeft = next;
          frame = requestAnimationFrame(animate);
        };

        const onWheel = (event) => {
          if (element.scrollWidth <= element.clientWidth) return;
          const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
          if (delta === 0) return;
          event.preventDefault();
          const base = target ?? element.scrollLeft;
          const limit = element.scrollWidth - element.clientWidth;
          target = Math.max(0, Math.min(limit, base + delta));
          if (frame === 0) frame = requestAnimationFrame(animate);
        };

        element.addEventListener('wheel', onWheel, { passive: false });
        return () => {
          element.removeEventListener('wheel', onWheel);
          if (frame !== 0) cancelAnimationFrame(frame);
        };
      }, []);

      const onPointerDown = (event) => {
        const element = ref.current;
        if (element === null || event.button !== 0) return;
        // Nothing to scroll: leave the press alone so the detail stays interactive.
        if (element.scrollWidth <= element.clientWidth) return;
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startScroll: element.scrollLeft,
          moved: false,
        };
      };

      const onPointerMove = (event) => {
        const element = ref.current;
        const state = drag.current;
        if (element === null || state === null || state.pointerId !== event.pointerId) return;
        const delta = event.clientX - state.startX;
        // A few pixels of travel is a press, not a drag: keep the hover intact.
        if (!state.moved && Math.abs(delta) < 4) return;
        if (!state.moved) {
          state.moved = true;
          // Capture only once the gesture is a real drag, so a plain click still
          // reaches the item underneath.
          element.setPointerCapture?.(event.pointerId);
          element.dataset.dragging = 'true';
        }
        element.scrollLeft = state.startScroll - delta;
        element.dispatchEvent(new Event('scroll'));
        event.preventDefault();
      };

      const finish = (event) => {
        const element = ref.current;
        const state = drag.current;
        if (element === null || state === null || state.pointerId !== event.pointerId) return;
        drag.current = null;
        if (state.moved) {
          element.releasePointerCapture?.(event.pointerId);
          delete element.dataset.dragging;
          // The press ended somewhere the reader did not aim at: leave nothing
          // hovered, so no detail bubble stays open after a drag.
          element.querySelectorAll('.dsh-quota-item:hover').forEach((item) => {
            item.blur?.();
          });
        }
      };

      return h('div', {
        ref,
        className: 'dsh-quota-bar',
        role: 'group',
        onPointerDown,
        onPointerMove,
        onPointerUp: finish,
        onPointerCancel: finish,
        onLostPointerCapture: finish,
      }, children);
    }

    /**
     * The composer's stat line: every connected account, separated by a thin rule.
     * Renders nothing when no account reports a reading.
     */
    /**
     * The settings panel: rename, reorder, and hide each account.
     *
     * Opened from the button at the right end of the line. It is a small popover
     * anchored above that button rather than a modal, because the line it edits
     * is a one-row status strip: a full dialog would cover the conversation for
     * a cosmetic change.
     * @param props - the rows, the settings and setter, the anchor, and the locale seat.
     * @returns the panel.
     */
    function SettingsPanel({ rows, settings, update, onClose, t }) {
      const [draft, setDraft] = React.useState({});
      /** The account being dragged, and the one it is hovering. */
      const [drag, setDrag] = React.useState({ from: null, over: null });
      const panelRef = React.useRef(null);

      // A hidden account must still be listed here, or it could never come back.
      const ordered = React.useMemo(() => {
        const ranked = rows.map((row, index) => {
          const place = settings.order.indexOf(row.id);
          return { row, key: place === -1 ? rows.length + index : place };
        });
        ranked.sort((a, b) => a.key - b.key);
        return ranked.map(({ row }) => row);
      }, [rows, settings.order]);

      React.useEffect(() => {
        const onPointerDown = (event) => {
          const panel = panelRef.current;
          if (panel === null) return;
          if (panel.contains(event.target)) return;
          if (event.target instanceof Element && event.target.closest('[data-quota-settings]') !== null) return;
          onClose();
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose();
        };
        document.addEventListener('pointerdown', onPointerDown, true);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown, true);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [onClose]);

      /**
       * Move one account to another's position.
       *
       * Dropping on a row places the dragged account where that row sits, which
       * is what a drag gesture means visually.
       * @param from - the dragged account id.
       * @param to - the account id it was dropped on.
       */
      const reorder = (from, to) => {
        if (from === to) return;
        const ids = ordered.map((row) => row.id);
        const fromIndex = ids.indexOf(from);
        const toIndex = ids.indexOf(to);
        if (fromIndex === -1 || toIndex === -1) return;
        const next = [...ids];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        update((current) => ({ ...current, order: next }));
      };

      const rename = (id, value) => {
        update((current) => {
          const entries = { ...current.entries };
          const entry = { ...entries[id] };
          if (value.trim() === '') delete entry.name;
          else entry.name = value.trim();
          entries[id] = entry;
          return { ...current, entries };
        });
      };

      const toggle = (id) => {
        update((current) => {
          const entries = { ...current.entries };
          const entry = { ...entries[id] };
          if (entry.hidden === true) delete entry.hidden;
          else entry.hidden = true;
          entries[id] = entry;
          return { ...current, entries };
        });
      };

      const reset = () => update(() => EMPTY_SETTINGS);

      return h('div', {
        ref: panelRef,
        className: 'dsh-quota-panel',
        role: 'dialog',
        'aria-label': t('settings.title'),
      }, [
        h('div', { key: 'head', className: 'dsh-quota-panel-head' }, [
          h('span', { key: 'title', className: 'dsh-quota-panel-title' }, t('settings.title')),
          h('button', {
            key: 'reset',
            type: 'button',
            className: 'dsh-quota-panel-reset',
            onClick: reset,
          }, t('settings.reset')),
        ]),
        h('ul', { key: 'list', className: 'dsh-quota-panel-list' },
          ordered.map((row, index) => {
            const entry = settings.entries[row.id];
            const hidden = entry?.hidden === true;
            const name = entry?.name ?? row.name;
            return h('li', {
              key: row.id,
              className: 'dsh-quota-panel-row',
              'data-hidden': hidden ? 'true' : 'false',
              'data-dragging': drag.from === row.id ? 'true' : 'false',
              'data-over': drag.over === row.id && drag.from !== row.id ? 'true' : 'false',
              draggable: true,
              onDragStart: (event) => {
                // The row itself is draggable, but the text field inside it must
                // keep its own text-selection drag.
                if (event.target instanceof HTMLElement && event.target.tagName === 'INPUT' && event.target.type === 'text') {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', row.id);
                setDrag({ from: row.id, over: null });
              },
              onDragOver: (event) => {
                if (drag.from === null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDrag((current) => (current.over === row.id ? current : { ...current, over: row.id }));
              },
              onDragLeave: () => {
                setDrag((current) => (current.over === row.id ? { ...current, over: null } : current));
              },
              onDrop: (event) => {
                event.preventDefault();
                const from = drag.from ?? event.dataTransfer.getData('text/plain');
                if (from !== '' && from !== null) reorder(from, row.id);
                setDrag({ from: null, over: null });
              },
              onDragEnd: () => setDrag({ from: null, over: null }),
            }, [
              h('input', {
                key: 'toggle',
                type: 'checkbox',
                className: 'dsh-quota-panel-check',
                checked: !hidden,
                'aria-label': `${row.name} ${t('settings.visible')}`,
                onChange: () => toggle(row.id),
              }),
              h('input', {
                key: 'name',
                type: 'text',
                className: 'dsh-quota-panel-input',
                value: draft[row.id] ?? name,
                placeholder: row.name,
                'aria-label': `${t('settings.name')} ${row.name}`,
                onChange: (event) => {
                  const value = event.target.value;
                  setDraft((current) => ({ ...current, [row.id]: value }));
                  rename(row.id, value);
                },
                onBlur: () => setDraft((current) => {
                  const next = { ...current };
                  delete next[row.id];
                  return next;
                }),
              }),
              h('span', {
                key: 'handle',
                className: 'dsh-quota-panel-handle',
                'aria-hidden': 'true',
                title: t('settings.drag'),
              }, '⠿'),
            ]);
          })),
      ]);
    }

    /**
     * The composer's stat line: every connected account, plus a settings control.
     * Renders nothing when no account reports a reading.
     */
    function BalanceBar({ ctx, t }) {
      const all = useQuotas(ctx);
      const [settings, update] = useSettings();
      const [open, setOpen] = React.useState(false);
      const wrapperRef = React.useRef(null);

      const rows = React.useMemo(() => applySettings(all, settings), [all, settings]);
      // Accounts of one provider are numbered in display order; a provider with a
      // single account keeps its bare name. Computed before the early return so
      // the hook order never depends on whether rows exist.
      const indexes = React.useMemo(() => accountIndexes(rows), [rows]);

      if (all.length === 0) return null;

      const children = [];
      rows.forEach((row, position) => {
        if (position > 0) children.push(h('span', { key: `sep:${row.id}`, className: 'dsh-quota-sep', 'aria-hidden': 'true' }));
        children.push(h(ProviderReading, { key: row.id, row, index: indexes.get(row.id), t }));
      });

      // The settings control sits beside the scroller, never inside it: it has to
      // stay put at the right edge while the accounts scroll past underneath.
      const settingsButton = h('button', {
        key: 'settings',
        type: 'button',
        className: 'dsh-quota-settings',
        'data-quota-settings': 'true',
        'aria-label': t('settings.open'),
        'aria-expanded': open ? 'true' : 'false',
        title: t('settings.open'),
        onMouseDown: (event) => event.stopPropagation(),
        onClick: (event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        },
      }, h(IconSettingsOutlineRegular, { size: 13 }));

      return h('div', { ref: wrapperRef, className: 'dsh-quota-wrap' }, [
        h('div', { key: 'row', className: 'dsh-quota-row' }, [
          h(ScrollLine, { key: 'line', 'aria-label': t('bar.aria') }, children),
          settingsButton,
        ]),
        open
          ? h(SettingsPanel, {
            key: 'panel',
            rows: all,
            settings,
            update,
            onClose: () => setOpen(false),
            t,
          })
          : null,
      ]);
    }

    const STYLESHEET = `
/* Typography is copied from the shipped stat pills (ui-chat StatsPills) so the
   line reads exactly like the numbers it replaces:
     font-size   calc(var(--dsh-content-font-size-secondary, 13px) - 1px)
     line-height calc(20px + var(--dsh-content-font-delta-secondary, 0px))
     colour      --dsw-alias-label-tertiary
   The resting state stays minimal: a dot, a provider name, an amount. */

/* The line fills its row and scrolls sideways when the accounts do not fit.
   Items never shrink: a truncated "Anti… 8…" tells the reader nothing, so the
   overflow goes to a horizontal scroll instead of to ellipses. */
.dsh-quota-dock {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

/* The line and its settings control share one row: the control keeps the right
   edge, the line takes what is left and fades where it runs out. */
.dsh-quota-row {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  min-width: 0;
}

.dsh-quota-bar {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  /* A soft edge instead of a hard cut: the accounts dissolve into the control
     rather than being chopped mid-glyph. The mask follows the scroll position
     through the two custom properties the component sets. */
  --dsh-quota-fade-start: 0px;
  --dsh-quota-fade-end: 24px;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--dsh-quota-fade-start),
    black calc(100% - var(--dsh-quota-fade-end)),
    transparent 100%
  );
  mask-image: linear-gradient(
    to right,
    transparent 0,
    black var(--dsh-quota-fade-start),
    black calc(100% - var(--dsh-quota-fade-end)),
    transparent 100%
  );
  font: inherit;
  font-size: calc(var(--dsh-content-font-size-secondary, 13px) - 1px);
  line-height: calc(20px + var(--dsh-content-font-delta-secondary, 0px));
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
}

/* The line publishes no scrollbar of its own; the row stays one quiet line. */
.dsh-quota-bar::-webkit-scrollbar { display: none; }

/* Press and drag to scroll. The cursor says the line is draggable only while it
   can actually scroll, via data-scrollable set by the component.
   The reading is status information, not text to copy: selection is disabled
   for the line and its bubble in every state, so a drag never paints a text
   selection and a stray double-click cannot highlight a value. */
.dsh-quota-bar { cursor: default; }
.dsh-quota-bar[data-scrollable='true'] { cursor: grab; }
.dsh-quota-bar[data-dragging='true'] { cursor: grabbing; }

.dsh-quota-bar,
.dsh-quota-bar *,
.dsh-quota-detail,
.dsh-quota-detail * {
  -webkit-user-select: none;
  user-select: none;
}

/* Centre the line without clipping its leading edge when it overflows: auto
   insets balance on each side while the content is narrower than the row, and
   collapse to zero once it is wider, so scrolling starts at the first account. */
.dsh-quota-bar > :first-child { margin-inline-start: auto; }
.dsh-quota-bar > :last-child { margin-inline-end: auto; }

/* One account: dot, name, amount — all at full width. */
.dsh-quota-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
  padding: 1px 8px;
  border-radius: var(--dsw-radius-sm);
  outline: none;
  cursor: default;
}

.dsh-quota-item:hover,
.dsh-quota-item:focus-visible { color: var(--dsw-alias-label-secondary); }

/* The line and its panel share one wrapper so the panel can anchor to it. */
.dsh-quota-wrap {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 100%;
  /* Never wider than the input card directly above. The card caps itself at
     this variable; the dock row does not, which is why the line could overhang. */
  max-width: var(--dsh-composer-card-max-width, 100%);
  min-width: 0;
  margin: 0 auto;
}

/* The settings trigger sits at the right end of the line, quiet by default. */
.dsh-quota-settings {
  flex: none;
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  margin-inline-start: 2px;
  border: none;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}

.dsh-quota-settings:hover,
.dsh-quota-settings[aria-expanded='true'] {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.16));
}

/* The panel floats above the line, right-aligned to it. */
.dsh-quota-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 9998;
  box-sizing: border-box;
  width: 300px;
  max-height: 320px;
  overflow-y: auto;
  padding: 8px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  background-color: var(--dsw-alias-bg-base, #1b1b1e);
  background-image: linear-gradient(
    var(--dsw-alias-bg-layer-2, transparent),
    var(--dsw-alias-bg-layer-2, transparent)
  );
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 17px;
  font-variant-numeric: normal;
  white-space: normal;
  text-align: left;
}

.dsh-quota-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 2px 6px;
}

.dsh-quota-panel-title {
  color: var(--dsw-alias-label-primary);
  font-weight: 500;
}

.dsh-quota-panel-reset {
  border: none;
  background: transparent;
  padding: 0;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font: inherit;
}

.dsh-quota-panel-reset:hover { color: var(--dsw-alias-label-primary); }

.dsh-quota-panel-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.dsh-quota-panel-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 2px;
  border-radius: var(--dsw-radius-sm, 4px);
}

.dsh-quota-panel-row[data-hidden='true'] { opacity: 0.5; }

.dsh-quota-panel-check {
  flex: none;
  width: 13px;
  height: 13px;
  margin: 0;
  accent-color: var(--dsw-alias-state-business-primary, currentColor);
  cursor: pointer;
}

.dsh-quota-panel-input {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  height: 22px;
  padding: 0 6px;
  border: 0.5px solid transparent;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: inherit;
  font: inherit;
}

.dsh-quota-panel-input:hover { border-color: var(--dsw-alias-border-l1); }

.dsh-quota-panel-input:focus {
  outline: none;
  border-color: var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  background: var(--dsw-alias-interactive-bg-hover, rgba(127, 127, 127, 0.12));
}

/* Rows are reordered by dragging: the grip is the affordance, the whole row is
   the drop target, and the row being hovered shows where the item will land. */
.dsh-quota-panel-handle {
  flex: none;
  width: 14px;
  color: var(--dsw-alias-label-caption);
  cursor: grab;
  font-size: 12px;
  line-height: 1;
  user-select: none;
  text-align: center;
}

.dsh-quota-panel-row:active .dsh-quota-panel-handle { cursor: grabbing; }

.dsh-quota-panel-row[data-dragging='true'] { opacity: 0.4; }

/* The landing row: a line above it shows the item will be inserted there. */
.dsh-quota-panel-row[data-over='true'] {
  box-shadow: inset 0 2px 0 var(--dsw-alias-state-business-primary, var(--dsw-alias-brand-primary));
}

/* The ring: remaining share as an arc, sized to the stat line. */
.dsh-quota-ring {
  flex: none;
  display: block;
  color: var(--dsw-alias-label-tertiary);
}

/* Never shrink, never elide. */
.dsh-quota-name,
.dsh-quota-value {
  flex: none;
  white-space: nowrap;
}

.dsh-quota-value { color: var(--dsw-alias-label-secondary); }

/* Multi-window rows (Antigravity): the two allowances sit side by side. The
   window key ("5小时" / "7天") is quieter than its percentage, so the numbers
   stay the thing the eye lands on, and a faint dot separates the pair. */
.dsh-quota-win {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  white-space: nowrap;
}

.dsh-quota-winkey {
  flex: none;
  color: var(--dsw-alias-label-tertiary);
  font-size: 0.92em;
}

.dsh-quota-windot {
  flex: none;
  margin-inline: 1px;
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  opacity: 0.7;
}

/* The composer dock also hosts ui-conversation's context-occupancy meter (a
   ring plus percentage). The quota line occupies that space instead, so the
   meter is hidden — but only the meter: the dock keeps rendering the quota row
   it holds, and an activity panel, when open, still takes the slot.
   The meter is the dock's direct sibling after the slot, identified by its
   own percentage label rather than by a hashed class name. */
[data-composer-dock] > :has(> button[aria-haspopup="dialog"]):not(:has(.dsh-quota-bar)) {
  display: none;
}

/* A thin rule between providers. */
.dsh-quota-sep {
  flex: none;
  width: 1px;
  height: 10px;
  background: var(--dsw-alias-separator-primary, var(--dsw-alias-border-l1));
}

/* Hover detail: the per-window breakdown, portalled above the line.
   Appearance only — position and visibility come from the component, which
   places the bubble from the item's own rect. */
.dsh-quota-detail {
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-sizing: border-box;
  min-width: 132px;
  max-width: 280px;
  padding: 8px 11px;
  border-radius: var(--dsw-radius-lg, 10px);
  border: 0.5px solid var(--dsw-alias-border-l2, var(--dsw-alias-border-l1));
  /* Two stacked solid layers: even if the theme token carries alpha, the base
     underneath is opaque, so nothing behind the bubble can bleed through. */
  background-color: var(--dsw-alias-bg-base, #1b1b1e);
  background-image: linear-gradient(
    var(--dsw-alias-bg-layer-2, transparent),
    var(--dsw-alias-bg-layer-2, transparent)
  );
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.45), 0 2px 8px rgba(0, 0, 0, 0.3);
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  line-height: 17px;
  font-variant-numeric: normal;
  white-space: normal;
  pointer-events: none;
}

/* One per line, each with a label and a value that cannot be confused. */
.dsh-quota-line {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

`;

    return {
      inject: ['slots', 'locale', 'remote', 'remote.account'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = [];
          const dictionaries = [
            ['zh', {
              'bar.aria': '剩余额度',
              'label.balance': '余额',
              'label.plan': '套餐',
              'label.account': '账号',
              'label.remaining': '剩余',
              'label.reset': '重置',
              'label.nextReset': '下次重置',
              'label.clear': '最近清空',
              'label.total': '剩余合计',
              'label.today': '今日',
              'label.tomorrow': '明日',
              'label.yesterday': '昨日',
              'label.inDays': '{n} 天后',
              'window.5h': '5小时',
              'window.7d': '7天',
              'settings.open': '额度显示设置',
              'settings.title': '额度显示',
              'settings.visible': '是否显示',
              'settings.name': '名称',
              'settings.drag': '拖动排序',
              'settings.reset': '恢复默认',
            }],
            ['en', {
              'bar.aria': 'Remaining balance',
              'label.balance': 'Balance',
              'label.plan': 'Plan',
              'label.account': 'Account',
              'label.remaining': 'Remaining',
              'label.reset': 'Resets',
              'label.nextReset': 'Next reset',
              'label.clear': 'Next clear',
              'label.total': 'Total left',
              'label.today': 'Today',
              'label.tomorrow': 'Tomorrow',
              'label.yesterday': 'Yesterday',
              'label.inDays': 'In {n} days',
              'window.5h': '5h',
              'window.7d': '7d',
              'settings.open': 'Display settings',
              'settings.title': 'Quota display',
              'settings.visible': 'Visible',
              'settings.name': 'Name',
              'settings.drag': 'Drag to reorder',
              'settings.reset': 'Reset',
            }],
          ];
          try {
            for (const [locale, dict] of dictionaries) disposers.push(ctx.locale.register(NS, locale, dict));
          } catch (error) {
            for (const dispose of disposers.reverse()) dispose();
            throw error;
          }
          return () => { for (const dispose of disposers) dispose(); };
        }, 'quota-bar: dictionaries');

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-quota-bar';
          style.textContent = STYLESHEET;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'quota-bar: styles');

        // The reading lives in the composer's own stat line, so nothing is
        // registered at `shell.bottom`: a second copy in the window's bottom
        // corner would duplicate the same numbers.

        // Replace the composer's own statistics line (ui-chat registers the
        // `activity` and `usage` cells there) with the balance reading. Same cell
        // ids at a lower priority win the single-cell election, so the shipped
        // pills are shadowed rather than coexisting with a second line.
        ctx.slots.inject('conversation.composer.dock', function* register() {
          yield ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'activity',
            order: 0,
            priority: -1,
            locale: NS,
          }, function DockQuota(props) {
            return h('div', { className: 'dsh-quota-dock' }, h(BalanceBar, { ctx, t: props.t }));
          });
          yield ctx.slots.register({
            name: 'conversation.composer.dock',
            id: 'usage',
            order: 1,
            priority: -1,
            locale: NS,
          }, function DockQuotaTail() {
            // The reading is drawn by the `activity` cell above; this cell only
            // suppresses the shipped usage pill beside it.
            return null;
          });
        });
      },
    };
  },
});
