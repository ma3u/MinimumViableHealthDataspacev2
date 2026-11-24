I write as an experienced dataspace architect: I built the operating company for Catena-X, the dataspace of the global automotive supply chain, and contribute to Eclipse Tractus-X and Eclipse Dataspace Components. I build a non-commercial, open-source EHDS demo (https://ma3u.github.io/MinimumViableHealthDataspacev2) that shows the standards in action, with synthetic data and fictional organisations only; it is not a product. Its secure processing environment runs in confidential containers: a key is released only to an instance whose hardware attestation matches the data permit. Two such environments answer federated queries. Nine points:

1. Data in use. Art. 13 protects data at rest and in transit, and Art. 12 only asks a third-party operator not to look. With remote attestation the access body can verify by hardware evidence that an instance runs exactly the permitted tools (Art. 5(1), (2)), and keep the key from anyone else, the cloud provider included. Please require state-of-the-art protection of data in use where a third party or cloud operates the SPE, and name attestation as a means to verify an instance.

2. Aggregates in a federation. Art. 2(12) lets aggregated results move between instances with no check, and Art. 18(3) exempts model parameters from Art. 7. Per-site counts allow differencing: the total minus the shown sites gives a hidden site's count. My hub checks at the coordinator, after each site's results have left it; reading the draft showed me this gap. Please require small-cell suppression in each instance before results leave it, and on combined totals, as a duty of the coordinating operator. For gradients, name secure aggregation or differential privacy in the Art. 22 guidelines.

3. Query-only SPEs. Art. 6 requires interactive and collaboration tools in every instance. Data requests (Art. 69) and feasibility queries need neither, and a batch or query-only instance (Art. 14(3)) exposes less. Please apply Art. 6 where the permit provides for interactive processing.

4. Log retention. Art. 16(4): "five years or one year following the end of validity of the data permit, whichever is shorter". Please say whether five years count from each entry, and keep the floor of at least one year of Art. 73(1)(e) for entries written near the end of a long permit.

5. Deletion and reproducibility. Art. 8(5) allows six months but is silent on keeping analysis scripts and released outputs for the access body or for results published under Art. 61, which TEHDAS2 D7.1 provides for. Please delete without undue delay, at the latest within six months, and allow scripts and released outputs, never row-level data, to be kept.

6. Federation standards. Art. 18(2)(a) to (c) ask for common data models, metadata, query languages and interoperable user management, but name none. Please refer to HealthDCAT-AP (Art. 77), the HealthData@EU specifications (Art. 75), OMOP CDM and FHIR, and EUDI-based organisation identity, so cross-border federations can join without bilateral work.

7. Machine-readable information. Art. 9(2) and 18(1) ask for public information on capabilities and federation members. Please publish it in the national catalogues as HealthDCAT-AP data services, so applicants can choose an SPE in their application.

8. Machines. Art. 10(4) asks for strong user authentication for all users. Batch jobs, API clients and federated instances are not persons. Please add rules for workload and organisation identity, consistent with Art. 18(2)(d).

9. Editorial. Art. 2 starts at point (2), Art. 8 at paragraph 4; Art. 18 is numbered 8 to 11 while Art. 20(1)(b) cites Art. 18(2); Art. 21(3) has two points (a); Art. 1 is numbered (14) and (15); "within an shall" in Art. 13(2); "execute model training these tasks" in Art. 14(3)(b); "sensisity", "processsed" in recital 7.

Details, sources and the hub's evidence are in the attachment.
