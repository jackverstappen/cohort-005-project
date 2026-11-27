import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import {
  describeNoteEditor,
  type NoteEditorStatus,
} from "~/modules/lesson-note";

export function LessonNote({
  note,
}: {
  note: { body: string; updatedAt: string } | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [draft, setDraft] = useState(note?.body ?? "");
  const view = describeNoteEditor({
    savedBody: note?.body ?? null,
    draft,
    saving: fetcher.state !== "idle",
    error: fetcher.data?.error,
  });

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <LessonNoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            rows={5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Jot down what clicked, what to revisit, or a question to ask below..."
            aria-label="Your notes"
            className="resize-y"
          />

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={!view.canSave}>
              {view.status.kind === "saving" ? "Saving..." : "Save note"}
            </Button>
            <NoteStatus status={view.status} updatedAt={note?.updatedAt} />
            <span
              className={cn(
                "ml-auto text-xs",
                view.tooLong ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {view.length} / {view.max}
            </span>
          </div>

          <SavedPageHint />
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteStatus({
  status,
  updatedAt,
}: {
  status: NoteEditorStatus;
  updatedAt?: string;
}) {
  switch (status.kind) {
    case "error":
      return (
        <span role="alert" className="text-sm text-destructive">
          {status.message}
        </span>
      );
    case "unsaved":
      return (
        <span className="text-xs text-muted-foreground">Unsaved changes</span>
      );
    case "saved":
      return updatedAt ? (
        <span
          suppressHydrationWarning
          className="text-xs text-muted-foreground"
        >
          Saved {formatRelativeTime(updatedAt)}
        </span>
      ) : null;
    case "saving":
    case "empty":
      return null;
  }
}

function LessonNoteHeader() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <NotebookPen className="size-5 text-primary" />
      <h2 className="text-xl font-semibold">Your notes</h2>
      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <Lock className="size-3" />
        Only you can see these
      </span>
    </div>
  );
}

function SavedPageHint() {
  return (
    <p className="text-xs text-muted-foreground">
      Your notes for every lesson are collected on your{" "}
      <Link to="/saved" className="underline hover:text-foreground">
        Saved
      </Link>{" "}
      page.
    </p>
  );
}
