# Background: the EDC component architecture

> Moved from the [planning index](../planning-health-dataspace-v2.md) on 2026-10-04.
> Context for why the project runs EDC-V, DCore, CFM and JAD; not a work item.

## Background & Inspiration

This project is contextualised by:
[European Health Dataspaces, Digital Twins: A Journey from FHIR Basics to Intelligent Patient Models](https://www.linkedin.com/pulse/european-health-dataspaces-digital-twins-journey-fhir-buchhorn-roth-8t51c/)

The Eclipse Dataspace ecosystem has undergone a fundamental architectural evolution since the first health demo. Three new projects change how dataspaces are built and operated — the [MinimumViableDataspace health demo](https://github.com/ma3u/MinimumViableDataspace/tree/health-demo) needs to evolve with them.

---

## New EDC Component Architecture

The original MVD used a monolithic EDC Connector with an embedded data plane. The new architecture disaggregates this into purpose-built components:

| Component                          | Project                                                                                    | Purpose                                                           | Key Change                                                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **EDC-V** (Virtual Connector)      | [eclipse-edc/Virtual-Connector](https://github.com/eclipse-edc/Virtual-Connector)          | Virtualized control plane optimized for cloud service providers   | Multi-tenant isolation, participant-scoped APIs, provisioning system integration [github](https://github.com/eclipse-edc/Virtual-Connector/blob/main/docs/administration_api.md) |
| **DCore** (Data Plane Core)        | [Eclipse Data Plane Core](https://projects.eclipse.org/projects/technology.dataplane-core) | Multi-language data plane SDKs (Go, Java, .NET, Rust, TypeScript) | Rust-based HTTP data plane, Data Plane Signaling spec compliance [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-data-plane-core)                              |
| **CFM** (Connector Fabric Manager) | [Eclipse CFM](https://projects.eclipse.org/proposals/eclipse-cfm)                          | Management plane for multi-tenant connector orchestration         | Tenant Manager + Provision Manager, multi-role UI (operator, reseller, end user) [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-connector-fabric-manager)     |
| **JAD** (Joint Architecture Demo)  | [Metaform/jad](https://github.com/Metaform/jad)                                            | Reference demonstrator combining EDC-V + CFM + DCore + onboarding | Replaces old MVD as the canonical demo for cloud provider deployments [linkedin](https://www.linkedin.com/posts/mbuchhorn_fulcrum-daas-edc-activity-7427340949279809536-OaG6)    |

EDC-V is not a monolith — it consists of multiple services with separate administration APIs, strictly enforcing isolation boundaries between participants to prevent data leakage. The CFM sits above EDC-V as an automated provisioning system that handles keypair generation, DID document creation, and Verifiable Credential issuance when new participants onboard. [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-connector-fabric-manager)

### Protocol Foundation: DSP + DCP + DPS

All three core specifications are now final or near-final:

- **DSP 2025-1** (Dataspace Protocol) — Catalog access, contract negotiation, and transfer management over RESTful HTTPS. Normative JSON schemas for all message payloads. Technology Compatibility Kit with 140+ test cases passed by both EDC and TNO connectors. [internationaldataspaces](https://internationaldataspaces.org/dataspace-protocol-nears-first-official-release/)
- **DCP v1.0** (Decentralized Claims Protocol) — Self-issued identity tokens, Verifiable Credential storage/presentation, and credential issuance protocols. Released July 2025 with 119 merged PRs from 12 organizations. [projects.eclipse](https://projects.eclipse.org/projects/technology.dataspace-dcp/releases/1.0.0)
- **DPS** (Data Plane Signaling) — Signaling interface between control plane and data plane, enabling independently deployed and scaled DCore data planes. DCore implements this specification natively. [projects.eclipse](https://projects.eclipse.org/proposals/eclipse-data-plane-core)
