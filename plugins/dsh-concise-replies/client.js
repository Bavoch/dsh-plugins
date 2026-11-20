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

    const STYLE = `
[data-dsh-next-task-visible] [data-composer-placeholder] { visibility: hidden; }
/* Let the suggestion and editor share a row so wrapping expands the input only as needed. */
[data-input-scroll] > :has(> .dsh-nt-placeholder) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}
[data-input-scroll] > :has(> .dsh-nt-placeholder) > :is([data-composer-input], .dsh-nt-placeholder) {
  grid-area: 1 / 1;
}
.dsh-nt-placeholder {
  position: relative; align-self: start; padding: 4px 8px 0 14px;
  color: var(--dsw-alias-label-caption); pointer-events: none; user-select: none;
}
.dsh-nt-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
[data-composer-input][data-composer-composing] ~ .dsh-nt-placeholder { visibility: hidden; }

.dsh-plain-step {
  margin: 0;
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.65;
  color: var(--dsw-alias-label-secondary);
}
.dsh-plain-step [data-step-tone="active"] { color: var(--dsw-alias-label-deep-diving); }
.dsh-plain-step [data-step-tone="attention"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-plain-step [data-step-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.dsh-plain-step__action {
  padding: 0;
  border: 0;
  background: none;
  color: var(--dsw-alias-label-deep-diving);
  font: inherit;
  cursor: pointer;
}
.dsh-plain-step__action:is(:hover, :focus-visible) { text-decoration: underline; }
.dsh-plain-step__children { display: grid; gap: 4px; margin: 4px 0 0; padding-inline-start: 1.25em; }
[data-chat-flow-kind="tool-call"]:has(> [data-slot="conversation.chat.node"] > [data-dsh-merged-step]) {
  display: none;
}

/* The native compact group title can include the live tool argument summary. */
[data-step-process] {
  --dsh-plain-group-title: "Work steps";
}
[data-step-process]:lang(zh) { --dsh-plain-group-title: "执行步骤"; }
[data-step-process] button[data-process-activity] > :not(:has([data-step-process-icon])) { display: none; }
[data-step-process] button[data-process-activity]::after { content: var(--dsh-plain-group-title); }
[data-step-process] button[data-process-activity] [data-step-process-icon] { display: none; }
[data-step-process] button[data-process-activity] [data-step-process-chevron] { opacity: 1; }
[data-chat-flow-kind="turn-process"] [data-turn-process] { border-bottom: 0; }

/* The reasoning disclosure has a native preview separate from its body slot. */
[data-slot="conversation.chat.node"] [data-variant="think"] { display: none; }
[data-slot="conversation.chat.node"] [data-variant="think"][data-state="running"] {
  display: block;
  color: var(--dsw-alias-label-deep-diving);
  font-size: var(--dsh-content-font-size-secondary, 13px);
  line-height: 1.65;
}
[data-slot="conversation.chat.node"] [data-variant="think"][data-state="running"] > * { display: none; }
[data-slot="conversation.chat.node"] [data-variant="think"][data-state="running"]::before { content: "Reviewing the request"; }
[data-slot="conversation.chat.node"] [data-variant="think"][data-state="running"]:lang(zh)::before { content: "正在梳理任务"; }

[data-chat-flow-kind="assistant-step"] [data-slot="conversation.chat.node"] > div > div > span:last-child {
  padding: 0;
  border-radius: 0;
  background: none;
  color: var(--dsw-alias-state-warn-primary);
}
`;

    // Match only known names. Tool arguments, command descriptions, and output
    // can all contain command text, including in errors and saved history.
    const actions = new Map(Object.entries({
      read: 'read', read_image: 'read', glob: 'find', grep: 'find',
      web_search: 'research', web_fetch: 'research',
      write: 'update', edit: 'update', apply_patch: 'update',
      office_render: 'document', office_convert: 'document', office_recalculate: 'document',
      subagent: 'delegate', subagent_fork: 'delegate', wait_agent: 'wait',
      ask_user_question: 'question',
    }));
    const routineActions = new Set(['find', 'read', 'research']);
    const stepGroups = new WeakMap();

    function toolAction(block) {
      return actions.get('kind' in block ? block.call?.name : block.name) ?? 'work';
    }

    function stepState(block) {
      if (!('kind' in block)) return block.phase === 'preparing' ? 'preparing' : 'running';
      if (block.error?.code === 'interrupted') return 'stopped';
      return block.isError || block.meta?.stopped === true ? 'issue' : undefined;
    }

    function StepText({ state, children }) {
      const tone = state === 'issue' ? 'error' : state === 'stopped' ? 'attention' : state ? 'active' : undefined;
      return h('p', { className: 'dsh-plain-step' }, h('span', { 'data-step-tone': tone }, children));
    }

    function Operation({ block, canAnswer, showQuestion, t }) {
      const state = stepState(block);
      const action = toolAction(block);
      const label = canAnswer(block.callId)
        ? h('button', {
          type: 'button', className: 'dsh-plain-step__action', onClick: () => showQuestion(block.callId),
        }, t('step.answer'))
        : [t(`action.${action}`), state && t(`step.${state}`)].filter(Boolean).join(' · ');
      return h('div', { 'data-chat-anchor-key': `call:${block.callId}`, 'data-chat-call-id': block.callId },
        h(StepText, { state }, label),
        block.subCalls?.length > 0 && h('ul', { className: 'dsh-plain-step__children' },
          block.subCalls.map(child => h('li', { key: child.callId },
            h(Operation, { block: child, canAnswer, showQuestion, t })))));
    }

    function isRoutine(block, canAnswer) {
      const state = stepState(block);
      return routineActions.has(toolAction(block)) && state !== 'issue' && state !== 'stopped'
        && !block.subCalls?.length && !canAnswer(block.callId);
    }

    function isReasoningOnly(node) {
      return node.kind === 'assistant-step' && node.data.blocks.every(block =>
        block.kind === 'reasoning' || block.kind === 'tool-call' || (block.kind === 'text' && !block.text.trim()));
    }

    function groupRoutineSteps(nodes, keys, canAnswer) {
      const groups = new Map();
      let group;
      for (const key of keys) {
        const node = nodes.get(key);
        if (!node || node.visibility === 'hidden' || isReasoningOnly(node)) continue;
        const block = node.kind === 'tool-call' && node.data.root;
        if (!block || node.groupTree || !isRoutine(block, canAnswer)) {
          group = undefined;
          continue;
        }
        group ??= { first: key, size: 0, actions: new Set(), state: undefined };
        group.size += 1;
        group.actions.add(toolAction(block));
        const state = stepState(block);
        if (state === 'running' || group.state === undefined) group.state = state;
        groups.set(key, group);
      }
      return groups;
    }

    function RoutineWorkStep({ node, turn, useChat, questions, ...operation }) {
      const nodes = useChat(snapshot => snapshot.nodes);
      const keys = useChat(snapshot => snapshot.locations.getTurn(turn));
      const tools = nodes.turnDataSource(turn, 'tool-call');
      const replies = nodes.turnDataSource(turn, 'assistant-step');
      const toolData = React.useSyncExternalStore(tools.subscribe, tools.getSnapshot);
      const replyData = React.useSyncExternalStore(replies.subscribe, replies.getSnapshot);

      // The native sources are shared by all tool rows in a turn.
      let cached = stepGroups.get(tools);
      if (cached?.keys !== keys || cached?.toolData !== toolData || cached?.replyData !== replyData
        || cached?.questions !== questions) {
        cached = { keys, toolData, replyData, questions, groups: groupRoutineSteps(nodes, keys, operation.canAnswer) };
        stepGroups.set(tools, cached);
      }
      const group = cached.groups.get(node.key);
      if (!group || group.size === 1) return h(Operation, operation);
      if (group.first !== node.key) return h('span', { 'data-dsh-merged-step': '', hidden: true });

      const { block, t } = operation;
      const labels = [...group.actions].map(action => t(`action.${action}`));
      if (group.state) labels.push(t(`step.${group.state}`));
      return h('div', { 'data-chat-anchor-key': `call:${block.callId}`, 'data-chat-call-id': block.callId },
        h(StepText, { state: group.state }, labels.join(' · ')));
    }

    function WorkStep({ node, useChat, useProjection, showQuestion, t }) {
      const questions = useProjection('userQuestions', view => view?.active);
      const operation = {
        block: node.data.root,
        canAnswer: id => questions?.some(question => question.callId === id) ?? false,
        showQuestion,
        t,
      };
      const turn = node.location?.turn?.turn;
      if (turn === undefined || !useChat || node.groupTree || !isRoutine(operation.block, operation.canAnswer)) {
        return h(Operation, operation);
      }
      return h(RoutineWorkStep, { node, turn, useChat, questions, ...operation });
    }

    function RetryNotice({ node, t }) {
      return node.data.current.retryState === 'scheduled'
        ? h(StepText, { state: 'running' }, t('step.retry')) : null;
    }

    function SignInNotice({ node, t }) {
      return node.data.code === 'ACCOUNT_SIGNED_OUT'
        ? h(StepText, { state: 'issue' }, t('step.signIn')) : null;
    }

    const HideDetail = () => null;

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
        h('span', { className: 'dsh-nt-text' }, hint.text)), dom.target));
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
              stopped: '任务已停止，结果尚未确认。此前的操作可能已生效。',
              interrupted: '任务中断，结果尚未确认。此前的操作可能已生效。',
              failed: '任务遇到问题，结果尚未确认。此前的操作可能已生效。',
              limited: '本轮已达到回复上限，结果可能不完整。',
              blocked: '任务暂时无法继续，结果尚未确认。',
              unknown: '任务提前结束，结果尚未确认。',
              'action.read': '查看资料',
              'action.find': '查找相关内容',
              'action.research': '查阅网上资料',
              'action.update': '修改相关文件',
              'action.document': '处理文档',
              'action.delegate': '安排部分工作',
              'action.wait': '等待其他步骤完成',
              'action.question': '询问用户',
              'action.work': '处理任务',
              'step.preparing': '准备中',
              'step.running': '进行中',
              'step.stopped': '已停止',
              'step.issue': '遇到问题',
              'step.answer': '有问题需要你回答',
              'step.retry': '暂时遇到问题，正在重试',
              'step.signIn': '账号已退出，请重新登录后继续。',
              'nextTask.description': 'AI 建议的下一步任务',
            }));
            disposers.push(ctx.locale.register(NS, 'en', {
              stopped: 'The task was stopped before the result was confirmed. Earlier changes may already be in effect.',
              interrupted: 'The task was interrupted. Earlier changes may already be in effect.',
              failed: 'The task ran into a problem. Earlier changes may already be in effect.',
              limited: 'The reply reached its length limit. The result may be incomplete.',
              blocked: 'The task could not continue. The result is unconfirmed.',
              unknown: 'The task ended early. The result is unconfirmed.',
              'action.read': 'Review materials',
              'action.find': 'Look for relevant information',
              'action.research': 'Consult online sources',
              'action.update': 'Update files',
              'action.document': 'Work on the document',
              'action.delegate': 'Assign part of the work',
              'action.wait': 'Wait for related work',
              'action.question': 'Ask a question',
              'action.work': 'Work on the task',
              'step.preparing': 'Getting ready',
              'step.running': 'In progress',
              'step.stopped': 'Stopped',
              'step.issue': 'Ran into a problem',
              'step.answer': 'A question needs your answer',
              'step.retry': 'Retrying after a temporary problem',
              'step.signIn': 'Sign back in to continue.',
              'nextTask.description': 'AI-suggested next task',
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
          style.textContent = STYLE;
          document.head.append(style);
          return () => style.remove();
        }, 'concise-replies: presentation styles');

        ctx.slots.inject('conversation.chat.node', function* () {
          const name = 'conversation.chat.node';
          yield ctx.slots.register({
            name, key: 'tool-call', priority: -1, locale: NS,
            inject: sessionId => ({
              showQuestion: callId => ctx.get('userQuestionPanels')?.reveal(sessionId, callId) ?? false,
            }),
          }, WorkStep);
          yield ctx.slots.register({ name, key: 'model-retry', priority: -1, locale: NS }, RetryNotice);
          yield ctx.slots.register({ name, key: 'turn-error', priority: -1, locale: NS }, SignInNotice);
          for (const key of ['context', 'system-prompt', 'compaction', 'turn-max-tokens', 'unknown']) {
            yield ctx.slots.register({ name, key, priority: -1 }, HideDetail);
          }
        });

        ctx.slots.inject('conversation.chat.reasoning.body', () => ctx.slots.register({
          name: 'conversation.chat.reasoning.body', priority: -1,
        }, HideDetail));

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
