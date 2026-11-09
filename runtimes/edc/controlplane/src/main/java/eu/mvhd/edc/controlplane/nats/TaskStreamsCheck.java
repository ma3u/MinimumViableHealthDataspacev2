package eu.mvhd.edc.controlplane.nats;

import org.eclipse.edc.spi.monitor.Monitor;
import org.eclipse.edc.spi.system.health.HealthCheckResult;
import org.eclipse.edc.spi.system.health.LivenessProvider;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * The liveness answer for the control plane's task streams (ADR-084): failed
 * when NATS says a stream does not exist, succeeded when every stream exists
 * or when NATS cannot be asked. A restart recreates a missing stream; it
 * cannot bring back an unreachable NATS, and the subscribers' own check
 * already fails on a closed connection.
 * <p>
 * The answer is kept for {@code ttl}, so a probe every few seconds asks NATS
 * at most once per period.
 */
final class TaskStreamsCheck implements LivenessProvider {

    /** Whether a stream exists: present when NATS answered, empty when it could not be asked. */
    @FunctionalInterface
    interface StreamLookup {
        Optional<Boolean> exists(String stream);
    }

    static final String COMPONENT = "NATS task streams";

    private final List<String> streams;
    private final StreamLookup lookup;
    private final Clock clock;
    private final Duration ttl;
    private final Monitor monitor;

    private HealthCheckResult cached;
    private Instant cachedAt;
    private List<String> lastMissing = List.of();

    TaskStreamsCheck(List<String> streams, StreamLookup lookup, Clock clock, Duration ttl, Monitor monitor) {
        this.streams = List.copyOf(streams);
        this.lookup = lookup;
        this.clock = clock;
        this.ttl = ttl;
        this.monitor = monitor;
    }

    @Override
    public synchronized HealthCheckResult get() {
        var now = clock.instant();
        if (cached != null && now.isBefore(cachedAt.plus(ttl))) {
            return cached;
        }
        var missing = new ArrayList<String>();
        for (var stream : streams) {
            var exists = lookup.exists(stream);
            if (exists.isEmpty()) {
                // NATS cannot be asked: one connection timeout is enough, and a
                // probe that waits for one per stream could time out itself
                break;
            }
            if (!exists.get()) {
                missing.add(stream);
            }
        }
        report(missing);
        cached = missing.isEmpty()
                ? HealthCheckResult.Builder.newInstance().component(COMPONENT).success().build()
                : HealthCheckResult.Builder.newInstance().component(COMPONENT)
                        .failure(failure(missing))
                        .build();
        cachedAt = now;
        return cached;
    }

    static String failure(List<String> missing) {
        return missing.size() == 1
                ? "NATS has no stream " + missing.get(0) + "; a restart of the control plane creates it again (ADR-084)"
                : "NATS has no streams " + String.join(", ", missing)
                        + "; a restart of the control plane creates them again (ADR-084)";
    }

    /** Logs a change only, so a probe every 30 s does not repeat it. */
    private void report(List<String> missing) {
        if (missing.equals(lastMissing)) {
            return;
        }
        if (missing.isEmpty()) {
            monitor.info("NATS task streams are back: " + String.join(", ", streams));
        } else {
            monitor.warning("NATS task streams missing: " + String.join(", ", missing)
                    + ". Every task publish answers 503 until the control plane restarts (ADR-084).");
        }
        lastMissing = List.copyOf(missing);
    }
}
