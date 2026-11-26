---
title: "Comments on TEHDAS2 D7.4, Technical specification for health data access bodies on the implementation of secure processing environments"
subtitle: "Cost of operation, data spaces and digital identity, and alignment with the draft implementing act under Art. 73(5)"
date: "26 November 2026"
---

# Why I write

D7.4 (24 February 2026) is not binding, but access bodies will procure against it, and the Commission's draft implementing regulation on secure processing environments (Ares(2026)10903532, open for feedback until 21 December 2026) builds on the same ground. I am a dataspace architect: I built the operating company for Catena-X and contribute to Eclipse Tractus-X and Eclipse Dataspace Components. I run a non-commercial, open-source EHDS demo with synthetic data only, whose SPE runs as confidential containers with remote attestation (<https://ma3u.github.io/MinimumViableHealthDataspacev2>).

My question to TEHDAS2: **is there still a way to feed comments into D7.4 or its follow-up before the project ends in December 2026, and could WP7 consider the points below in its exchange with the Commission on the implementing act?**

# 1. Cost of operation

D7.4 names the problem itself: building SPEs "is an expensive and time-consuming effort" (Annex 7, p. 97), activity logging is a "significant cost issue" (p. 100), and consultation respondents found requirements "infeasible or overly costly" (Annex 2, p. 78). The Commission's draft now makes much of this binding per data permit: an instance and a staging environment per permit (Art. 3, 4), upload by the access body (Art. 4(3)), verification and monitoring (Art. 5), approval of every export (Art. 7), write-once logs of all user activity (Art. 16), external audits (Art. 17), with proportionality only for disaster recovery (Art. 11(7)).

I suggest that D7.4's follow-up and WP7's input to the Commission:

- distinguish SPEs by use: a query-only or batch SPE that returns aggregates needs neither a remote desktop nor a collaboration suite. Section 5.6 calls remote desktop "the legacy approach" (p. 61), yet eight of TIR-18 to TIR-26 are mandatory (p. 64); please make them conditional, as the draft act does (Art. 14(2));
- accept machine evidence instead of manual checks: a hardware-signed attestation report that binds the measured workload to the permit, checked by the access body before it releases the per-permit key (section 4.2.2, p. 27, already prefers dynamic, one-time keys). Destroying that key also gives OPR-6 a verifiable deletion method, backups included;
- add protection of data in use next to SDR-3: confidential computing is an infrastructure control like encryption at rest, not a statistical privacy technique, so it belongs in this specification rather than among the privacy-enhancing technologies left out of scope;
- keep the position of Annex 7 on activity logs (p. 100) and carry it into the implementing act: log security-relevant events, not every user action.

# 2. Data spaces and digital identity

D7.4 sees what the draft act leaves out. It finds that the EHDS "will depend heavily on" eIDAS and the EUDI Wallet (Annex 7, p. 94), that researchers' attributes are needed and that data spaces are expected to provide them as Wallet verifiable credentials (p. 95), and it asks for a "machine-actionable access permit" (p. 95). The Commission's draft mentions none of this: it cites only strong user authentication under the 2014 eIDAS text (Art. 10(4), recital 7), and neither the Data Act nor eIDAS 2.0 (Regulation (EU) 2024/1183).

I suggest:

- FSPER-2 and FSPER-6: cover organisational identities of holders, access bodies and operators (European Business Wallet, qualified electronic seals), electronic attestations of attributes for users, and attested workload identities for SPE instances in a federation;
- SPER-3 and FSPER-8: name the Dataspace Protocol next to eDelivery and Crypt4GH, so that holders that already describe datasets in HealthDCAT-AP connect once to all SPEs and to the other common European data spaces, in line with the harmonised standards on trusted data transactions under Art. 33 of the Data Act;
- a machine-readable data permit (for example ODRL) as the source from which the instance configuration, access rights and export rules are derived.

# 3. One rulebook, and reference implementations

Where D7.4 and the implementing act differ, access bodies will procure against the stricter text. A short mapping from D7.4 requirement IDs to the articles of the act would prevent costly divergence. Annex 2 reports that respondents missed reference architectures and deployment scenarios; open-source implementations can fill that gap. Mine is available for review, with its known limitations documented.

My full feedback to the Commission, with article references and screenshots of the working SPE, is attached.
