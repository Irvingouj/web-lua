import { FunctionalComponent } from 'preact';
import { useRef, useEffect, useCallback } from 'preact/hooks';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, rectangularSelection, highlightSpecialChars } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { StreamLanguage, syntaxHighlighting, indentOnInput, defaultHighlightStyle, foldGutter, bracketMatching } from '@codemirror/language';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from '../hooks/useTheme';

interface Props {
  id: string;
  value: string;
  placeholder: string;
  kind: 'code' | 'markdown';
  onChange: (value: string) => void;
  onRun?: () => void;
  onDoneEditing?: () => void;
  autoFocus?: boolean;
}

// ─── Lua completions ──────────────────────────────────────────────
const luaKeywords = [
  'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function',
  'goto', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
  'then', 'true', 'until', 'while',
];

const luaBuiltins = [
  'print', 'type', 'tostring', 'tonumber', 'pairs', 'ipairs', 'next',
  'require', 'pcall', 'xpcall', 'error', 'assert',
  'table.insert', 'table.remove', 'table.concat', 'table.sort', 'table.unpack',
  'string.format', 'string.find', 'string.match', 'string.gsub', 'string.sub', 'string.len', 'string.upper', 'string.lower',
  'math.abs', 'math.ceil', 'math.floor', 'math.max', 'math.min', 'math.sqrt', 'math.random', 'math.randomseed',
  'io.read', 'io.write',
];

const luaGlobals = [
  'json.encode', 'json.decode',
  'web.fetch', 'web.url.parse', 'web.url.encode', 'web.log', 'web.sleep',
  'web.storage.get', 'web.storage.set', 'web.storage.delete', 'web.storage.list',
  'crypto.sha256', 'crypto.md5', 'crypto.hmac_sha256', 'crypto.hex_encode', 'crypto.hex_decode',
  'host.call',
  'chrome.tabs.query', 'chrome.tabs.create', 'chrome.tabs.update', 'chrome.tabs.remove', 'chrome.tabs.sendMessage',
  'chrome.runtime.sendMessage',
  'chrome.alarms.create', 'chrome.alarms.clear',
  'chrome.action.setBadgeText', 'chrome.action.setBadgeBackgroundColor', 'chrome.action.setTitle',
  'chrome.contextMenus.create', 'chrome.contextMenus.remove',
  'chrome.windows.getAll', 'chrome.windows.create', 'chrome.windows.update', 'chrome.windows.remove',
  'chrome.sidePanel.setOptions',
  'chrome.cookies.get', 'chrome.cookies.set', 'chrome.cookies.remove', 'chrome.cookies.getAll',
  'chrome.bookmarks.search', 'chrome.bookmarks.create', 'chrome.bookmarks.remove',
  'chrome.history.search', 'chrome.history.deleteUrl',
  'chrome.notifications.create', 'chrome.notifications.clear',
  'chrome.scripting.executeScript',
  'dom.snapshot', 'dom.format',
  'page.snapshot', 'page.click', 'page.dblclick', 'page.fill', 'page.type',
  'page.press', 'page.select', 'page.check', 'page.hover', 'page.unhover',
  'page.scroll', 'page.scroll_to', 'page.url', 'page.title', 'page.screenshot',
  'page.goto', 'page.back', 'page.forward', 'page.reload', 'page.wait',
  'page.tabs', 'page.switch', 'page.new_tab', 'page.close', 'page.active_tab',
  'runtime.inspect', 'runtime.fetch',
  'tab.query', 'tab.open', 'tab.close', 'tab.current', 'tab.focus',
  'tab.click', 'tab.fill', 'tab.type', 'tab.evaluate', 'tab.fetch',
  'tab.snapshot', 'tab.screenshot', 'tab.url', 'tab.title',
  'tab.back', 'tab.forward', 'tab.reload', 'tab.wait',
  'tab.goto', 'tab.scroll', 'tab.scroll_to',
  'tab.press', 'tab.select', 'tab.check', 'tab.hover', 'tab.unhover',
];

