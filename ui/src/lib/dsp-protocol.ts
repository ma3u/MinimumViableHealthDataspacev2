/**
 * The DSP protocol identifier, in one place.
 *
 * Issue #180. Every DSP call in this repository sent
 * `dataspace-protocol-http:2025-1`, and the connector does not register a
 * dispatcher under that name. Measured against the local stack, same request,
 * only this field differing:
 *
 *   dataspace-protocol-http:2025-1   502  No provider dispatcher registered
 *   dataspace-protocol-http          502  same
 *   dataspace-protocol-http:2024-1   502  same
 *   http-dsp-profile-2025-1          gets past the dispatcher lookup
 *
 * `DspHttpDispatcherV2025Extension` registers one dispatcher per
 * `DataspaceProfileContext`, and `DspVirtualApiConfigurationV2025Extension`
 * registers that profile as `http-dsp-profile-2025-1`. The key is the profile
 * id, not the DSP version string — a consequence of the connector running in
 * virtual / multi-participant mode, which arrived with the EDC 0.18 launchers
 * (#97 Phase B, #102). The old key silently stopped working at that upgrade,
 * which is why catalog discovery returned nothing and every negotiation
 * seeded since went TERMINATED.
 *
 * Its own module, with no imports, so a client component can use it without
 * pulling the server-side EDC client into the bundle. The shell half is
 * `scripts/lib/dsp-protocol.sh` — keep the two in step.
 */
export const DSP_PROTOCOL =
  process.env.DSP_PROTOCOL || "http-dsp-profile-2025-1";
