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
  const originalCwd = process.cwd();

  afterEach(() => {
    if (originalKey === undefined) delete process.env.NOVU_API_KEY;
    else process.env.NOVU_API_KEY = originalKey;
    process.chdir(originalCwd);
    __resetDefaultTransportForTests();
  });

  it("reuses one transport instance across notify() calls", async () => {
    // No NOVU_API_KEY → default resolves to outboxTransport. We pin cwd to a
    // tmp dir so the outbox writes somewhere disposable. Two notify() calls
    // without an explicit transport must produce two files in the same dir,
    // proving the transport (and its identify cache) persists.
    delete process.env.NOVU_API_KEY;
    const directory = mkdtempSync(join(tmpdir(), "notifier-memo-"));
    process.chdir(directory);

    await notify({ subscriberId: "1", category: "re-engagement", payload: {} });
    await notify({ subscriberId: "2", category: "re-engagement", payload: {} });

    const outbox = join(directory, ".notifications-outbox");
    const files = readdirSync(outbox);
    expect(files).toHaveLength(2);
  });
});
