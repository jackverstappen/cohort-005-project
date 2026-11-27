import { describe, expect, it } from "vitest";
import { describeNoteEditor } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

const idle = { saving: false } as const;

describe("describeNoteEditor", () => {
  it("is empty and cannot save before the Student writes anything", () => {
    const view = describeNoteEditor({ ...idle, savedBody: null, draft: "" });
    expect(view.status).toEqual({ kind: "empty" });
    expect(view.canSave).toBe(false);
    expect(view.length).toBe(0);
    expect(view.max).toBe(MAX_NOTE_LENGTH);
  });

  it("cannot save a draft that is only whitespace", () => {
    const view = describeNoteEditor({
      ...idle,
      savedBody: null,
      draft: "   \n",
    });
    expect(view.canSave).toBe(false);
    expect(view.status).toEqual({ kind: "empty" });
  });

  it("flags a new draft as unsaved and lets the Student save it", () => {
    const view = describeNoteEditor({
      ...idle,
      savedBody: null,
      draft: "hello",
    });
    expect(view.status).toEqual({ kind: "unsaved" });
    expect(view.canSave).toBe(true);
    expect(view.length).toBe(5);
  });

  it("shows saved when the draft matches the stored Note", () => {
    const view = describeNoteEditor({
      ...idle,
      savedBody: "hello",
      draft: "hello",
    });
    expect(view.status).toEqual({ kind: "saved" });
    expect(view.canSave).toBe(false);
  });

  it("ignores surrounding whitespace the server would trim", () => {
    const view = describeNoteEditor({
      ...idle,
      savedBody: "hello",
      draft: "  hello\n",
    });
    expect(view.status).toEqual({ kind: "saved" });
    expect(view.length).toBe(5);
  });

  it("flags an edit to a stored Note as unsaved", () => {
    const view = describeNoteEditor({
      ...idle,
      savedBody: "hello",
      draft: "hello there",
    });
    expect(view.status).toEqual({ kind: "unsaved" });
    expect(view.canSave).toBe(true);
  });

  it("cannot save a stored Note cleared to nothing", () => {
    const view = describeNoteEditor({
      ...idle,
      savedBody: "hello",
      draft: "  ",
    });
    expect(view.status).toEqual({ kind: "unsaved" });
    expect(view.canSave).toBe(false);
  });

  it("refuses a draft over the limit, and allows one exactly at it", () => {
    const atLimit = "a".repeat(MAX_NOTE_LENGTH);
    expect(
      describeNoteEditor({ ...idle, savedBody: null, draft: atLimit })
    ).toMatchObject({
      tooLong: false,
      canSave: true,
    });
    expect(
      describeNoteEditor({ ...idle, savedBody: null, draft: `${atLimit}a` })
    ).toMatchObject({ tooLong: true, canSave: false });
  });

  it("shows saving, and blocks a second save, while a save is in flight", () => {
    const view = describeNoteEditor({
      savedBody: null,
      draft: "hello",
      saving: true,
      error: "stale",
    });
    expect(view.status).toEqual({ kind: "saving" });
    expect(view.canSave).toBe(false);
  });

  it("shows the error from a failed save over the unsaved status", () => {
    const view = describeNoteEditor({
      ...idle,
      savedBody: null,
      draft: "hello",
      error: "Something went wrong",
    });
    expect(view.status).toEqual({
      kind: "error",
      message: "Something went wrong",
    });
    expect(view.canSave).toBe(true);
  });
});
