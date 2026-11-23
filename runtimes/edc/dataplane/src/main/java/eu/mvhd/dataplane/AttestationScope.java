package eu.mvhd.dataplane;

import java.util.Locale;

/**
 * What a workspace's attestation proves, weakest first (ADR-068 decision 5).
 * The provider's side pushes only into a workspace at or above its floor.
 */
public enum AttestationScope {
    /** No hardware evidence: the compose stack and CI. */
    SIMULATED,
    /** Genuine hardware and a measured boot, not which container ran. */
    NODE,
    /** The workload's own policy, checked by hardware. */
    WORKLOAD;

    public static AttestationScope parse(String value) {
        if (value == null) {
            throw new IllegalArgumentException("no attestation scope given");
        }
        return valueOf(value.trim().toUpperCase(Locale.ROOT));
    }

    public boolean atLeast(AttestationScope floor) {
        return ordinal() >= floor.ordinal();
    }

    public String wire() {
        return name().toLowerCase(Locale.ROOT);
    }
}
