# contract/

One JSON document that two languages must agree on.

`analyse-request.json` is the request the iPhone sends to
`services/claude-federation`. Both ends test against this file rather than
against each other's source:

| Side       | Test                         | Proves                                |
| ---------- | ---------------------------- | ------------------------------------- |
| Swift      | `CloudAnalysisContractTests` | the app **produces** this document    |
| TypeScript | `analyse.contract.test.ts`   | the service **accepts** this document |

A fixture rather than a shared type, because the two runtimes cannot share one.
A fixture rather than each side asserting its own shape, because two tests that
never meet can both pass while the app talks to a server that rejects it, and
the only place that failure shows up is on a phone with no debugger attached.

Change the shape in one place and one of the two tests goes red.
