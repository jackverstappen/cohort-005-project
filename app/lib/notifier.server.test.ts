import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  notify,
  outboxTransport,
  __resetDefaultTransportForTests,
  type NotificationCategory,
} from "./notifier.server";

const categories: NotificationCategory[] = [
  "re-engagement",
  "completion",
  "seat-invite",
  "refund-status",
  "team-progress",
];

describe("notify", () => {
  it.each(categories)(
    "writes a %s notification to the outbox",
    async (category) => {
      const directory = mkdtempSync(join(tmpdir(), "notifications-outbox-"));

      await notify(
        {
          subscriberId: "42",
          category,
          payload: { hello: "world" },
        },
        outboxTransport(directory)
      );

      const files = readdirSync(directory);
      expect(files).toHaveLength(1);
      expect(files[0]).toContain(category);
      const written = JSON.parse(
        readFileSync(join(directory, files[0]), "utf8")
      );
      expect(written).toMatchObject({
        subscriberId: "42",
        category,
        payload: { hello: "world" },
      });
    }
  );
});

describe("default transport memoization", () => {
  const originalKey = process.env.NOVU_API_KEY;
  const originalOutbox = process.env.NOTIFICATIONS_OUTBOX_DIR;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.NOVU_API_KEY;
    else process.env.NOVU_API_KEY = originalKey;
    if (originalOutbox === undefined)
      delete process.env.NOTIFICATIONS_OUTBOX_DIR;
    else process.env.NOTIFICATIONS_OUTBOX_DIR = originalOutbox;
    __resetDefaultTransportForTests();
  });

  it("reuses one transport instance across notify() calls", async () => {
    // No NOVU_API_KEY → default resolves to outboxTransport. We point its
    // outbox at a tmp dir through NOTIFICATIONS_OUTBOX_DIR; `process.chdir`
    // would also work locally but Stryker's worker-thread runner rejects it.
    delete process.env.NOVU_API_KEY;
    const directory = mkdtempSync(join(tmpdir(), "notifier-memo-"));
    process.env.NOTIFICATIONS_OUTBOX_DIR = directory;

    await notify({ subscriberId: "1", category: "re-engagement", payload: {} });
    await notify({ subscriberId: "2", category: "re-engagement", payload: {} });

    const files = readdirSync(directory);
    expect(files).toHaveLength(2);
  });
});
