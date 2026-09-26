#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# The DSP protocol identifier, in one place
# ---------------------------------------------------------------------------
# Issue #180. Every DSP call in this repository sent
# `dataspace-protocol-http:2025-1`, and the connector does not register a
# dispatcher under that name. Measured against the local stack, same request,
# only this field differing:
#
#   dataspace-protocol-http:2025-1   502  No provider dispatcher registered
#   dataspace-protocol-http          502  same
#   dataspace-protocol-http:2024-1   502  same
#   http-dsp-profile-2025-1          gets past the dispatcher lookup
#
# `DspHttpDispatcherV2025Extension` registers one dispatcher per
# `DataspaceProfileContext`, and `DspVirtualApiConfigurationV2025Extension`
# registers that profile under the id `http-dsp-profile-2025-1`. So the key is
# the profile id, not the DSP version string. That is a consequence of the
# connector running in virtual / multi-participant mode, which arrived with
# the EDC 0.18 launchers (#97 Phase B, #102); the old version-string key
# predates it and silently stopped working at the upgrade.
#
# It explains a lot that looked unrelated: catalog discovery returning zero
# datasets, every negotiation seeded since the upgrade going TERMINATED, and
# run-dsp-tck.sh's FINALIZED assertions skipping rather than passing.
#
# One definition, because eleven independently edited copies are how it drifted
# in the first place. The UI has the matching constant in
# ui/src/lib/edc/client.ts — keep the two in step.
# ---------------------------------------------------------------------------

# Override per environment if a stack registers a different profile id.
DSP_PROTOCOL="${DSP_PROTOCOL:-http-dsp-profile-2025-1}"
export DSP_PROTOCOL
