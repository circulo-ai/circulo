"use client";

import {
  defaultMarkdownParser,
  defaultMarkdownSerializer,
  MarkdownParser,
} from "prosemirror-markdown";
import { type Node } from "prosemirror-model";
import { Decoration, DecorationSet, type EditorView } from "prosemirror-view";

import { documentSchema } from "./config";
import { createSuggestionWidget, type UISuggestion } from "./suggestions";

export const buildDocumentFromContent = (content: string) => {
  // Streaming React renderers need effects and cannot provide synchronous
  // editor content through renderToString. Parse Markdown directly instead.
  return new MarkdownParser(
    documentSchema,
    defaultMarkdownParser.tokenizer,
    defaultMarkdownParser.tokens,
  ).parse(content);
};

export const buildContentFromDocument = (document: Node) => {
  return defaultMarkdownSerializer.serialize(document);
};

export const createDecorations = (
  suggestions: UISuggestion[],
  view: EditorView,
) => {
  const decorations: Decoration[] = [];

  for (const suggestion of suggestions) {
    decorations.push(
      Decoration.inline(
        suggestion.selectionStart,
        suggestion.selectionEnd,
        {
          class: "suggestion-highlight",
        },
        {
          suggestionId: suggestion.id,
          type: "highlight",
        },
      ),
    );

    decorations.push(
      Decoration.widget(
        suggestion.selectionStart,
        (currentView) => {
          const { dom } = createSuggestionWidget(suggestion, currentView);
          return dom;
        },
        {
          suggestionId: suggestion.id,
          type: "widget",
        },
      ),
    );
  }

  return DecorationSet.create(view.state.doc, decorations);
};
