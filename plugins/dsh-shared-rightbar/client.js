window.__ModuleLoader__.load({
  id: '@local/dsh-shared-rightbar',
  factory(require) {
    const React = require('react');
    const RIGHTBAR = 'rightbar';
    const CORNER = 'conversation.session.header.corner';
    const HOLD = '@local/dsh-shared-rightbar';
    const noop = () => {};

    function shareWorkspaceViews(ctx, views) {
      const set = views.set;
      const lifetime = new AbortController();
      const workspaces = new Map();
      let native = views.getSnapshot();
      let owner;

      const project = next => {
        native = next;
        const selected = next.find(view => view.selected);
        if (selected) {
          const cwd = ctx.sessions.list.getSnapshot().byId[selected.sessionId]?.cwd;
          const saved = workspaces.get(cwd);
          if (saved && next.some(view => view.reference === saved.reference)) {
            owner = saved;
          } else {
            owner = selected;
            if (cwd !== undefined) {
              // Keep the actual mounted view alive so terminals, browser navigation
              // and file views keep their original tab identities and Session context.
              workspaces.set(cwd, selected);
              selected.retainTab(HOLD, lifetime.signal);
            }
          }
        }

        const shared = next.find(view => view.reference === owner?.reference);
        if (!shared || shared === selected) {
          set(next);
          return;
        }
        set(next.map(view => {
          const foreground = view === shared;
          return foreground === view.selected ? view : { ...view, selected: foreground };
        }));
      };

      views.set = project;
      project(native);
      return () => {
        views.set = set;
        set(native);
        lifetime.abort();
      };
    }

    function registerExpander(ctx, views, native) {
      const sidebar = ctx.sidebarRight;
      const actions = {
        setExpanded(sessionId, expanded) {
          if (sidebar.mounted.getSnapshot() === sessionId && sidebar.isExpanded() !== expanded) {
            sidebar.toggleExpanded();
          }
        },
      };

      function SharedExpand(props) {
        const sessionId = React.useSyncExternalStore(views.subscribe, () =>
          views.getSnapshot().find(view => view.selected)?.sessionId);

        // The native header belongs to the chat Session. Point its expand control
        // at the same adopted store that the shared rightbar seat is rendering.
        const getStore = () => sidebar.adopted.get(sessionId)?.store;
        const subscribe = React.useCallback(listener =>
          sidebar.adopted.get(sessionId)?.store.subscribe(listener) ?? noop, [sessionId]);
        const useStore = select => React.useSyncExternalStore(subscribe, () =>
          select(getStore()?.getSnapshot() ?? { bySession: {} }));

        if (sessionId === undefined) return null;
        return React.createElement(native.component, { ...props, sessionId, useStore, actions });
      }

      return ctx.slots.register({
        name: CORNER,
        priority: (native.options.priority ?? 0) - 1,
        locale: native.locale,
        inject: native.inject,
      }, SharedExpand);
    }

    return {
      inject: ['slots', 'sessions', 'sidebarRight'],
      apply(ctx) {
        ctx.effect(() => {
          let restore;
          const setup = () => {
            if (restore) return;
            const rightbar = ctx.slots.entriesOfSlot(RIGHTBAR)[0];
            const expander = ctx.slots.entriesOfSlot(CORNER)[0];
            const views = rightbar?.inject?.().hooks?.views;
            if (!views || !expander) return;
            if (typeof views.set !== 'function' || !ctx.sidebarRight.adopted?.get) {
              throw new Error('Shared Right Sidebar requires the DeepSeek Harness 0.2.2-rc.5 rightbar.');
            }

            const unshare = shareWorkspaceViews(ctx, views);
            try {
              const unregister = registerExpander(ctx, views, expander);
              restore = () => {
                unregister();
                unshare();
              };
            } catch (error) {
              unshare();
              throw error;
            }
          };
          const unwatchRightbar = ctx.slots.subscribe(RIGHTBAR, setup);
          const unwatchCorner = ctx.slots.subscribe(CORNER, setup);
          setup();
          return () => {
            unwatchCorner();
            unwatchRightbar();
            restore?.();
          };
        }, 'shared-rightbar: workspace views');
      },
    };
  },
});
