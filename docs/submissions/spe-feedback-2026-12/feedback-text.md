I am a dataspace architect: I built the operating company for Catena-X and contribute to Eclipse Tractus-X and Eclipse Dataspace Components. I run a non-commercial, open-source EHDS demo with synthetic data only, including a federated SPE on confidential hardware (https://ma3u.github.io/MinimumViableHealthDataspacev2). This replaces my feedback of 24 November.

As written, the draft will make SPEs very expensive to run, and it builds them outside the data space that the EHDS is meant to be.

A. Cost and effort for operators

The draft prescribes a manual pipeline per permit: a dedicated instance and staging environment (Art. 3(1), 4(1)); the access body checks, prepares and uploads the data itself (Art. 4(2), (3)); verification before access and monitoring for the permit's lifetime (Art. 5); approval of every export, with manual review (Art. 7); verifiable deletion (Art. 8); write-once logs of all observable user activity (Art. 16); external audits (Art. 17). Only disaster recovery is proportionate (Art. 11(7)), and no cost estimate is published. TEHDAS2 D7.4 already calls building SPEs "an expensive and time-consuming effort", and activity logging a "significant cost issue". Please:

1. Add proportionality by risk and use: an SPE that only runs approved queries or batch jobs and returns aggregates needs no full workspace, collaboration suite (Art. 6) or remote desktop.

2. Accept machine evidence instead of manual work: a hardware-signed attestation that binds the measured instance to the permit should satisfy Art. 5 and 12(1)(a); destroying the per-permit key should count as verifiable deletion (Art. 8).

3. Let a sealed, per-permit encrypted extract, decrypted only inside an attested instance, replace staging and upload by the access body (Art. 4).

4. Limit Art. 16 to security-relevant events, and let one compliance assessment (Art. 21) count in every Member State.

5. Publish a cost and impact assessment before adoption.

B. Data spaces and digital identity

Secondary use under the EHDS is a data space, yet the draft never mentions the Data Act's interoperability rules for data spaces (Art. 33), the Dataspace Protocol, or eIDAS 2.0 (Regulation (EU) 2024/1183). Identity stops at strong authentication of persons (Art. 10(4)) and a recital on the EUDI Wallet that cites the 2014 text. Please:

6. Cite eIDAS as amended by Regulation (EU) 2024/1183, and accept electronic attestations of attributes (affiliation, qualification) as verifiable credentials when granting access (Art. 10).

7. Require organisational identities for access bodies, holders, operators and federation members (European Business Wallet, qualified electronic seals), and attested workload identities for instances and automated jobs (Art. 10, 18(2)(c), (d)).

8. Make the data permit machine-readable (for example ODRL), so that instance configuration, access rights and export rules follow from it automatically (Art. 3(3), 5(1), 10(1)).

9. Connect holders, SPEs and federations through the Dataspace Protocol and the harmonised standards on trusted data transactions under Art. 33 Data Act, and name the common standards for federations: HealthDCAT-AP, OMOP CDM, HL7 FHIR (Art. 18(2)).

C. Points from my first submission

10. Protect data in use, not only at rest and in transit (Art. 13).

11. Hide small counts in each SPE and again in federated totals (Art. 18).

12. Say when the log period starts, and never keep logs less than one year (Art. 16(4)).

13. Editorial: Art. 8 starts at paragraph 4, Art. 18 at 8, Art. 21(3) has two points (a), Art. 13(2) lacks a noun.

Details, sources and screenshots of a working SPE are in the attachment.
