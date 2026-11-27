import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { RefundStatus } from "~/db/schema";
import { formatPrice } from "~/lib/utils";

export type TeamLicenceRowData = {
  purchaseId: number;
  courseTitle: string;
  courseSlug: string;
  seatCount: number;
  claimedSeatCount: number;
  amountPaid: number;
  purchasedAt: string;
  lastDayInWindow: string;
  canRequestRefund: boolean;
  latestRefundRequest: {
    status: string;
    decisionNote: string | null;
  } | null;
};

function LicenceHeader({
  licence,
  canRequestRefund,
  onRequestRefund,
}: {
  licence: TeamLicenceRowData;
  canRequestRefund: boolean;
  onRequestRefund: () => void;
}) {
  const refundRequest = licence.latestRefundRequest;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="font-medium">{licence.courseTitle}</p>
        <p className="text-sm text-muted-foreground">
          {licence.seatCount} seats · {licence.claimedSeatCount} claimed ·{" "}
          {formatPrice(licence.amountPaid)} · bought{" "}
          {new Date(licence.purchasedAt).toLocaleDateString()}
        </p>
      </div>
      {refundRequest?.status === RefundStatus.Open && (
        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Refund requested — seats on hold
        </span>
      )}
      {refundRequest?.status === RefundStatus.Approved && (
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
          Refunded
        </span>
      )}
      {canRequestRefund && (
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={onRequestRefund}
        >
          Request a refund
        </Button>
      )}
    </div>
  );
}

function GrantSeatForm({ licence }: { licence: TeamLicenceRowData }) {
  const grantFetcher = useFetcher<{
    errors?: Record<string, string>;
    ok?: boolean;
  }>();
  const [grantEmail, setGrantEmail] = useState("");
  const isGranting = grantFetcher.state !== "idle";

  useEffect(() => {
    const firstError = Object.values(grantFetcher.data?.errors ?? {})[0];
    if (grantFetcher.state === "idle" && firstError) {
      toast.error(firstError);
    } else if (grantFetcher.state === "idle" && grantFetcher.data?.ok) {
      toast.success("Seat granted — the student has been invited.");
      setGrantEmail("");
    }
  }, [grantFetcher.state, grantFetcher.data]);

  return (
    <grantFetcher.Form method="post" action="/team" className="mt-3 flex gap-2">
      <input type="hidden" name="intent" value="grant-seat" />
      <input type="hidden" name="teamLicenceId" value={licence.purchaseId} />
      <input
        type="email"
        name="studentEmail"
        required
        placeholder="student@example.com"
        value={grantEmail}
        onChange={(event) => setGrantEmail(event.target.value)}
        className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
      />
      <Button type="submit" size="sm" disabled={isGranting}>
        {isGranting ? "Granting..." : "Grant seat"}
      </Button>
    </grantFetcher.Form>
  );
}

function RefundRequestForm({
  licence,
  onCancel,
}: {
  licence: TeamLicenceRowData;
  onCancel: () => void;
}) {
  const fetcher = useFetcher<{ errors?: Record<string, string> }>();
  const isSubmitting = fetcher.state !== "idle";

  useEffect(() => {
    const firstError = Object.values(fetcher.data?.errors ?? {})[0];
    if (fetcher.state === "idle" && firstError) {
      toast.error(firstError);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      method="post"
      action={`/courses/${licence.courseSlug}/refund`}
      className="mt-4 space-y-2"
    >
      <p className="text-xs text-muted-foreground">
        We will send {formatPrice(licence.amountPaid)} back once someone has
        read your note. Until then, none of this licence&apos;s seats can be
        claimed. You can ask until{" "}
        {/* A calendar day, so read it as local midnight, not UTC. */}
        {new Date(`${licence.lastDayInWindow}T00:00`).toLocaleDateString()}.
      </p>
      <input type="hidden" name="purchaseId" value={licence.purchaseId} />
      <Textarea
        name="reason"
        rows={3}
        required
        placeholder="What went wrong?"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Request a refund"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Keep it
        </Button>
      </div>
    </fetcher.Form>
  );
}

export function TeamLicenceRow({ licence }: { licence: TeamLicenceRowData }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const refundRequest = licence.latestRefundRequest;
  const grantFormVisible =
    refundRequest?.status !== RefundStatus.Open &&
    refundRequest?.status !== RefundStatus.Approved;

  return (
    <Card>
      <CardContent className="p-4">
        <LicenceHeader
          licence={licence}
          canRequestRefund={licence.canRequestRefund && !isFormOpen}
          onRequestRefund={() => setIsFormOpen(true)}
        />
        {grantFormVisible && <GrantSeatForm licence={licence} />}
        {refundRequest?.status === RefundStatus.Declined &&
          refundRequest.decisionNote && (
            <p className="mt-3 rounded-md bg-muted p-2 text-sm">
              <span className="font-medium">Refund declined: </span>
              {refundRequest.decisionNote}
            </p>
          )}
        {licence.canRequestRefund && isFormOpen && (
          <RefundRequestForm
            licence={licence}
            onCancel={() => setIsFormOpen(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
