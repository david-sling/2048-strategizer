/**
 * useEditor.js — CodeMirror 6 editor hook.
 *
 * Initialises the editor once on mount and exposes a stable
 * `setCode` function for loading presets / saved strategies.
 */

import { useEffect, useRef, useCallback } from "react";
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

/**
 * @param {string}   initialCode  - Code shown when the editor first mounts.
 * @param {Function} onChange     - Called with the new code string on every edit.
 * @returns {{ containerRef, setCode }}
 *   containerRef — attach to the DOM element that should host the editor.
 *   setCode      — programmatically replace the editor contents.
 */
export function useEditor(initialCode, onChange) {
  const containerRef = useRef(null);
  const viewRef      = useRef(null);

  // Keep a ref to the latest onChange so the listener never goes stale
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!containerRef.current || viewRef.current) return;

    const state = EditorState.create({
      doc: initialCode,
      extensions: [
        basicSetup,
        javascript(),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.theme({
          "&":            { height: "100%", fontSize: "13px" },
          ".cm-editor":   { height: "100%" },
          ".cm-scroller": { overflow: "auto", fontFamily: "'JetBrains Mono','Fira Code',monospace" },
        }),
      ],
    });

    viewRef.current = new EditorView({ state, parent: containerRef.current });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Replace the editor content programmatically (e.g. loading a preset). */
  const setCode = useCallback((code) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: code },
    });
  }, []);

  return { containerRef, setCode };
}
