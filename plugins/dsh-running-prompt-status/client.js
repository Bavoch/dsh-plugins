/** User messages themselves are the sticky task headings; no title text is copied. */
window.__ModuleLoader__.load({
  id: '@local/dsh-running-prompt-status',
  factory(require) {
    const React = require('react');
    const { createPortal } = require('react-dom');
    const h = React.createElement;
    const NS = 'running-prompt-status';
    const MESSAGE_SELECTOR = '[data-chat-flow-kind="user"][data-chat-turn], [data-submission-echo]:not([data-pending-steering])';
    const CSS_STATUS = 'dsh-sp-title-status';
    const CSS_TIME = 'dsh-sp-title-time';
    const STYLESHEET = `
/* 标题已显示任务状态与用时；只隐藏重复提示，保留节点供实时计时读取。 */
[data-conversation-scroll] [data-chat-running] { display: none !important; }
[data-dsh-task-landing] { visibility: hidden !important; }
[data-dsh-task-scroll] { padding-top: 0 !important; }
/* 每个任务单独一屏：标题与其后的回复紧跟着从上往下排，不再吸顶或贴底。 */
[data-dsh-native-task-titles] { overflow-anchor: none; scrollbar-gutter: stable; scroll-behavior: auto !important; }
[data-dsh-native-task-titles] [data-chat-flow-kind="user"]:not([data-dsh-user-title]),
[data-dsh-native-task-titles] [data-submission-echo]:not([data-pending-steering]):not([data-dsh-user-title]) { visibility: hidden; }
[data-dsh-native-task-titles] button[data-turn-process] { border-bottom: 0 !important; }
[data-dsh-native-task-titles] [data-chat-flow] { padding-bottom: var(--dsh-task-tail-space, 0px); }
[data-dsh-user-title] {
  position: relative !important; top: auto; z-index: 10; flex: none;
  width: var(--dsh-user-title-width) !important; max-width: none !important;
  align-self: center; box-sizing: border-box; margin-block: 8px 4px !important;
  padding: 10px 16px;
  background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base, #fff));
  border: 1px solid var(--dsw-alias-border-main, rgba(128,128,128,.18));
  border-radius: 14px;
  box-shadow: 0 2px 10px rgba(0,0,0,.06);
  text-align: left;
}
[data-dsh-task-title-layout] { display: flex; flex-direction: row; align-items: center; gap: 8px; width: 100%; }
[data-dsh-task-title-body] { flex: 1; min-width: 0; max-width: none !important; }
[data-dsh-user-title] [data-message-bubble] {
  display: block; background: none !important; border: 0 !important; border-radius: 0 !important;
  padding: 0 !important; width: 100% !important; max-width: none !important;
  text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-height: 24px; line-height: 24px;
}
[data-dsh-user-title] [data-clock=start] { flex: none; margin: 0 !important; }
[data-dsh-user-title] [data-clock=start] > span { display: none; }
[data-dsh-task-metadata] { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex: none; font-size: 12px; min-inline-size: calc(10em + 8px); }
.${CSS_STATUS} { min-inline-size: 5em; display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: none; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.${CSS_TIME} { display: inline-block; min-inline-size: 5em; text-align: right; font-size: 12px; color: var(--dsw-alias-label-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsh-sp-state-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: currentColor; }
.${CSS_STATUS}[data-tone=active] { color: var(--dsw-alias-label-deep-diving, #3159b5); }
.${CSS_STATUS}[data-tone=success] { color: color-mix(in srgb, var(--dsw-alias-state-success-primary, #22c55e) 60%, var(--dsw-alias-label-primary, #0f1115)); }
.${CSS_STATUS}[data-tone=attention] { color: color-mix(in srgb, #d79a13 65%, var(--dsw-alias-label-primary, #0f1115)); }
.${CSS_STATUS}[data-tone=error] { color: var(--dsw-alias-state-error-primary, #c92d39); }
@media (max-width: 640px) { [data-dsh-user-title] { padding-inline: 12px; border-radius: 12px; } }
@media (forced-colors: active) { .${CSS_STATUS} { color: CanvasText; } .dsh-sp-state-dot { forced-color-adjust: none; background: CanvasText; } }
`;
    const PHASE_TONES = {
      preparing: 'active', running: 'active',
      approval: 'attention', question: 'attention', review: 'attention', stopping: 'attention',
      settling: 'neutral', completed: 'success', stopped: 'neutral', interrupted: 'attention',
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
        const columns = new Set();
        let signature = '';
        let lastNewestFlow, nextRecordId = 0;
        let landing = null, landingReady = false, landingFrame = 0, releaseFrame = 0;
        const alignLanding = () => {
          if (!landing?.isConnected) return;
          const top = landing.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 8;
          scroller.scrollTop = Math.max(0, top);
          const aligned = Math.abs(landing.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 8) <= 1;
          if (landingReady && aligned) landing.removeAttribute('data-dsh-task-landing');
        };
        const cancelLanding = () => {
          landing?.removeAttribute('data-dsh-task-landing'); landing = null;
          cancelAnimationFrame(landingFrame); cancelAnimationFrame(releaseFrame);
        };
        const stickToLatest = latestFlow => {
          if (!latestFlow || latestFlow === lastNewestFlow) return;
          cancelLanding(); lastNewestFlow = latestFlow; landing = latestFlow; landingReady = false;
          // Native follow layout may still reclaim its old tail space in this commit.
          // Reveal the original message only after its final geometry is aligned, never at the old position.
          landing.setAttribute('data-dsh-task-landing', ''); alignLanding();
          landingFrame = requestAnimationFrame(() => {
            landingReady = true; alignLanding();
            const release = () => {
              alignLanding();
              if (!landing || !landing.hasAttribute('data-dsh-task-landing')) cancelLanding();
              else releaseFrame = requestAnimationFrame(release);
            };
            releaseFrame = requestAnimationFrame(release);
          });
        };
        const restore = record => {
          record.flow.removeAttribute('data-dsh-user-title');
          record.flow.removeAttribute('data-dsh-task-landing');
          record.body.removeAttribute('data-dsh-task-title-body');
          record.layout.removeAttribute('data-dsh-task-title-layout');
          if (record.title === null) record.bubble.removeAttribute('title');
          else record.bubble.setAttribute('title', record.title);
          record.host.remove();
        };
        const sync = () => {
          const flows = [...scroller.querySelectorAll(MESSAGE_SELECTOR)];
          for (const [flow, record] of records) if (!flows.includes(flow)) { restore(record); records.delete(flow); }
          for (const flow of flows) {
            if (records.has(flow)) continue;
            const bubble = flow.querySelector('[data-message-bubble]');
            if (!bubble || !bubble.parentElement?.parentElement) continue;
            const body = bubble.parentElement, layout = body.parentElement;
            const host = document.createElement('span'); host.dataset.dshTaskMetadata = '';
            layout.append(host);
            const title = bubble.getAttribute('title');
            bubble.setAttribute('title', bubble.textContent ?? '');
            flow.setAttribute('data-dsh-user-title', '');
            body.setAttribute('data-dsh-task-title-body', ''); layout.setAttribute('data-dsh-task-title-layout', '');
            records.set(flow, { flow, bubble, body, layout, host, title, turn: flow.hasAttribute('data-submission-echo') ? null : Number(flow.dataset.chatTurn), key: flow.dataset.chatFlowKey ?? `echo:${++nextRecordId}` });
          }
          const list = flows.map(flow => records.get(flow)).filter(Boolean);
          const column = list[0]?.flow.closest('[data-chat-flow]');
          if (column) {
            columns.add(column);
            const available = column.clientWidth;
            column.style.setProperty('--dsh-user-title-width', `${available}px`);
            column.parentElement.setAttribute('data-dsh-task-scroll', '');
            // Use intrinsic section height, never the scroll floor or native fold spacer:
            // padding writes must not feed back into the next padding measurement.
            const last = list.at(-1);
            const old = parseFloat(column.style.getPropertyValue('--dsh-task-tail-space')) || 0;
            const contentHeight = column.getBoundingClientRect().bottom - old - last.flow.getBoundingClientRect().top + 8;
            const composer = scroller.querySelector('[data-composer-seat]');
            const composerHeight = composer?.getBoundingClientRect().height ?? 0;
            const bottomInset = parseFloat(getComputedStyle(column.parentElement).paddingBottom) || 0;
            const extra = Math.max(0, Math.ceil(scroller.clientHeight - composerHeight - bottomInset - contentHeight));
            if (Math.abs(extra - old) > 1) column.style.setProperty('--dsh-task-tail-space', `${extra}px`);
          }
          const nextSignature = list.map(record => record.key).join('|');
          if (signature !== nextSignature) { signature = nextSignature; setTargets(list); stickToLatest(list.at(-1)?.flow); }
          alignLanding();
          const elapsed = scroller.querySelector('[data-chat-running]')?.textContent?.match(/用时\s*([0-9]+(?:小时|时|分|秒)[0-9时分秒]*)/u)?.[1];
          setClock(previous => previous === elapsed ? previous : elapsed);
        };
        syncRef.current = sync;
        // Native follow runs during the same commit. Consume content growth before paint,
        // rather than leaving its old tail padding in place until the next animation frame.
        const observer = new MutationObserver(sync);
        observer.observe(scroller, { childList: true, subtree: true, characterData: true });
        const resize = new ResizeObserver(sync); resize.observe(scroller);
        const column = scroller.querySelector('[data-chat-flow]'); if (column) resize.observe(column);
        const stop = event => {
          const button = event.target instanceof Element ? event.target.closest('button') : null;
          if (button && !button.disabled && button.closest('[data-composer-card]')
            && /^(停止|停止生成|停止任务|Stop|Stop generation|Stop task)$/iu.test(button.getAttribute('aria-label') ?? '')) {
            if (stoppingRef.current) { event.preventDefault(); event.stopImmediatePropagation(); return; }
            stoppingRef.current = true; setStopping(true);
          }
        };
        scroller.addEventListener('click', stop, true);
        scroller.addEventListener('wheel', cancelLanding, { passive: true });
        scroller.addEventListener('touchstart', cancelLanding, { passive: true });
        sync();
        return () => {
          cancelLanding();
          scroller.removeEventListener('wheel', cancelLanding); scroller.removeEventListener('touchstart', cancelLanding);
          syncRef.current = null;
          observer.disconnect(); resize.disconnect();
          scroller.removeEventListener('click', stop, true); scroller.removeAttribute('data-dsh-native-task-titles');
          for (const record of records.values()) restore(record);
          for (const flow of columns) {
            flow.style.removeProperty('--dsh-user-title-width'); flow.style.removeProperty('--dsh-task-tail-space');
            flow.parentElement?.removeAttribute('data-dsh-task-scroll');
          }
        };
      }, [source, sessionId]);
      React.useLayoutEffect(() => { syncRef.current?.(); }, [newest, session.pendingSubmissions]);

      return h(React.Fragment, null,
        h('span', { ref: setSource, style: { display: 'none' }, 'aria-hidden': 'true' }),
        ...targets.map(record => {
          const echo = record.turn === null;
          const turn = timeline.turns.get(record.turn), latest = record.turn === newest;
          const phase = echo ? 'preparing' : phaseOf({ turn, newest: latest, session, pending: latest ? pending : undefined, stopping: latest && stopping, preparing: false });
          const start = turn?.start?.time, end = turn?.end?.time;
          const elapsed = echo ? undefined : Number.isFinite(start) && Number.isFinite(end) ? duration(end - start, t)
            : latest ? (clock ?? (stopping ? heldClock.current : undefined)) : undefined;
          const detail = phase === 'failed' ? (turn?.end?.data?.reason?.error?.message ?? t('state.failed')) : t(`state.${phase}`);
          return createPortal(h(React.Fragment, null,
            h('span', { className: CSS_STATUS, 'data-tone': PHASE_TONES[phase], 'data-phase': phase, title: detail, role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
              h('span', { className: 'dsh-sp-state-dot', 'aria-hidden': 'true' }), t(`state.${phase}`)),
            h('span', { className: CSS_TIME, 'aria-hidden': elapsed === undefined ? 'true' : undefined }, elapsed ?? '')), record.host, record.key);
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
