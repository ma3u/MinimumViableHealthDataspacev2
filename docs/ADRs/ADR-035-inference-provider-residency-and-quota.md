# ADR-035: Azure EU by default, Anthropic by explicit consent, and the user's own provider without limit

**Status:** Proposed
**Date:** 2026-09-13
**Relates to:** [ADR-033](ADR-033-lab-report-extraction-pipeline.md), [ADR-034](ADR-034-claude-workload-identity-federation.md)
**Tracks:** [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186), [#187](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/187)

## Context

ADR-034 built a path from MeinBefund to a cloud model without any API key
existing in the system. It left two questions open that are product and
data-protection decisions rather than technical ones.

**Which provider answers by default.** Lab values are special category data
under GDPR Art. 9. `api.anthropic.com` is a transfer out of the EU. The project
already has an Azure OpenAI deployment in `westeurope`, and #187 exists
specifically so that inference has a defensible residency story.

**Who pays, and what stops the bill.** The operator pays for provider-side
inference, not the person using the app. An endpoint that authenticates a user
and then spends the operator's money without bound is a bill waiting to happen,
through enthusiasm, a retry loop, or someone who found the URL.

### What checking found

The deployments were still `GlobalStandard`:

```
gpt-5.1        GlobalStandard
gpt-5-mini     GlobalStandard
```

Issue #187 changed the **script default** to `DataZoneStandard` and left an
audit that warns about this, but the live deployments were never migrated.
Making Azure the default without checking would have routed German lab values
through exactly the SKU ADR-033 rejected, while the commit message said the
opposite.

## Decision

### Three paths, chosen per request

| Provider          | Pays     | Leaves the EU          | Limit                 |
| ----------------- | -------- | ---------------------- | --------------------- |
| `azure` (default) | operator | no, EU data zone       | 20 per person per day |
| `anthropic`       | operator | yes, United States     | 20 per person per day |
| the user's own    | the user | wherever they point it | none                  |

**Azure is the default** because it is the only provider-paid option that keeps
special category data inside the EU data zone. A new `gpt-5-mini-eu` deployment
on `DataZoneStandard` was added rather than recreating the existing two, which
have other consumers; migrating those is a separate decision.

**The named provider must be one the service runs.** An unknown name is refused
rather than silently replaced by the default, because quietly substituting would
mean the consent the user gave and the provider that answered were different
things, which is the one property the consent check exists to guarantee. The
reply carries `euResident` so the app reports which provider answered rather
than which one it asked for.

### Twenty analyses per person per UTC day

The number is reasoned, not round. A person with a new report works through it,
asks a handful of questions, and stops when satisfied rather than when cut off.
Twenty covers that twice over.

- **Five** would interrupt an ordinary first session with a new report, which is
  precisely the moment the feature is worth anything.
- **A hundred** is past any genuine single-day use and only raises the ceiling
  for a script.

**It counts requests, not tokens.** Tokens are what cost money, so counting them
would be the precise thing to do, but "6 questions left" is actionable and
"14,200 tokens left" is not, and a limit nobody can predict feels arbitrary when
it bites. Requests are a fair proxy **only because each is already bounded**: at
most 40 values, a 2,000 character question, a capped response. Those caps are
part of this limit rather than separate from it.

Two details that are easy to get wrong:

- **A refusal does not increment.** Otherwise a client could burn through
  tomorrow's allowance by retrying today, turning a limit into a punishment.
- **Subjects are hashed before storage.** The counter needs to tell people
  apart, not to know who they are. A table of identity-provider subjects is a
  list of who uses this service; a table of hashes counts the same thing and is
  worth nothing if read.

### The user's own provider bypasses this service entirely

When someone configures their own endpoint, the phone calls it **directly**.
Their key is never posted here and their values are never seen here.

That is not a shortcut, it is the better design: fewer parties, one less place
holding a credential, and one less place holding health data. It is also why
that path has no quota. Nothing of the operator's is being spent, so there is
nothing to ration, and a limit would be an imposition with no justification
behind it.

## Consequences

### Positive

- The default path keeps special category data in the EU data zone.
- No Azure key exists either: the managed identity holds the `Cognitive Services
OpenAI User` role, so the only credentials in this system remain things it
  proves rather than things it stores.
- The operator's exposure is bounded and legible, and the bound is explained to
  the user at the moment it applies.
- The most privacy-preserving option is also the least limited, which points
  users in the right direction without lecturing them.

### Trade-offs

- **Two provider implementations to keep working**, and a third path in the app.
- **The quota needs shared state.** The service runs one to three replicas, so
  an in-memory counter would silently permit three times the configured limit
  and reset on every deploy. `PostgresQuotaStore` exists for this;
  `MemoryQuotaStore` is correct at one replica only and says so at startup,
  because a limit that does not hold is worse than no limit, being trusted.
- **`gpt-5.1` and `gpt-5-mini` remain `GlobalStandard`.** Nothing in this ADR
  uses them, but they are still there and still wrong for health data.

### Rejected alternatives

- **Anthropic as the default.** Better model, wrong residency for the default
  path. It remains available by explicit per-call consent.
- **Counting tokens instead of requests.** More precise, less usable, and
  unnecessary once each request is individually bounded.
- **Accepting the user's key and calling on their behalf.** Simpler in the app,
  worse everywhere else: it would put a third party's credential on the
  operator's server for no benefit to anyone.

## References

- [Azure OpenAI data zones](https://learn.microsoft.com/azure/ai-services/openai/concepts/data-zones)
- Issue [#187](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/187), the residency fix this depends on
- Issue [#186](https://github.com/ma3u/MinimumViableHealthDataspacev2/issues/186) §4.3, §5