function luaCompletions(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/[\w.]+/);
  if (!word || (word.from === word.to && !context.explicit)) return null;

  const options = [
    ...luaKeywords.map(k => ({ label: k, type: 'keyword', boost: 2 })),
    ...luaBuiltins.map(k => ({ label: k, type: 'function' })),
    ...luaGlobals.map(k => ({ label: k, type: 'function', detail: 'notebook API' })),
  ];

  return {
    from: word.from,
    options,
    filter: true,
  };
}

// ─── Theme-aware extension sets ────────────────────────────────────
const readOnlyCompartment = new Compartment();
const themeCompartment = new Compartment();

function getBaseExtensions(onChange: (v: string) => void, onRun?: () => void, onDone?: () => void) {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    EditorState.allowMultipleSelections.of(true),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    lineNumbers(),
    highlightActiveLineGutter(),
    foldGutter(),
    bracketMatching(),
    indentOnInput(),
    rectangularSelection(),
    highlightActiveLine(),
    keymap.of([
      ...defaultKeymap,
      ...historyKeymap,
      indentWithTab,
      {
        key: 'Ctrl-Enter',
        run: () => { onRun?.(); return true; },
      },
      {
        key: 'Cmd-Enter',
        run: () => { onRun?.(); return true; },
      },
      {
        key: 'Escape',
        run: () => { onDone?.(); return false; },
      },
    ]),
    autocompletion({
      override: [luaCompletions],
      activateOnTyping: true,
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChange(update.state.doc.toString());
      }
    }),
    // Auto-resize to content
    EditorView.theme({
      '&': {
        height: 'auto',
        minHeight: '80px',
      },
      '.cm-scroller': {
        overflow: 'auto',
        minHeight: '80px',
      },
      '.cm-content': {
        minHeight: '80px',
      },
      '.cm-gutters': {
        minHeight: '80px',
      },
    }),
  ];
}

function getLuaExtensions() {
  return [StreamLanguage.define(lua)];
}

function getLightTheme() {
  return EditorView.theme({
    '&': {
      backgroundColor: '#FFFFFF',
      color: '#111217',
      fontSize: '14px',
    },
    '.cm-content': {
      caretColor: '#000080',
      fontFamily: "'SF Mono','Fira Code','Cascadia Code','JetBrains Mono','Menlo', monospace",
      lineHeight: '1.6',
      padding: '8px 0',
    },
    '.cm-gutters': {
      backgroundColor: '#FAFAFC',
      color: '#747887',
      border: 'none',
      borderRight: '1px solid #E2E4EA',
    },
    '.cm-activeLineGutter': {
      backgroundColor: '#F3F4F7',
    },
    '.cm-activeLine': {
      backgroundColor: '#F4F5FF',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: '#000080',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: '#E8EAFF !important',
    },
    '.cm-tooltip': {
      border: '1px solid #E2E4EA',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li': {
        padding: '4px 8px',
      },
      '& > ul > li[aria-selected]': {
        backgroundColor: '#E8EAFF',
        color: '#111217',
      },
    },
  });
}

const CodeMirrorEditor: FunctionalComponent<Props> = ({
  id, value, placeholder, kind, onChange, onRun, onDoneEditing, autoFocus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { theme } = useTheme();

  // Create editor on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const isCode = kind === 'code';
    const runHandler = isCode ? onRun : onDoneEditing;

    const state = EditorState.create({
      doc: value,
      extensions: [
        ...getBaseExtensions(onChange, runHandler, onDoneEditing),
        ...(isCode ? getLuaExtensions() : []),
        themeCompartment.of(theme === 'dark' ? oneDark : getLightTheme()),
        EditorState.tabSize.of(2),
        placeholder ? EditorView.lineWrapping : [],
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    if (autoFocus) {
      view.focus();
    }

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []); // Only on mount

  // Update theme when it changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(theme === 'dark' ? oneDark : getLightTheme()),
    });
  }, [theme]);

  // Update doc when value prop changes from outside (e.g. test fixture injection)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      data-testid="cell-editor"
      id={`editor-${id}`}
      class="cm-editor-wrapper"
    />
  );
};

export default CodeMirrorEditor;
