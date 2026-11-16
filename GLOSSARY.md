# Cohort 005 Project

The learning platform that sells and delivers cohort-based courses.

## Language

**Refund Request**:
A learner's request to undo a course purchase and get their money back, raised from the course page. Moves through states (requested → approved or declined) as staff review it by hand. Approval triggers a Refund.
_Avoid_: Refund claim, Refund ticket, Return request, Chargeback, Cancellation

**Refund**:
The return of money to the card a learner paid with, started only after a Refund Request is approved. Moves through its own states (initiated → pending → completed, with failures possible along the way) as the payment processor settles the money back.
_Avoid_: Reversal, Chargeback, Cancellation
