/** Read one conversation turn at a time, with the original user message as its title. */
window.__ModuleLoader__.load({
  id: '@local/dsh-running-prompt-status',
  factory(require) {
    const React = require('react');
    const { createPortal, flushSync } = require('react-dom');
    const h = React.createElement;
    const NS = 'running-prompt-status';
    const TRANSCRIPT_ECHO = '[data-submission-echo]:not([data-pending-steering])';
    const MESSAGE_SELECTOR = `[data-chat-flow-kind="user"][data-chat-turn], ${TRANSCRIPT_ECHO}`;
    const TURN_ROW = '[data-chat-flow-kind], [data-chat-group-key], [data-submission-echo], [data-pending-steering], [data-chat-running]';
    const TITLE_INSET = 8;
    const IMAGE_ATTACHMENTS = '[data-message-attachments]';
    const TITLE_LAYOUT = '[data-dsh-task-title-layout]';
    const TITLE_BODY = '[data-dsh-task-title-body]';
    const TITLE_TRAILING = ':is([data-clock=start], [data-dsh-task-metadata])';
    const IMAGE_LAYOUT = `${TITLE_LAYOUT}:has(> ${TITLE_BODY} > [data-message-attachments])`;
    const IMAGE_TEXT_LAYOUT = `${IMAGE_LAYOUT}:has(> ${TITLE_BODY} > [data-message-bubble])`;
    const TITLE_WITH_ACTIONS = '[data-dsh-user-title]:is(:hover:not(:has([data-message-attachments]:hover)), :has([data-clock=start] :focus-visible))';
    const ACTIVE_TITLE_LAYOUT = `:is(${TITLE_WITH_ACTIONS}${TITLE_LAYOUT}, ${TITLE_WITH_ACTIONS} ${TITLE_LAYOUT})`;
    const CSS_STATUS = 'dsh-sp-title-status';
    const CSS_TIME = 'dsh-sp-title-time';
    const STYLESHEET = `
/* 标题已显示任务状态与用时；只隐藏重复提示，保留节点供实时计时读取。 */
[data-conversation-scroll] [data-chat-running] { display: none !important; }
[data-dsh-turn-viewport] {
  box-sizing: border-box;
  min-block-size: 0;
  block-size: var(--dsh-turn-viewport-height);
  padding-top: 0 !important;
  overflow-y: auto !important;
  overflow-anchor: none;
  scroll-behavior: auto;
  scrollbar-gutter: stable;
}
[data-dsh-turn-viewport] [data-dsh-turn-hidden],
[data-dsh-turn-viewport] > [data-chat-turn-spacer],
[data-dsh-turn-frame] > :has(> nav button[data-index]),
[data-dsh-turn-frame] > [data-dsh-turn-root] + div:has(> button[aria-label] > svg) {
  display: none !important;
}
[data-dsh-turn-transition="newer"] {
  --dsh-turn-enter-y: 100%;
  --dsh-turn-exit-y: -100%;
}
[data-dsh-turn-transition="older"] {
  --dsh-turn-enter-y: -100%;
  --dsh-turn-exit-y: 100%;
}
[data-dsh-turn-transition]::view-transition { pointer-events: none; }
[data-dsh-turn-transition]::view-transition-group(root) { animation-duration: 240ms; }
[data-dsh-turn-transition]::view-transition-image-pair(root) { overflow: clip; }
[data-dsh-turn-transition]::view-transition-old(root),
[data-dsh-turn-transition]::view-transition-new(root) {
  animation-duration: 240ms;
  animation-timing-function: cubic-bezier(0.24, 0.68, 0.34, 1);
  animation-fill-mode: both;
}
[data-dsh-turn-transition]::view-transition-old(root) { animation-name: dsh-turn-out; }
[data-dsh-turn-transition]::view-transition-new(root) { animation-name: dsh-turn-in; }
@keyframes dsh-turn-out {
  from { transform: translateY(0); }
  to { transform: translateY(var(--dsh-turn-exit-y)); }
}
@keyframes dsh-turn-in {
  from { transform: translateY(var(--dsh-turn-enter-y)); }
  to { transform: translateY(0); }
}
[data-dsh-native-task-titles] button[data-turn-process] { border-bottom: 0 !important; }
[data-dsh-native-task-titles] [data-chat-history] { padding-block: 8px; }
[data-dsh-native-task-titles] [data-chat-history] > button {
  background: transparent;
  border-radius: 0;
}
[data-dsh-native-task-titles] [data-chat-history] > button:disabled {
  color: var(--dsw-alias-label-tertiary);
  opacity: 1;
}
[data-dsh-native-task-titles] [data-chat-history] > button:enabled:is(:hover, :focus-visible) {
  text-decoration: underline;
}
[data-dsh-user-title] {
  --dsh-task-title-padding: 16px;
  --dsh-task-title-radius: 14px;
  position: relative !important; top: auto; z-index: 0; flex: none;
  width: var(--dsh-user-title-width) !important; max-width: none !important;
  align-self: center; box-sizing: border-box; margin-block: 8px 4px !important;
  text-align: left;
}
/* 吸顶标题覆盖正文，层级低于 DSH 的输入区（9）。 */
[data-dsh-user-title][data-dsh-task-pinned] { z-index: 8; }
[data-dsh-task-pinned]:not(:has(${TITLE_BODY} > [data-message-attachments])) {
  translate: var(--dsh-task-title-translate);
}
[data-dsh-user-title]:not(:has(${TITLE_BODY} > [data-message-attachments])) {
  padding: 10px var(--dsh-task-title-padding);
}
[data-dsh-user-title]:not(:has(${TITLE_BODY} > [data-message-attachments])),
${IMAGE_TEXT_LAYOUT}::before {
  background-color: var(--dsw-alias-card-fill);
  border-radius: var(--dsh-task-title-radius);
}
${TITLE_LAYOUT} {
  display: grid;
  grid-template: "before text trailing" / auto minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
}
${TITLE_LAYOUT} > :not(${TITLE_BODY}, ${TITLE_TRAILING}) { grid-area: before; margin-inline-end: 8px; }
${TITLE_BODY} { grid-area: text; min-width: 0; max-width: none !important; margin-inline-end: 8px; }
${TITLE_LAYOUT} > ${TITLE_TRAILING} { grid-area: trailing; justify-self: end; align-self: center; }
[data-dsh-user-title] [data-message-bubble] {
  display: block; background: none !important; border: 0 !important; border-radius: 0 !important;
  padding: 0 !important; width: 100% !important; max-width: none !important;
  text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-height: 24px; line-height: 24px;
}
${TITLE_LAYOUT} > [data-clock=start] {
  margin: 0 !important;
  opacity: 0 !important;
  pointer-events: none;
  transition: none !important;
}
[data-dsh-user-title] [data-clock=start] > span { display: none; }
${ACTIVE_TITLE_LAYOUT} > [data-clock=start] { opacity: 1 !important; pointer-events: auto; }
${ACTIVE_TITLE_LAYOUT} > [data-dsh-task-metadata] { opacity: 0; pointer-events: none; }
[data-dsh-task-metadata] { display: flex; align-items: center; justify-content: flex-end; gap: 4px; flex: none; font-size: 12px; min-inline-size: 5em; }
.${CSS_STATUS} { display: inline-grid; place-items: center; inline-size: 14px; block-size: 16px; flex: none; color: var(--dsw-alias-label-secondary); }
.${CSS_TIME} { color: var(--dsw-alias-label-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsh-sp-status-announcement { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.dsh-sp-state-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: currentColor; }
.${CSS_STATUS}[data-tone=active] { color: var(--dsw-alias-label-deep-diving, #3159b5); }
.${CSS_STATUS}[data-tone=attention] { color: color-mix(in srgb, #d79a13 65%, var(--dsw-alias-label-primary, #0f1115)); }
.${CSS_STATUS}[data-tone=error] { color: var(--dsw-alias-state-error-primary, #c92d39); }
@media (max-width: 640px) { [data-dsh-user-title] { --dsh-task-title-padding: 12px; --dsh-task-title-radius: 12px; } }
@media (forced-colors: active) { .${CSS_STATUS} { color: CanvasText; } .dsh-sp-state-dot { forced-color-adjust: none; background: CanvasText; } }
/* 排队消息面板盖住输入框：面板与卡片同处 composer 区，面板自己建了 isolation 上下文
   并用伪元素画背景，只改它模块内的 z-index 压不到卡片这一层。这里反过来给卡片建立
   层级、把面板压下去：面板仍在普通流内，只是不会再浮到输入框上面。 */
[data-conversation-region="composer"] [data-composer-card] {
  position: relative;
  z-index: 1;
}
[data-composer-dock] [data-queue-dock] {
  position: relative;
  z-index: 0;
}
/* 附件沿用原生尺寸和交互，统一从左侧排列。 */
[data-message-attachments] {
  justify-content: flex-start !important;
  align-self: stretch !important;
  width: 100%;
}
[data-message-attachments] > * {
  align-self: flex-start;
}
[data-message-attachments] [data-align="end"] {
  justify-content: flex-start !important;
  align-self: flex-start !important;
}
/* 统一标题中单图和多图的缩略图尺寸，保留原生预览和重试操作。 */
[data-dsh-user-title] [data-message-attachments] [data-align] > button[data-variant],
[data-submission-echo] [data-message-attachments] [data-align] > button[data-variant] {
  box-sizing: border-box;
  width: 96px !important;
  height: 96px !important;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  aspect-ratio: 1;
}
[data-dsh-user-title] [data-message-attachments] [data-align] > button[data-variant] img,
[data-submission-echo] [data-message-attachments] [data-align] > button[data-variant] img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center !important;
}
/* 同一行里文字气泡跟着图片一起靠左。 */
[data-dsh-user-title] [data-message-bubble],
[data-submission-echo] [data-message-bubble] {
  text-align: left;
}
/* 原生附件与文字节点共用一层包装。用网格把它们排到不同的行，
   文字行单独绘制卡片，图片行与卡片外沿对齐。 */
${IMAGE_LAYOUT} {
  grid-template:
    "before before" auto
    "text trailing" auto
    "attachments attachments" auto
    "references references" auto
    / minmax(0, 1fr) auto;
  column-gap: 8px;
}
${IMAGE_LAYOUT} > ${TITLE_BODY} { display: contents; }
${IMAGE_LAYOUT} > :not(${TITLE_BODY}, ${TITLE_TRAILING}) { margin-inline-end: 0; }
${IMAGE_LAYOUT} > ${TITLE_BODY} > [data-message-bubble] {
  grid-area: text;
  min-width: 0;
  width: auto !important;
  margin-inline-start: var(--dsh-task-title-padding);
}
${IMAGE_LAYOUT} > ${TITLE_TRAILING} { margin-inline-end: var(--dsh-task-title-padding) !important; }
${IMAGE_TEXT_LAYOUT}::before {
  content: '';
  grid-area: text-start / 1 / text-end / -1;
  align-self: stretch;
  box-sizing: border-box;
}
${IMAGE_TEXT_LAYOUT} > ${TITLE_TRAILING},
${IMAGE_TEXT_LAYOUT} > ${TITLE_BODY} > [data-message-bubble] { margin-block: 10px !important; }
${IMAGE_TEXT_LAYOUT}::before,
${IMAGE_TEXT_LAYOUT} > ${TITLE_TRAILING},
${IMAGE_TEXT_LAYOUT} > ${TITLE_BODY} > [data-message-bubble] {
  translate: var(--dsh-task-title-translate, none);
  z-index: 1;
}
${IMAGE_LAYOUT} > ${TITLE_BODY} > [data-message-attachments] {
  grid-area: attachments;
  min-width: 0;
  margin-block-start: 8px;
}
${IMAGE_LAYOUT} > ${TITLE_BODY} > :not([data-message-bubble], [data-message-attachments]) {
  grid-area: references;
  margin-block-start: 8px;
}
`;
    function collectTurnPages(column) {
      const seat = column.querySelector(':scope > [data-slot="conversation.chat.flow"]') ?? column;
      const pages = new Map();
      const leading = [];
      let page;
      for (const row of seat.children) {
        if (!row.matches(TURN_ROW)) continue;
        const echo = row.matches(TRANSCRIPT_ECHO);
        const next = row.nextElementSibling;
        // The native flow can place a new local prompt just before its opening process row.
        const openingTurn = echo && next?.matches('[data-chat-flow-kind="turn-process"]') ? next.dataset.chatTurn : undefined;
        const turn = row.dataset.chatTurn ?? openingTurn;
        const key = turn ?? (echo ? row : null);
        if (key !== null) {
          page = pages.get(key);
          if (!page) {
            page = { key, rows: leading.splice(0) };
            pages.set(key, page);
          }
          if (echo) page.echo = row;
        }
        (page?.rows ?? leading).push(row);
      }
      return [...pages.values()];
    }

    const PHASE_TONES = {
      preparing: 'active', running: 'active',
      approval: 'attention', question: 'attention', review: 'attention', stopping: 'attention',
      settling: 'neutral', stopped: 'neutral', interrupted: 'attention',
      failed: 'error', limited: 'attention', blocked: 'attention', ended: 'neutral', unknown: 'neutral',
    };

    const phaseOf = ({ turn, newest, session, pending, stopping, preparing }) => {
      const reason = turn?.end?.data?.reason?.kind;
      // A closed historical turn owns its result even while a different turn is running.
      if (reason !== undefined) return ({
        completed: 'completed', aborted: 'stopped', interrupted: 'interrupted', error: 'failed',
        'max-tokens': 'limited', blocked: 'blocked', forked: 'ended',
      })[reason] ?? 'ended';
      if (!newest) return 'unknown';
      if (stopping) return 'stopping';
      if (pending === 'approval') return 'approval';
      if (pending === 'question') return 'question';
      if (pending === 'plan-review') return 'review';
      if (session.openState === 'error' || (!session.running && session.lastAgentError)
        || session.promptError?.op === 'send') return 'failed';
      if (preparing || session.awaitingFirstTurn) return 'preparing';
      if (session.running) return 'running';
      if (turn?.status === 'open') return 'settling';
      return 'unknown';
    };

    const duration = (ms, t) => {
      const total = Math.max(1, Math.floor(ms / 1000));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor(total / 60) % 60;
      return `${hours > 0 ? `${hours}${t('unit.hour')}` : ''}`
        + `${total >= 60 ? `${minutes}${t('unit.minute')}` : ''}${total % 60}${t('unit.second')}`;
    };

    function NativeTitles({ useChat, useSession, useSessionStatus, sessionId, t }) {
      const timeline = useChat(snapshot => snapshot.timeline);
      const session = useSession(snapshot => snapshot);
      const pending = useSessionStatus?.(map => map.get(sessionId)?.pendingInteraction?.kind);
      const [source, setSource] = React.useState(null);
      const [targets, setTargets] = React.useState([]);
      const [clock, setClock] = React.useState(undefined);
      const [stopping, setStopping] = React.useState(false);
      const stoppingRef = React.useRef(false);
      const newest = timeline.turnOrder.at(-1);
      const heldClock = React.useRef(undefined);
      const syncRef = React.useRef(null);
      if (clock !== undefined) heldClock.current = clock;
      React.useEffect(() => { stoppingRef.current = false; setStopping(false); heldClock.current = undefined; }, [sessionId, newest]);
      React.useEffect(() => { if (!session.running || session.promptError?.op === 'stop') { stoppingRef.current = false; setStopping(false); } }, [session.running, session.promptError]);

      React.useLayoutEffect(() => {
        const scroller = source?.closest('[data-conversation-scroll]');
        if (!scroller) return undefined;
        scroller.setAttribute('data-dsh-native-task-titles', '');
        const records = new Map();
        const composer = scroller.querySelector('[data-composer-seat]');
        let view;
        let pages = [];
        let hidden = new Set();
        let selectedKey = null, shownKey = null;
        let latestKey = null, latestEcho = null, historyFrom = null;
        let history, historyButton, historyLoading;
        let pageTransition;
        let lastWheel = -Infinity;
        let titleRows = [];
        let pinned = null;
        let pinnedOffset = 0;
        let titleSignature = '', nextRecordId = 0;
        const setPinnedTitle = (record, offset) => {
          if (pinned === record && pinnedOffset === offset) return;
          if (pinned && pinned !== record) {
            pinned.flow.removeAttribute('data-dsh-task-pinned');
            pinned.flow.style.removeProperty('--dsh-task-title-translate');
          }
          if (record) {
            record.flow.setAttribute('data-dsh-task-pinned', '');
            record.flow.style.setProperty('--dsh-task-title-translate', `0 ${offset}px`);
          }
          pinned = record;
          pinnedOffset = offset;
        };
        const titleTop = record => {
          // Compare each title's original position in the transcript.
          const offset = record === pinned ? pinnedOffset : 0;
          if (record.bubble && record.layout.matches(IMAGE_TEXT_LAYOUT)) {
            const text = record.bubble.getBoundingClientRect();
            const height = parseFloat(getComputedStyle(record.layout, '::before').height);
            return text.top + (text.height - height) / 2 - offset;
          }
          return record.flow.getBoundingClientRect().top - offset;
        };
        const syncPinnedTitle = () => {
          const record = titleRows.find(item => item.bubble);
          if (!view || !record) {
            setPinnedTitle(null, 0);
            return;
          }
          const top = view.viewport.getBoundingClientRect().top + TITLE_INSET;
          const offset = top - titleTop(record);
          if (offset > 0) setPinnedTitle(record, offset);
          else setPinnedTitle(null, 0);
        };
        const restore = record => {
          if (record === pinned) setPinnedTitle(null, 0);
          record.flow.removeAttribute('data-dsh-user-title');
          record.body.removeAttribute('data-dsh-task-title-body');
          record.layout.removeAttribute('data-dsh-task-title-layout');
          if (record.title === null) record.bubble?.removeAttribute('title');
          else record.bubble?.setAttribute('title', record.title);
          record.host.remove();
        };
        const updateHiddenRows = next => {
          for (const row of hidden) if (!next.has(row)) row.removeAttribute('data-dsh-turn-hidden');
          for (const row of next) if (!hidden.has(row)) row.setAttribute('data-dsh-turn-hidden', '');
          hidden = next;
        };
        const cancelPageTransition = () => {
          if (!pageTransition) return;
          pageTransition.skipTransition();
          pageTransition = undefined;
          view.root.removeAttribute('data-dsh-turn-transition');
        };
        const changePage = (key, direction) => {
          if (!view || pageTransition || selectedKey === key) return;
          const origin = selectedKey;
          const currentView = view;
          const { root } = currentView;
          const updatePage = () => {
            if (view !== currentView || selectedKey !== origin || !pages.some(page => page.key === key)) return;
            selectedKey = key;
            sync();
          };
          if (typeof root.startViewTransition !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            updatePage();
            return;
          }
          root.dataset.dshTurnTransition = direction < 0 ? 'older' : 'newer';
          const transition = root.startViewTransition(() => {
            if (pageTransition !== transition) return;
            // Capture the new card after React mounts its status and elapsed time.
            if (typeof flushSync === 'function') flushSync(updatePage);
            else updatePage();
          });
          pageTransition = transition;
          const finish = () => {
            if (pageTransition !== transition) return;
            pageTransition = undefined;
            root.removeAttribute('data-dsh-turn-transition');
          };
          transition.ready.catch(() => {});
          transition.updateCallbackDone.catch(() => {});
          transition.finished.then(finish, finish);
        };
        const navigate = direction => {
          const index = pages.findIndex(page => page.key === selectedKey);
          const target = index < 0 ? undefined : pages[index + direction];
          if (target) {
            historyFrom = null;
            changePage(target.key, direction);
            return true;
          }
          if (direction < 0 && index === 0 && historyButton && !historyButton.disabled && !historyLoading) {
            historyFrom = selectedKey;
            historyButton.click();
            return true;
          }
          return false;
        };
        const flipAtEdge = event => {
          const newGesture = event.timeStamp - lastWheel > 180;
          lastWheel = event.timeStamp;
          if (event.defaultPrevented || event.ctrlKey || event.shiftKey
            || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          if (pageTransition) {
            event.preventDefault();
            return;
          }
          if (!newGesture) return;
          const { viewport } = view;
          const delta = event.deltaY;
          const atEdge = delta < 0 ? viewport.scrollTop <= 1
            : viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1;
          if (!atEdge) return;
          // Let embedded scroll areas handle the wheel when they can move in its direction.
          for (let node = event.target; node instanceof Element && node !== viewport; node = node.parentElement) {
            if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)
              && (delta < 0 ? node.scrollTop > 1 : node.scrollHeight - node.clientHeight - node.scrollTop > 1)) return;
          }
          if (navigate(delta < 0 ? -1 : 1)) event.preventDefault();
        };
        const detachView = () => {
          setPinnedTitle(null, 0);
          updateHiddenRows(new Set());
          for (const record of records.values()) restore(record);
          records.clear();
          if (!view) return;
          const { column, viewport, root, frame } = view;
          cancelPageTransition();
          viewport.removeEventListener('scroll', syncPinnedTitle);
          viewport.removeEventListener('wheel', flipAtEdge);
          viewport.removeAttribute('data-dsh-turn-viewport');
          viewport.style.removeProperty('--dsh-turn-viewport-height');
          column.style.removeProperty('--dsh-user-title-width');
          root.removeAttribute('data-dsh-turn-root');
          frame.removeAttribute('data-dsh-turn-frame');
          resize.unobserve(column);
          view = undefined;
          pages = titleRows = [];
          selectedKey = shownKey = latestKey = latestEcho = historyFrom = null;
        };
        const bindView = column => {
          detachView();
          const viewport = column?.parentElement;
          const root = viewport?.parentElement;
          const frame = root?.parentElement;
          if (!frame) return;
          view = { column, viewport, root, frame };
          viewport.addEventListener('scroll', syncPinnedTitle, { passive: true });
          viewport.addEventListener('wheel', flipAtEdge, { passive: false });
          resize.observe(column);
        };
        const syncTitles = rows => {
          for (const [flow, record] of records) {
            if (rows.includes(flow)) continue;
            restore(record);
            records.delete(flow);
          }
          for (const flow of rows) {
            const bubble = flow.querySelector('[data-message-bubble]');
            const body = (bubble ?? flow.querySelector(IMAGE_ATTACHMENTS))?.parentElement;
            const current = records.get(flow);
            if (current && current.body === body && current.bubble === bubble && current.host.isConnected) continue;
            if (current) { restore(current); records.delete(flow); }
            if (!body?.parentElement) continue;
            const layout = body.parentElement;
            const host = document.createElement('span'); host.dataset.dshTaskMetadata = '';
            layout.append(host);
            const title = bubble?.getAttribute('title') ?? null;
            if (bubble) bubble.setAttribute('title', bubble.textContent ?? '');
            flow.setAttribute('data-dsh-user-title', '');
            body.setAttribute('data-dsh-task-title-body', '');
            layout.setAttribute('data-dsh-task-title-layout', '');
            records.set(flow, { flow, bubble, body, layout, host, title, turn: flow.hasAttribute('data-submission-echo') ? null : Number(flow.dataset.chatTurn), key: ++nextRecordId });
          }
          titleRows = rows.map(row => records.get(row)).filter(Boolean);
          const signature = titleRows.map(record => record.key).join('|');
          if (titleSignature === signature) return;
          titleSignature = signature;
          setTargets(titleRows);
        };
        const sync = () => {
          const column = scroller.querySelector('[data-chat-flow]');
          if (column !== (view?.column ?? null)) bindView(column);
          if (!view) {
            syncTitles([]);
            return;
          }
          pages = collectTurnPages(column);
          const latest = pages.at(-1);
          const previousLatest = latestKey;
          latestKey = latest?.key ?? null;
          const newEcho = latest?.echo && latest.echo !== latestEcho;
          latestEcho = latest?.echo ?? null;
          let index = pages.findIndex(page => page.key === selectedKey);
          if (index < 0 || newEcho || (selectedKey === previousLatest && latestKey !== previousLatest)) index = pages.length - 1;
          const selected = pages[index];
          if (index > 0 && historyFrom === selected.key) {
            const target = pages[index - 1].key;
            const currentView = view;
            historyFrom = null;
            queueMicrotask(() => {
              if (view === currentView && selectedKey === selected.key) changePage(target, -1);
            });
          }
          if (selectedKey !== (selected?.key ?? null)) cancelPageTransition();
          selectedKey = selected?.key ?? null;
          history = column.querySelector(':scope > [data-chat-history]');
          historyButton = history?.querySelector(':scope > button');
          historyLoading = ['loading', 'pendingConsumption'].includes(history?.dataset.chatHistory);
          if (!historyButton || historyButton.disabled || history?.dataset.chatHistory === 'error' || historyFrom !== selectedKey) historyFrom = null;

          const { viewport, root, frame } = view;
          const paging = selected !== undefined;
          viewport.toggleAttribute('data-dsh-turn-viewport', paging);
          root.toggleAttribute('data-dsh-turn-root', paging);
          frame.toggleAttribute('data-dsh-turn-frame', paging);
          const nextHidden = new Set(pages.flatMap(page => page === selected ? [] : page.rows));
          if (history && index > 0) nextHidden.add(history);
          updateHiddenRows(nextHidden);
          if (shownKey !== selectedKey) {
            setPinnedTitle(null, 0);
            viewport.scrollTop = 0;
            shownKey = selectedKey;
          }
          syncTitles(selected?.rows.filter(row => row.matches(MESSAGE_SELECTOR)) ?? []);

          if (paging) {
            // Native follow writes to the outer scrollport; the page owns its own scroll position.
            const viewportTop = viewport.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
            const composerHeight = composer?.getBoundingClientRect().height ?? 0;
            const available = Math.max(0, Math.floor(scroller.clientHeight - composerHeight - viewportTop));
            viewport.style.setProperty('--dsh-turn-viewport-height', `${available}px`);
            column.style.setProperty('--dsh-user-title-width', `${column.clientWidth}px`);
          }
          syncPinnedTitle();

          const elapsed = scroller.querySelector('[data-chat-running]')?.textContent?.match(/用时\s*([0-9]+(?:小时|时|分|秒)[0-9时分秒]*)/u)?.[1];
          setClock(previous => previous === elapsed ? previous : elapsed);
        };
        syncRef.current = sync;
        const observer = new MutationObserver(sync);
        observer.observe(scroller, {
          childList: true, subtree: true, characterData: true,
          attributes: true, attributeFilter: ['data-chat-turn', 'data-chat-flow-kind', 'data-chat-history', 'disabled'],
        });
        const resize = new ResizeObserver(sync);
        resize.observe(scroller);
        if (composer) resize.observe(composer);
        const stop = event => {
          const button = event.target instanceof Element ? event.target.closest('button') : null;
          if (button && !button.disabled && button.closest('[data-composer-card]')
            && /^(停止|停止生成|停止任务|Stop|Stop generation|Stop task)$/iu.test(button.getAttribute('aria-label') ?? '')) {
            if (stoppingRef.current) { event.preventDefault(); event.stopImmediatePropagation(); return; }
            stoppingRef.current = true; setStopping(true);
          }
        };
        scroller.addEventListener('click', stop, true);
        sync();
        return () => {
          syncRef.current = null;
          observer.disconnect(); resize.disconnect();
          scroller.removeEventListener('click', stop, true); scroller.removeAttribute('data-dsh-native-task-titles');
          detachView();
        };
      }, [source, sessionId]);
      React.useLayoutEffect(() => { syncRef.current?.(); }, [newest, session.pendingSubmissions, session.hasMore, session.loadingOlder, session.historyLoadStatus]);

      return h(React.Fragment, null,
        h('span', { ref: setSource, style: { display: 'none' }, 'aria-hidden': 'true' }),
        ...targets.map(record => {
          const echo = record.turn === null;
          const turn = timeline.turns.get(record.turn), latest = record.turn === newest;
          const phase = echo ? 'preparing' : phaseOf({ turn, newest: latest, session, pending: latest ? pending : undefined, stopping: latest && stopping, preparing: false });
          const start = turn?.start?.time, end = turn?.end?.time;
          const elapsed = echo ? undefined : Number.isFinite(start) && Number.isFinite(end) ? duration(end - start, t)
            : latest ? (clock ?? (stopping ? heldClock.current : undefined)) : undefined;
          const label = t(`state.${phase}`);
          return createPortal(h(React.Fragment, null,
            h('span', { className: 'dsh-sp-status-announcement', 'data-phase': phase, role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, label),
            phase !== 'completed' && h('span', { className: CSS_STATUS, 'data-tone': PHASE_TONES[phase], title: label, 'aria-hidden': 'true' },
              h('span', { className: 'dsh-sp-state-dot' })),
            elapsed !== undefined && h('span', { className: CSS_TIME }, elapsed)), record.host, record.key);
        }));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = [];
          const dictionaries = [
            [
                        "zh",
                        {
                                    "state.preparing": "准备中",
                                    "state.running": "进行中",
                                    "state.approval": "待审批",
                                    "state.question": "待回复",
                                    "state.review": "待确认",
                                    "state.stopping": "正在停止",
              "state.settling": "收尾中",
                                    "state.completed": "已完成",
                                    "state.stopped": "已停止",
                                    "state.interrupted": "已中断",
                                    "state.failed": "失败",
                                    "state.limited": "达到上限",
                                    "state.blocked": "受阻",
                                    "state.ended": "已结束",
                                    "state.unknown": "状态未知",
                                    "row.elapsed": "用时",
                                    "unit.hour": "小时",
                                    "unit.minute": "分",
                                    "unit.second": "秒"
                        }
            ],
            [
                        "en",
                        {
                                    "state.preparing": "Preparing",
                                    "state.running": "Running",
                                    "state.approval": "Approval needed",
                                    "state.question": "Reply needed",
                                    "state.review": "Review needed",
                                    "state.stopping": "Stopping",
              "state.settling": "Finishing",
                                    "state.completed": "Done",
                                    "state.stopped": "Stopped",
                                    "state.interrupted": "Interrupted",
                                    "state.failed": "Failed",
                                    "state.limited": "Limit reached",
                                    "state.blocked": "Blocked",
                                    "state.ended": "Ended",
                                    "state.unknown": "Unknown",
                                    "row.elapsed": "Duration",
                                    "unit.hour": "h ",
                                    "unit.minute": "m ",
                                    "unit.second": "s"
                        }
            ]
];
          try {
            for (const [locale, dict] of dictionaries) disposers.push(ctx.locale.register(NS, locale, dict));
          } catch (error) {
            for (const dispose of disposers.reverse()) dispose();
            throw error;
          }
          return () => { for (const dispose of disposers) dispose(); };
        }, 'running-prompt-status: dictionaries');

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-running-prompt-status';
          style.textContent = STYLESHEET;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'running-prompt-status: styles');

        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock', id: 'running-prompt-status', order: -10, locale: NS,
        }, NativeTitles));
      },
    };
  },
});
