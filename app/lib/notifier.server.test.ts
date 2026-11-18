import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  notify,
  outboxTransport,
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
