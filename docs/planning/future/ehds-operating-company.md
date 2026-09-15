# Showing the operating model, not only the journey

**Status:** future. Opened 2026-09-15, out of the Spanish HDAB demo (issue #27).
**Paper:** [`docs/ehds-operating-company.md`](../../ehds-operating-company.md)
**Diagram:** [`docs/diagrams/ehds-operating-model.svg`](../../diagrams/ehds-operating-model.svg)

## Why

The demonstrator walks a permit from application to audit convincingly. What it
does not show is the layer underneath: who onboarded the holder, who runs the
catalogue, who is called when the transfer fails. A ministry deciding whether to
stand up an operating company by March 2029 is buying that layer, not the
journey, and right now they have to take the paper's word for it.

Everything below is additive. None of it changes the demo script in issue #27.

## Phase A: make the operator visible

Small, and the highest ratio of credibility to effort.

- [ ] An `/operations` page: the service map as the running system sees it, with
      each service's owner, and a live health indicator per service. The graphic
      becomes clickable rather than a slide.
- [ ] Add an `OperatingCompany` participant type to the seed, as processor, with
      an `Art. 28` relationship to the access body. Fictional, sibling of the
      existing MedReg DE and MedReg ES. It should be visible in the graph as what
      it is: not a party to any contract, present in every operation.
- [ ] Onboarding funnel state on `/onboarding`: the eight steps from the paper,
      with a holder sitting at a known step, so the page shows a process rather
      than a form.

## Phase B: the clocks

The operating model is mostly about deadlines, and deadlines are testable.

- [ ] Model the statutory clocks as data: three months from request to data
      (Art. 60(2)), three months to a permit decision (Art. 68(4)), two on the
      accelerated path, 30 working days to publish a decision (Art. 57(1)(j)),
      twelve months to re-verify a dataset description (Art. 60(3)).
- [ ] Surface them on `/compliance` as time remaining, not as a status word. A
      regulator recognises a countdown.
- [ ] Journey tests asserting a breached clock is visible and attributed to the
      party that owes it.

## Phase C: incident and support surface

- [ ] An incident record spanning parties, with the severity matrix from the
      paper and the GDPR, NIS2 and Art. 63 triggers attached.
- [ ] A permit-scope violation path: detected by the operator, escalated to the
      access body, decided there. The point is that the operator cannot resolve
      it alone.

## Phase D: fees

- [ ] Cost-recovery fee estimate on a permit, split into the access body's
      processing and the holder's preparation (Art. 62(2)), with the reduced-fee
      categories from Art. 62(1) applied to the persona.

## Not in scope

The numbering cleanup is tracked separately. See
[`docs/ehds-article-numbering.md`](../../ehds-article-numbering.md): about 48
files carry the 2022 proposal numbers, and that is a mechanical change to make
when nothing is imminent, not before a demo.
