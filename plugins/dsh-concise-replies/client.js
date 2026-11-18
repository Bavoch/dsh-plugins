window.__ModuleLoader__.load({
  id: '@local/dsh-concise-replies',
  factory(require) {
    const React = require('react');
    const { createElement: h } = React;
    const { createPortal } = require('react-dom');
    const NS = 'concise-reply-outcomes';
    const dismissedNextTasks = new Set();
    const reasons = {
      aborted: 'stopped', interrupted: 'interrupted', error: 'failed',
      'max-tokens': 'limited', blocked: 'blocked',
    };

    const HINT_STYLE = `
[data-dsh-next-task-visible] [data-composer-placeholder] { visibility: hidden; }
.dsh-nt-placeholder {
  position: absolute; inset: 4px 8px auto 14px; display: flex; align-items: baseline; gap: 10px;
  color: var(--dsw-alias-label-caption); pointer-events: none; user-select: none;
}
.dsh-nt-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-nt-key { flex: none; font-size: 11px; font-style: normal; opacity: .85; }
[data-composer-input][data-composer-composing] ~ .dsh-nt-placeholder { visibility: hidden; }
`;

    function NextTaskHint({ useChat, useSession, useInput, inputActions, useAccess, sessionId, t }) {
      const timeline = useChat(snapshot => snapshot.timeline);
      const session = useSession(snapshot => snapshot);
      const input = useInput(snapshot => snapshot);
      const denied = useAccess('session/prompt') === false;
      const newest = timeline.turnOrder.at(-1);
      const end = timeline.turns.get(newest)?.end;
      const key = end ? `${sessionId}:${end.seq}` : '';
      const [source, setSource] = React.useState(null);
      const [dom, setDom] = React.useState(null);
      const [hint, setHint] = React.useState(null);
      const [dismissed, setDismissed] = React.useState('');
      const [composing, setComposing] = React.useState(false);
      const dismiss = () => {
        dismissedNextTasks.add(key);
        if (dismissedNextTasks.size > 64) dismissedNextTasks.delete(dismissedNextTasks.values().next().value);
        setDismissed(key);
      };
      const descriptionId = React.useId();
      const available = !!key && end.data.reason.kind !== 'forked' && !session.running
        && session.openState === 'open' && !session.removed && !session.awaitingFirstTurn
        && !session.pendingSubmissions.length && session.promptError?.op !== 'send'
        && !denied && input.phase === 'plain' && !input.claim && input.draft === ''
        && !input.attachmentIds.length && !input.queue.length;

      React.useLayoutEffect(() => {
        const card = source?.closest('[data-composer-card]');
        const editor = card?.querySelector('[data-composer-input]');
        setDom(editor ? { card, editor, target: editor.parentElement } : null);
      }, [source, sessionId]);

      React.useEffect(() => {
        if (!available || dismissed === key || dismissedNextTasks.has(key)) return undefined;
        const controller = new AbortController();
        let current = true;
        fetch('/api/dsh-next-task', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, turn: newest, endSeq: end.seq }), signal: controller.signal,
        }).then(async response => {
          if (!response.ok) return;
          const result = await response.json();
          if (current && result.endSeq === end.seq && result.turn === newest
            && typeof result.suggestion === 'string' && result.suggestion.trim()) {
            setHint({ key, text: result.suggestion });
          }
        }).catch(() => {});
        return () => { current = false; controller.abort(); };
      }, [available, dismissed, key, sessionId, newest, end?.seq]);

      const visible = available && !composing && dismissed !== key && !dismissedNextTasks.has(key)
        && hint?.key === key && dom !== null;
      React.useLayoutEffect(() => {
        if (!visible) return undefined;
        const { card, editor } = dom;
        card.setAttribute('data-dsh-next-task-visible', '');
        const ids = new Set((editor.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(Boolean));
        ids.add(descriptionId);
        editor.setAttribute('aria-describedby', [...ids].join(' '));
        return () => {
          card.removeAttribute('data-dsh-next-task-visible');
          const ids = (editor.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter(id => id && id !== descriptionId);
          if (ids.length) editor.setAttribute('aria-describedby', ids.join(' '));
          else editor.removeAttribute('aria-describedby');
        };
      }, [visible, dom, descriptionId]);

      React.useEffect(() => {
        if (!dom) return undefined;
        const start = () => setComposing(true);
        const stop = () => setComposing(false);
        dom.editor.addEventListener('compositionstart', start);
        dom.editor.addEventListener('compositionend', stop);
        return () => {
          dom.editor.removeEventListener('compositionstart', start);
          dom.editor.removeEventListener('compositionend', stop);
        };
      }, [dom]);

      React.useLayoutEffect(() => {
        if (!visible) return undefined;
        const { editor } = dom;
        const adopt = event => {
          if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || event.repeat
            || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
            || editor.getAttribute('data-composer-composing') !== null || editor.textContent !== ''
            || editor.getAttribute('aria-expanded') === 'true' || editor.hasAttribute('aria-activedescendant')) return;
          const menuOpen = [...document.querySelectorAll('[role="listbox"], [role="menu"]')]
            .some(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
          if (menuOpen) return;
          if (event.key === 'Escape') { dismiss(); return; }
          if (event.key !== 'Tab') return;
          const span = inputActions.captureInsertion();
          if (span.start !== 0 || span.end !== 0) return;
          // Use the revision-guarded editor action: drafts, chips, attachments, persistence and undo remain native-owned.
          if (!inputActions.insertText(hint.text, span)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          dismiss();
        };
        editor.addEventListener('keydown', adopt, true);
        return () => editor.removeEventListener('keydown', adopt, true);
      }, [visible, dom, key, hint, inputActions]);

      return h(React.Fragment, null,
        h('span', { ref: setSource, style: { display: 'none' }, 'aria-hidden': 'true' }),
        !visible ? null : createPortal(h('div', {
          className: 'dsh-nt-placeholder', 'data-dsh-next-task': hint.text, title: hint.text,
          id: descriptionId,
        }, h('span', { style: { position: 'absolute', width: '1px', height: '1px', overflow: 'hidden', clipPath: 'inset(50%)' } }, t('nextTask.description') + ': '),
        h('span', { className: 'dsh-nt-text' }, hint.text),
        h('span', { className: 'dsh-nt-key' }, t('nextTask.accept'))), dom.target));
    }

    function UnfinishedResult({ turn, t }) {
      const reason = turn.end?.data?.reason?.kind;
      if (reason === undefined || reason === 'completed' || reason === 'forked') return null;
      // A cancelled or failed turn cannot ask the model for a closing reply. Never infer success from its last progress message.
      return h('p', {
        'data-dsh-unfinished-result': reason,
        style: {
          margin: '12px 0 0',
          color: 'var(--dsw-alias-label-primary)',
          fontSize: 'var(--dsh-content-font-size, 14px)',
          lineHeight: 1.7,
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
        },
      }, t(reasons[reason] ?? 'unknown'));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = [];
          try {
            disposers.push(ctx.locale.register(NS, 'zh', {
              stopped: '任务已停止，结果还没有最终确认，不能当作全部完成。停止前的操作可能已经生效。',
              interrupted: '任务已中断，结果还没有最终确认，不能当作全部完成。中断前的操作可能已经生效。',
              failed: '任务出错，没能正常结束，无法确认是否全部完成。出错前的操作可能已经生效。',
              limited: '本轮达到处理上限，结果可能不完整，尚不能确认全部完成。',
              blocked: '任务遇到阻碍，没能继续，尚不能确认全部完成。',
              unknown: '本轮未能正常结束，尚不能确认是否全部完成。',
              'nextTask.description': 'AI 建议的下一步任务',
              'nextTask.accept': 'Tab 采用',
            }));
            disposers.push(ctx.locale.register(NS, 'en', {
              stopped: 'The task was stopped before its result was confirmed. Earlier actions may already have taken effect; completion is unconfirmed.',
              interrupted: 'The task was interrupted before its result was confirmed. Earlier actions may already have taken effect; completion is unconfirmed.',
              failed: 'The task ended with an error. Earlier actions may already have taken effect; completion is unconfirmed.',
              limited: 'This turn reached its processing limit. The result may be incomplete; completion is unconfirmed.',
              blocked: 'The task could not continue because it was blocked. Completion is unconfirmed.',
              unknown: 'This turn did not end normally. Completion is unconfirmed.',
              'nextTask.description': 'AI-suggested next task',
              'nextTask.accept': 'Tab to use',
            }));
          } catch (error) {
            for (const dispose of disposers.reverse()) dispose();
            throw error;
          }
          return () => { for (const dispose of disposers.reverse()) dispose(); };
        }, 'concise-reply-outcomes: locales');

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-concise-replies';
          style.textContent = HINT_STYLE;
          document.head.append(style);
          return () => style.remove();
        }, 'next-task: inline placeholder');

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay', id: 'concise-next-task', locale: NS,
        }, NextTaskHint));

        ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
          name: 'conversation.chat.turnTail',
          id: 'concise-unfinished-result',
          order: -100,
          locale: NS,
        }, UnfinishedResult));
      },
    };
  },
});
