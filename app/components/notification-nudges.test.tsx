// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  NudgeCardsView,
  NotificationBellView,
  adaptNotification,
  partitionForNudges,
  partitionForTray,
  type UINotification,
} from "./notification-nudges";

const fixtures: UINotification[] = [
  {
    id: "n1",
    category: "re-engagement",
    title: "Resume React Patterns",
    body: "5 days since your last lesson.",
    ts: "2h ago",
    read: false,
  },
  {
    id: "n2",
    category: "completion",
    title: "12 minutes from completing",
    body: "One lesson left.",
    ts: "yesterday",
    read: false,
  },
  {
    id: "n3",
    category: "seat-invite",
    title: "Acme invited you",
    body: "Claim your seat.",
    ts: "3d ago",
    read: true,
  },
  {
    id: "n4",
    category: "refund-status",
    title: "Refund approved",
    body: "Funds on the way.",
    ts: "last week",
    read: true,
  },
  {
    id: "n5",
    category: "team-progress",
    title: "Jane completed Testing",
    body: "Team progress.",
    ts: "today",
    read: false,
  },
];

describe("partition helpers", () => {
  it("partitionForNudges keeps only re-engagement + completion", () => {
    const got = partitionForNudges(fixtures).map((n) => n.id);
    expect(got).toEqual(["n1", "n2"]);
  });

  it("partitionForTray keeps the other three categories", () => {
    const got = partitionForTray(fixtures).map((n) => n.id);
    expect(got).toEqual(["n3", "n4", "n5"]);
  });
});

describe("adaptNotification", () => {
  it("maps a Novu-shaped notification with a known workflow identifier", () => {
    const got = adaptNotification({
      id: "abc",
      subject: "Hello",
      body: "Body",
      isRead: false,
      createdAt: new Date().toISOString(),
      workflow: { identifier: "re-engagement" },
    });
    expect(got).not.toBeNull();
    expect(got?.category).toBe("re-engagement");
    expect(got?.title).toBe("Hello");
  });

  it("drops notifications whose workflow identifier is not one of the five categories", () => {
    const got = adaptNotification({
      id: "abc",
      body: "Body",
      isRead: false,
      createdAt: new Date().toISOString(),
      workflow: { identifier: "some-other-workflow" },
    });
    expect(got).toBeNull();
  });
});

describe("NudgeCardsView", () => {
  it("renders only re-engagement + completion from a mixed feed", () => {
    render(<NudgeCardsView notifications={fixtures} onDismiss={() => {}} />);
    expect(screen.getByText("Resume React Patterns")).toBeTruthy();
    expect(screen.getByText("12 minutes from completing")).toBeTruthy();
    expect(screen.queryByText("Acme invited you")).toBeNull();
    expect(screen.queryByText("Refund approved")).toBeNull();
    expect(screen.queryByText("Jane completed Testing")).toBeNull();
  });

  it("calls onDismiss with the item id when the X is clicked (and removes the card)", () => {
    const onDismiss = vi.fn();
    render(<NudgeCardsView notifications={fixtures} onDismiss={onDismiss} />);

    const dismissButtons = screen.getAllByLabelText("Dismiss");
    fireEvent.click(dismissButtons[0]!);

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith("n1");
    expect(screen.queryByText("Resume React Patterns")).toBeNull();
  });

  it("renders nothing when there are no nudge-eligible items", () => {
    const { container } = render(
      <NudgeCardsView
        notifications={fixtures.filter(
          (n) => n.category !== "re-engagement" && n.category !== "completion"
        )}
        onDismiss={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("NotificationBellView", () => {
  it("shows the unread count badge for only the tray categories", () => {
    render(<NotificationBellView notifications={fixtures} />);
    // Only team-progress (n5) is unread amongst tray items.
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("opens the tray and renders only non-nudge items + the manage preferences link", () => {
    render(<NotificationBellView notifications={fixtures} />);
    fireEvent.click(screen.getByLabelText("Notifications"));

    expect(screen.getByText("Acme invited you")).toBeTruthy();
    expect(screen.getByText("Refund approved")).toBeTruthy();
    expect(screen.getByText("Jane completed Testing")).toBeTruthy();
    expect(screen.queryByText("Resume React Patterns")).toBeNull();

    const manage = screen.getByText("Manage preferences") as HTMLAnchorElement;
    expect(manage.getAttribute("href")).toBe("/settings/notifications");
  });
});
