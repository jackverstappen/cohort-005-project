import { describe } from "./lib/editor";
import type { NoteEditorInput, NoteEditorView } from "./lib/editor";

export type {
  NoteEditorInput,
  NoteEditorStatus,
  NoteEditorView,
} from "./lib/editor";

/**
 * What the Lesson page's Note editor shows for a draft: the character count,
 * whether Save is allowed, and a one-word status beside the button.
 */
export function describeNoteEditor(input: NoteEditorInput): NoteEditorView {
  return describe(input);
}
