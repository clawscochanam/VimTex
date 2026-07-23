import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";

class PlaceholderWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: PlaceholderWidget): boolean {
    return this.text === other.text;
  }

  toDOM(): HTMLElement {
    const el = document.createElement("span");
    el.className = "cm-placeholder";
    el.textContent = this.text;
    el.setAttribute("aria-hidden", "true");
    return el;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function editorPlaceholder(text: string) {
  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = build(view, text);
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = build(update.view, text);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );

  return [plugin, placeholderTheme];
}

function build(view: EditorView, text: string): DecorationSet {
  if (view.state.doc.length > 0) {
    return Decoration.none;
  }
  return Decoration.set([
    Decoration.widget({
      widget: new PlaceholderWidget(text),
      side: 1,
    }).range(0),
  ]);
}

const placeholderTheme = EditorView.baseTheme({
  ".cm-placeholder": {
    color: "var(--mute)",
    fontFamily: "var(--font-geist), ui-sans-serif, sans-serif",
    fontSize: "14px",
    lineHeight: "1.5",
    pointerEvents: "none",
    userSelect: "none",
  },
});
