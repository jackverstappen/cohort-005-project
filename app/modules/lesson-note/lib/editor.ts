import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteEditorInput = {
  /** The body the server holds, or null when the Student has no Note yet. */
  savedBody: string | null;
  /** What is in the textarea right now. */
  draft: string;
  saving: boolean;
  /** The error from the last save attempt, if it failed. */
  error?: string;
};

export type NoteEditorStatus =
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "unsaved" }
  | { kind: "saved" }
  | { kind: "empty" };

export type NoteEditorView = {
  length: number;
  max: number;
  tooLong: boolean;
  canSave: boolean;
  status: NoteEditorStatus;
};

export function describe({
  savedBody,
  draft,
  saving,
  error,
}: NoteEditorInput): NoteEditorView {
  // The server trims before it stores, so surrounding whitespace is not a change.
  const trimmed = draft.trim();
  const length = trimmed.length;
  const tooLong = length > MAX_NOTE_LENGTH;
  const dirty = trimmed !== (savedBody ?? "");

  return {
    length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    canSave: !saving && dirty && length > 0 && !tooLong,
    status: statusOf({ saving, error, dirty, hasNote: savedBody !== null }),
  };
}

function statusOf({
  saving,
  error,
  dirty,
  hasNote,
}: {
  saving: boolean;
  error?: string;
  dirty: boolean;
  hasNote: boolean;
}): NoteEditorStatus {
  if (saving) return { kind: "saving" };
  if (error) return { kind: "error", message: error };
  if (dirty) return { kind: "unsaved" };
  if (hasNote) return { kind: "saved" };
  return { kind: "empty" };
}
