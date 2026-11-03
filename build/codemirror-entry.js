// Bundled by esbuild into src/renderer/vendor/codemirror.js (exposed as window.CM).
// Only the basics: keep the editor small and simple.
export { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
export { EditorState, Compartment } from '@codemirror/state';
export { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
export { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
export { syntaxHighlighting, HighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
export { tags } from '@lezer/highlight';
export { javascript } from '@codemirror/lang-javascript';
export { markdown } from '@codemirror/lang-markdown';
export { python } from '@codemirror/lang-python';
export { json } from '@codemirror/lang-json';
export { css } from '@codemirror/lang-css';
export { html } from '@codemirror/lang-html';
