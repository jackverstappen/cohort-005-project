# Learner History on a Refund Request is informational, not a gate

The team already auto-blocks Refund Requests on three hard rules: 14-day window, 2-hour watch cap, no claimed team seats. We considered promoting other signals (course rating, prior declined refunds, lessons completed, quiz attempts, last activity, prior refunds across all courses) to hard rules too. We decided to surface them on the admin approval screen as Learner History instead, leaving the decision to a human.

Hard rules are easy to game and brittle at the edges ("student with 1h59m watched vs 2h01m"). Soft signals are richer but only useful when a person weighs them in context. Mixing both — hard gate plus informational panel — gives us fast rejection of the obvious cases and human judgement on the rest.

Reversing this (promoting a signal to a gate later) is a meaningful change: admins will have built intuition around seeing a signal and choosing, and students will have built expectations around what gets auto-rejected.
