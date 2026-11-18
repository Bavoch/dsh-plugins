/**
 * Client half: queues ordinary busy-state Send clicks and keeps queued messages expanded.
 *
 * The shipped queue dock (`ui-conversation`'s QueueDock) starts collapsed —
 * `useState(true)` — so with two or more queued messages the reader sees only a
 * "N 条排队消息" header and must open it every time. The dock's rows render only
 * while it reports itself expanded, so a stylesheet alone cannot reveal a list
 * React has not rendered.
 *
 * Two layers, because each covers what the other cannot:
 *
 *  1. CSS hides the collapse affordance (the header's chevron) and un-hides a
 *     list React already rendered, so the very first paint is correct and there
 *     is no observable "collapsed" flash.
 *  2. One `click()` on the shipped toggle expands the dock, which is what makes
 *     React render the rows in the first place.
 *
 * The dock drives only its shipped expansion toggle. Ordinary busy-state
 * Send uses the public queue action; explicit steering and queue editing stay native. The plugin never re-expands a dock in
 * response to its own click, so there is no feedback loop.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-queue-expanded',
  factory(require) {
    const React = require('react');
    const DOCK = '[data-queue-dock]';
    const TOGGLE = `${DOCK} [aria-expanded]`;

    /**
     * Hide the toggle's chevron only: the header keeps its role as the dock's
     * label, and collapsing is no longer offered.
     */
    const STYLESHEET = `
${DOCK} button[aria-expanded] svg {
  display: none;
}

/* If a dock is somehow collapsed, still show its list. */
${DOCK} ul[hidden] {
  display: block;
}
`;

    function QueueSendGuard({ useSession, useInput, inputActions }) {
      const session = useSession(value => value);
      const input = useInput(value => value);
      const [source, setSource] = React.useState(null);
      const current = React.useRef(null);
      current.current = { session, input, inputActions };

      React.useLayoutEffect(() => {
        const card = source?.closest('[data-composer-card]');
        if (!card) return undefined;
        const send = event => {
          const button = event.target instanceof Element ? event.target.closest('button') : null;
          // The primary button has a busy flag but no popup; model pickers must stay untouched.
          // Native disabled/phase gates keep uploads, commands and duplicate clicks native-owned.
          if (!button || !card.contains(button) || !button.hasAttribute('aria-busy')
            || button.hasAttribute('aria-haspopup') || button.disabled || button.getAttribute('aria-busy') === 'true') return;
          const { session, input, inputActions } = current.current;
          if (!(session.running || session.awaitingFirstTurn || session.pendingSubmissions.length)
            || input.phase !== 'plain' || input.draft.trimStart().startsWith('/')
            || (!input.draft.trim() && !input.attachmentIds.length)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          // The public action always queues and retains native draft/attachment acceptance and retry.
          inputActions.submit();
        };
        card.addEventListener('click', send, true);
        return () => card.removeEventListener('click', send, true);
      }, [source]);
      return React.createElement('span', { ref: setSource, hidden: true, 'aria-hidden': 'true' });
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay', id: 'queue-send-guard',
        }, QueueSendGuard));
        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-queue-expanded';
          style.textContent = STYLESHEET;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'queue-expanded: stylesheet');

        ctx.effect(() => {
          let frame = 0;
          /** Set while this plugin is the one clicking, so its own click is ignored. */
          let expanding = false;

          /**
           * Expand the dock if it is collapsed.
           *
           * The shipped dock starts collapsed and renders no rows in that state,
           * so a single click on its toggle is what makes the rows exist; once
           * expanded, the toggle's `aria-expanded` stays `true` and nothing more
           * is clicked.
           */
          const reconcile = () => {
            for (const toggle of document.querySelectorAll(TOGGLE)) {
              if (toggle.getAttribute('aria-expanded') !== 'false') continue;
              if (toggle.disabled === true) continue; // an in-flight edit owns it
              expanding = true;
              try {
                toggle.click();
              } finally {
                expanding = false;
              }
            }
          };

          const schedule = () => {
            if (frame !== 0) return;
            frame = requestAnimationFrame(() => {
              frame = 0;
              reconcile();
            });
          };

          // The dock mounts with the queue and re-renders as rows arrive, so a
          // new collapsed instance must be expanded too.
          const observer = new MutationObserver(() => {
            if (expanding) return;
            schedule();
          });
          observer.observe(document.body, { childList: true, subtree: true });

          schedule();

          return () => {
            if (frame !== 0) cancelAnimationFrame(frame);
            observer.disconnect();
          };
        }, 'queue-expanded: expand the dock');
      },
    };
  },
});
