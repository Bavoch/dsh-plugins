/* Tabler Icons Pointer
 * MIT License
 *
 * Copyright (c) 2020-2026 Paweł Kuna
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-preview-element-context',
  factory(require) {
    const React = require('react');
    const { createElement: h, useCallback, useLayoutEffect, useEffect, useRef, useState } = React;
    const { createPortal } = require('react-dom');
    const POINTER_PATH = 'M7.904 17.563a1.2 1.2 0 0 0 2.228 .308l2.09 -3.093l4.907 4.907a1.067 1.067 0 0 0 1.509 0l1.047 -1.047a1.067 1.067 0 0 0 0 -1.509l-4.907 -4.907l3.113 -2.09a1.2 1.2 0 0 0 -.309 -2.228l-13.582 -3.904l3.904 13.563';
    const NS = 'previewElementContext';
    const INPUT_SLOT = 'conversation.input.overlay';
    const MAIN_CONVERSATION = '[data-slot="main.conversation"]';
    const BROWSER = 'webview[data-sidebar-browser-frame="webview"]';
    const TAB_BODY = '[data-slot="sidebar.right.pane.tab"]';
    const styles = [
      '.dsh-preview-pick-anchor { display: contents; }',
      '.dsh-preview-pick { display: inline-flex; flex: none; align-items: center; justify-content: center;',
      '  width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--dsw-radius-sm);',
      '  background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }',
      '.dsh-preview-pick:hover { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover); }',
      '.dsh-preview-pick[aria-pressed="true"] { color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-interactive-bg-hover); }',
      '.dsh-preview-pick-layer { position: absolute; inset: 0; z-index: 2; overflow: hidden; cursor: crosshair; touch-action: none; }',
      '.dsh-preview-pick-highlight { position: absolute; pointer-events: none; box-sizing: border-box; border: 2px solid #4169e1; background: #4169e129; }',
      '[data-composer-quote] [data-quote-preview]:has(> [data-dsh-preview-quote-label]) {',
      '  align-items: center; flex-direction: row-reverse; gap: 2px; max-width: min(100%, 16rem); padding: 0 3px 0 7px;',
      '  border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary);',
      '  font-size: var(--dsh-content-font-size-secondary, 13px); line-height: calc(20px + var(--dsh-content-font-delta, 0px)); }',
      '[data-dsh-preview-quote-label] > :first-child, [data-dsh-preview-quote-label] > :last-child { display: none; }',
      '[data-dsh-preview-quote-label]::before { content: attr(data-dsh-preview-quote-label) / ""; }',
      '[data-quote-preview]:has(> [data-dsh-preview-quote-label]) > button > svg:first-child { display: none; }',
      '[data-quote-preview]:has(> [data-dsh-preview-quote-label]) > button > svg:last-child { opacity: 1; }',
      '.dsh-preview-pick-status { position: absolute; inset: auto 8px 8px; z-index: 3; pointer-events: none; margin: 0 auto;',
      '  width: fit-content; max-width: calc(100% - 16px); box-sizing: border-box; padding: 6px 9px;',
      '  border: 1px solid var(--dsw-alias-border-l2); border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-bg-base);',
      '  color: var(--dsw-alias-label-primary); font: var(--dsw-font-xxs-12); }',
    ].join('\n');
    const copy = {
      zh: {
        pick: '选取元素', hint: '点击网页元素添加引用，按 Esc 退出',
        loading: '请等待网页加载完成', failed: '无法读取此处的网页元素',
        unavailable: '当前对话暂时无法添加引用', quote: '网页元素',
        page: '页面', frame: '嵌入页面', element: '元素', selector: '定位', text: '文本',
      },
      en: {
        pick: 'Pick element', hint: 'Click an element to quote it. Press Esc to exit.',
        loading: 'Wait for the web page to finish loading.', failed: 'Could not read an element at that position.',
        unavailable: 'The current conversation cannot accept a quote right now.', quote: 'Page element',
        page: 'Page', frame: 'Frame', element: 'Element', selector: 'Selector', text: 'Text',
      },
    };

    // Runs inside the existing Browser guest. It reads the DOM without altering the page.
    function inspectAt(relativeX, relativeY, includeDetails) {
      const { innerWidth: width, innerHeight: height } = window;
      let x = relativeX * width;
      let y = relativeY * height;
      let element = document.elementFromPoint(x, y);
      if (!element || !width || !height) return null;

      let originX = 0;
      let originY = 0;
      let scaleX = 1;
      let scaleY = 1;
      const clip = { left: 0, top: 0, right: width, bottom: height };
      const frames = [];
      for (let depth = 0; depth <= 12; depth++) {
        while (element.shadowRoot) {
          const inner = element.shadowRoot.elementFromPoint(x, y);
          if (!inner || inner.getRootNode() !== element.shadowRoot) break;
          element = inner;
        }

        // Browser origin checks leave cross-origin and opaque frames as single elements.
        if (element.localName !== 'iframe' || depth === 12) break;
        const childDocument = element.contentDocument;
        const childWindow = childDocument?.defaultView;
        if (!childWindow || !element.offsetWidth || !element.offsetHeight) break;

        // A presentation preview may scale its iframe to fit the available panel.
        const rect = element.getBoundingClientRect();
        const ratioX = rect.width / element.offsetWidth;
        const ratioY = rect.height / element.offsetHeight;
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        const left = rect.left + (element.clientLeft + (parseFloat(style.paddingLeft) || 0)) * ratioX;
        const top = rect.top + (element.clientTop + (parseFloat(style.paddingTop) || 0)) * ratioY;
        const childX = (x - left) / ratioX;
        const childY = (y - top) / ratioY;
        if (childX < 0 || childX >= childWindow.innerWidth || childY < 0 || childY >= childWindow.innerHeight) break;
        const child = childDocument.elementFromPoint(childX, childY);
        if (!child) break;

        if (includeDetails) frames.push(selectorFor(element).slice(0, 360));
        originX += left * scaleX;
        originY += top * scaleY;
        scaleX *= ratioX;
        scaleY *= ratioY;
        clip.left = Math.max(clip.left, originX);
        clip.top = Math.max(clip.top, originY);
        clip.right = Math.min(clip.right, originX + childWindow.innerWidth * scaleX);
        clip.bottom = Math.min(clip.bottom, originY + childWindow.innerHeight * scaleY);
        x = childX;
        y = childY;
        element = child;
      }

      // Pointing at a card's image or title should capture the clickable card.
      element = element.closest('button, a[href], [role="button"], [role="link"]') ?? element;
      const bounds = element.getBoundingClientRect();
      const result = {
        left: Math.max(clip.left, originX + bounds.left * scaleX) / width,
        top: Math.max(clip.top, originY + bounds.top * scaleY) / height,
        right: Math.min(clip.right, originX + bounds.right * scaleX) / width,
        bottom: Math.min(clip.bottom, originY + bounds.bottom * scaleY) / height,
      };
      if (!includeDetails) return result;

      function selectorFor(node) {
        const segments = [];
        for (let current = node; current && segments.length < 24;) {
          const tag = CSS.escape(current.localName);
          const root = current.getRootNode();
          const id = current.id.length <= 80 && current.id ? '#' + CSS.escape(current.id) : '';
          if (id && root.querySelectorAll(id).length === 1) {
            segments.unshift(tag + id);
          } else {
            let index = 1;
            for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
              if (sibling.localName === current.localName) index++;
            }
            segments.unshift(tag + ':nth-of-type(' + index + ')');
            if (current.parentElement) {
              current = current.parentElement;
              continue;
            }
          }
          current = root.host;
          if (current) segments.unshift('::shadow');
        }
        return segments.join(' > ');
      }

      const normalize = (value, limit) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
      const fields = 'input, textarea, select, [contenteditable]';
      const visibleText = !element.closest(fields) && !element.querySelector(fields) ? element.innerText : '';
      return {
        ...result,
        tag: element.localName,
        selector: selectorFor(element).slice(0, 480),
        title: normalize(document.title, 150),
        frameAddress: frames.length ? element.ownerDocument.URL : '',
        frameSelector: frames.join(' → ').slice(0, 480),
        text: normalize(visibleText, 600)
          || normalize(element.getAttribute('aria-label') || element.getAttribute('alt'), 600),
      };
    }

    function getPageUrl(frame) {
      try {
        const url = new URL(frame.getURL());
        return ['http:', 'https:'].includes(url.protocol) ? url : null;
      } catch {
        return null;
      }
    }

    function pageAddress(value) {
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) ? (url.origin + url.pathname).slice(0, 800) : '';
      } catch {
        return '';
      }
    }

    function quotingLabel(value, limit) {
      return typeof value === 'string' ? value.slice(0, limit).replace(/\s+/g, ' ').trim() : '';
    }

    function PickerLayer({ frame, page, finish, insert, t }) {
      const [box, setBox] = useState(null);
      const lifetime = useRef({ stopped: false, picking: false, busy: false, pointer: null, animation: 0 });

      useLayoutEffect(() => {
        const state = lifetime.current;
        state.stopped = false;
        const cancel = () => finish();
        const escape = event => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopImmediatePropagation();
          cancel();
        };
        const navigate = event => { if (event.isMainFrame) cancel(); };
        const resize = new ResizeObserver(() => {
          if (!frame.checkVisibility({ visibilityProperty: true }) || !frame.clientWidth || !frame.clientHeight) {
            cancel();
          } else {
            state.pointer = null;
            setBox(null);
          }
        });
        const controller = new AbortController();
        const options = { signal: controller.signal };
        window.addEventListener('keydown', escape, { ...options, capture: true });
        frame.addEventListener('did-start-navigation', navigate, options);
        frame.addEventListener('did-navigate-in-page', navigate, options);
        frame.addEventListener('render-process-gone', cancel, options);
        resize.observe(frame);
        return () => {
          state.stopped = true;
          controller.abort();
          resize.disconnect();
          cancelAnimationFrame(state.animation);
        };
      }, [frame, finish]);

      function point(event) {
        const { left, top, width, height } = frame.getBoundingClientRect();
        if (!width || !height) return null;
        return [(event.clientX - left) / width, (event.clientY - top) / height];
      }

      function inspect([x, y], details) {
        // Event coordinates are the only inputs interpolated into the fixed guest script.
        if (![x, y].every(value => Number.isFinite(value) && value >= 0 && value < 1)) return null;
        return frame.executeJavaScript('(' + inspectAt.toString() + ')(' + x + ',' + y + ',' + details + ')');
      }

      function scheduleHover() {
        const state = lifetime.current;
        if (state.stopped || state.picking || state.busy || state.animation || !state.pointer) return;
        state.animation = requestAnimationFrame(async () => {
          state.animation = 0;
          if (!state.pointer || state.picking) return;
          const current = state.pointer;
          state.busy = true;
          try {
            const result = await inspect(current, false);
            if (!state.stopped && !state.picking && state.pointer) setBox(result);
          } catch {
            if (!state.stopped) setBox(null);
          } finally {
            state.busy = false;
            if (state.pointer !== current) scheduleHover();
          }
        });
      }

      async function pick(event) {
        event.preventDefault();
        event.stopPropagation();
        const state = lifetime.current;
        const target = point(event);
        if (state.stopped || state.picking || !target) return;
        state.picking = true;
        try {
          const hit = await inspect(target, true);
          if (state.stopped) return;
          if (!frame.checkVisibility({ visibilityProperty: true }) || getPageUrl(frame)?.href !== page.href) {
            finish();
            return;
          }
          const tag = quotingLabel(hit?.tag, 80);
          const selector = quotingLabel(hit?.selector, 480);
          if (!tag || !selector) {
            finish('failed');
            return;
          }
          const title = quotingLabel(hit.title, 150);
          const text = quotingLabel(hit.text, 600);
          const address = pageAddress(page.href);
          const frameAddress = pageAddress(hit.frameAddress);
          const frameSelector = quotingLabel(hit.frameSelector, 480);
          const frameDescription = [frameAddress, frameSelector].filter(Boolean).join(' · ');
          const content = [
            t('page') + ': ' + (title ? title + ' · ' : '') + address,
            frameDescription && t('frame') + ': ' + frameDescription,
            t('element') + ': <' + tag + '>',
            t('selector') + ': ' + selector,
            text && t('text') + ': ' + text,
          ].filter(Boolean).join('\n');
          const added = insert(content, { label: t('quote'), title: text.slice(0, 60) || tag, detail: selector, body: content });
          finish(added ? '' : 'unavailable');
        } catch {
          if (!state.stopped) finish('failed');
        }
      }

      const hasBox = box && [box.left, box.top, box.right, box.bottom].every(value =>
        Number.isFinite(value) && value >= 0 && value <= 1)
        && box.right > box.left && box.bottom > box.top;
      return h('div', {
        className: 'dsh-preview-pick-layer',
        onPointerMove: event => { lifetime.current.pointer = point(event); scheduleHover(); },
        onPointerLeave: () => { lifetime.current.pointer = null; setBox(null); },
        onPointerDown: event => { event.preventDefault(); event.stopPropagation(); },
        onClick: pick,
        onContextMenu: event => { event.preventDefault(); event.stopPropagation(); },
      }, hasBox && h('div', {
        className: 'dsh-preview-pick-highlight',
        style: { left: box.left * 100 + '%', top: box.top * 100 + '%',
          right: (1 - box.right) * 100 + '%', bottom: (1 - box.bottom) * 100 + '%' },
      }));
    }

    function BrowserPicker({ frame, active, setActive, insert, canInsert, t }) {
      const [notice, setNotice] = useState('');
      const [buttonHost, setButtonHost] = useState(null);
      const toolbar = frame.closest(TAB_BODY)?.querySelector('form');
      const host = frame.parentElement?.parentElement;
      const page = active?.frame === frame ? active.page : null;
      const finish = useCallback((message = '') => {
        setActive(current => current?.frame === frame ? null : current);
        setNotice(message);
      }, [frame, setActive]);
      useLayoutEffect(() => {
        // rc.5 places the external-browser control immediately after the address box.
        const addressBox = toolbar?.querySelector('input')?.parentElement;
        const externalButton = addressBox?.nextElementSibling;
        if (addressBox?.parentElement !== toolbar || externalButton?.localName !== 'button') return;
        const anchor = document.createElement('span');
        anchor.className = 'dsh-preview-pick-anchor';
        externalButton.before(anchor);
        setButtonHost(anchor);
        return () => anchor.remove();
      }, [toolbar]);
      useEffect(() => {
        if (!notice) return;
        const timeout = setTimeout(() => setNotice(''), 4000);
        return () => clearTimeout(timeout);
      }, [notice]);

      if (!toolbar || !host) return null;
      function toggle(event) {
        event.stopPropagation();
        if (page) { finish(); return; }
        if (!canInsert()) { setNotice('unavailable'); return; }
        const url = getPageUrl(frame);
        if (!url || frame.isLoading()) { setNotice('loading'); return; }
        setNotice('');
        setActive({ frame, page: url });
      }
      return h(React.Fragment, null,
        buttonHost && createPortal(h('button', {
          type: 'button', className: 'dsh-preview-pick', title: t('pick'), 'aria-label': t('pick'),
          'aria-pressed': !!page, onPointerDown: event => event.stopPropagation(), onClick: toggle,
        }, h('svg', {
          width: 16, height: 16, viewBox: '0 0 24 24',
          fill: 'none', stroke: 'currentColor', strokeWidth: 2,
          strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
        }, h('path', { d: POINTER_PATH }))), buttonHost),
        createPortal(h(React.Fragment, null,
          page && h(PickerLayer, { frame, page, finish, insert, t }),
          (page || notice) && h('div', { className: 'dsh-preview-pick-status', role: 'status' },
            t(page ? 'hint' : notice))), host));
    }

    function decorateComposerQuotes(editor) {
      const attribute = 'data-dsh-preview-quote-label';
      const sources = '[data-composer-quote] [data-quote-preview-text]';
      const labels = new Map(Object.values(copy).map(locale => [locale.quote, locale]));
      const sync = () => {
        for (const source of editor.querySelectorAll(sources)) {
          // rc.5 renders summary label, screen-reader title/detail, and full body as siblings.
          const [kind, accessibleTitle, body] = source.children;
          const locale = labels.get(kind?.textContent);
          const lines = body?.textContent.split('\n') ?? [];
          const locatorPrefix = locale?.selector + ': ';
          const locator = lines.find(line => line.startsWith(locatorPrefix))?.slice(locatorPrefix.length);
          if (!locale || !locator || !lines[0]?.startsWith(locale.page + ': ') || !accessibleTitle?.textContent) {
            source.removeAttribute(attribute);
            continue;
          }
          const title = accessibleTitle.textContent;
          const suffix = ' ' + locator;
          source.setAttribute(attribute, title.endsWith(suffix) ? title.slice(0, -suffix.length) : title);
        }
      };
      const observer = new MutationObserver(sync);
      observer.observe(editor, { childList: true, subtree: true, characterData: true });
      sync();
      return () => {
        observer.disconnect();
        for (const source of editor.querySelectorAll('[' + attribute + ']')) source.removeAttribute(attribute);
      };
    }

    function ComposerBridge({ sessionId, inputActions, t }) {
      const marker = useRef(null);
      const [frames, setFrames] = useState([]);
      const [active, setActive] = useState(null);

      useLayoutEffect(() => {
        if (!marker.current?.closest(MAIN_CONVERSATION)) return;
        const editor = marker.current.closest('[data-composer-card]')?.querySelector('[data-composer-input]');
        const clearQuoteLabels = editor && decorateComposerQuotes(editor);
        const sync = () => {
          const next = [...document.querySelectorAll(BROWSER)];
          setFrames(previous => next.length === previous.length && next.every((frame, index) => frame === previous[index])
            ? previous : next);
          setActive(current => current && !next.includes(current.frame) ? null : current);
        };
        const containsFrame = node => node.nodeType === Node.ELEMENT_NODE &&
          (node.matches(BROWSER) || node.querySelector(BROWSER));
        const observer = new MutationObserver(records => {
          if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(containsFrame))) sync();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        sync();
        return () => {
          observer.disconnect();
          clearQuoteLabels?.();
        };
      }, []);

      function canInsert() {
        const node = marker.current;
        return !!node?.isConnected && !!node.closest(MAIN_CONVERSATION)
          && node.closest('[data-conversation-session]')?.dataset.conversationSession === sessionId
          && !!node.closest('[data-composer-card]')?.querySelector('[data-composer-input][contenteditable="true"]');
      }

      return h(React.Fragment, null, h('span', { ref: marker, hidden: true }),
        frames.map(frame => h(BrowserPicker, {
          key: frame.getAttribute('name'), frame, active, setActive, canInsert, t,
          insert: (text, summary) => canInsert() && inputActions.insertQuote(text, summary),
        })));
    }

    function PreviewContext(props) {
      return h(ComposerBridge, { ...props, key: props.sessionId });
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        if (!window.dshDesktop?.browser) return;
        ctx.effect(() => ctx.locale.register(NS, copy), 'preview element context: translations');
        ctx.effect(() => {
          const style = document.createElement('style');
          style.textContent = styles;
          document.head.append(style);
          return () => style.remove();
        }, 'preview element context: styles');
        ctx.slots.inject(INPUT_SLOT, () => ctx.slots.register({
          name: INPUT_SLOT, id: 'preview-element-context', locale: NS,
        }, PreviewContext));
      },
    };
  },
});
