/**
 * Client half: the sidebar Session row's hover card shows which project the
 * Session belongs to.
 *
 * The shipped hover card (`ui-workspace`'s `SessionHoverContent`) renders the
 * title, the relative time, then the `sidebar.session.row.hover` list, then the
 * live status lines. That list is the card's own extension seat and receives the
 * row's `sessionId`, so a contribution lands inside the card with no replacement
 * of anything shipped.
 *
 * The project comes from Workspace membership (`path` + `sessionIds`) — the same
 * source the sidebar groups Sessions by — so the row and its card always agree.
 * A Session outside every Workspace contributes nothing.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-title-project-tip',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { IconFolderCloseRegular } = require('@deepseek-ai/dsh-client-ui-primitives');

    const NS = 'title-project-tip';

    /** The last path segment, used as the project's display name. */
    const projectName = (projectPath) => {
      const trimmed = projectPath.replace(/[/\\]+$/, '');
      const at = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      return at === -1 ? trimmed : trimmed.slice(at + 1);
    };

    /**
     * The project line inside one Session row's hover card.
     * @param props - the row's `sessionId`, the catalog hooks, and the locale seat.
     * @returns the project name and its path, or null outside every project.
     */
    function ProjectLine(props) {
      const { sessionId, useWorkspaces, t } = props;
      const workspaces = useWorkspaces((snapshot) => snapshot);
      const workspace = workspaces.items.find((item) => item.sessionIds.includes(sessionId));
      if (workspace === undefined) return null;

      return h('div', {
        className: 'dsh-hover-project',
        title: workspace.path,
      }, [
        h(IconFolderCloseRegular, { key: 'icon', size: 14 }),
        h('span', { key: 'name', className: 'dsh-hover-project-name' }, projectName(workspace.path)),
        h('span', { key: 'role', className: 'dsh-hover-project-role' }, t('tip.project')),
      ]);
    }

    /**
     * Styling for the line. The hover card paints on a dark translucent surface,
     * so the text uses the same light greys the card's own rows use; sizes follow
     * the card's 12px body.
     */
    const STYLESHEET = `
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

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const disposers = [];
          const dictionaries = [
            ['zh', { 'tip.project': '项目' }],
            ['en', { 'tip.project': 'Project' }],
          ];
          try {
            for (const [locale, dict] of dictionaries) disposers.push(ctx.locale.register(NS, locale, dict));
          } catch (error) {
            for (const dispose of disposers.reverse()) dispose();
            throw error;
          }
          return () => { for (const dispose of disposers) dispose(); };
        }, 'title-project-tip: dictionaries');

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = '@local/dsh-title-project-tip';
          style.textContent = STYLESHEET;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'title-project-tip: styles');

        ctx.slots.inject('sidebar.session.row.hover', () => ctx.slots.register({
          name: 'sidebar.session.row.hover',
          id: 'project',
          order: 5,
          locale: NS,
        }, ProjectLine));
      },
    };
  },
});
