package eu.mvhd.edc.controlplane.nats;

import org.eclipse.edc.runtime.metamodel.annotation.Extension;
import org.eclipse.edc.runtime.metamodel.annotation.Inject;
import org.eclipse.edc.spi.system.ServiceExtension;
import org.eclipse.edc.spi.system.ServiceExtensionContext;
import org.eclipse.edc.spi.system.health.HealthCheckService;

import java.time.Clock;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;

/**
 * Makes the control plane's liveness fail when its NATS task streams are gone
 * (ADR-084, docs/gotchas.md 2026-11-09).
 * <p>
 * EDC 1.0.0-RC5 creates cn-stream and tp-stream at startup only, in memory. A
 * NATS restart under a running control plane deletes both, and every
 * negotiation start answers 500 until the control plane restarts. The
 * subscribers' own liveness check asks only whether the connection is open,
 * and the NATS client reconnects, so it stays green. This check asks NATS for
 * the streams themselves; a liveness probe on /api/check/liveness then
 * restarts the control plane, whose startup creates both streams again.
 * <p>
 * It reads the subscribers' own settings, with their defaults, so it checks
 * the streams they use. {@value #ENABLED} set to false turns it off.
 */
@Extension(NatsTaskStreamsLivenessExtension.NAME)
public class NatsTaskStreamsLivenessExtension implements ServiceExtension {

    public static final String NAME = "NATS Task Streams Liveness";

    // no hyphen: EDC maps an environment name `_` to `.`, so
    // MVHD_NATS_TASKSTREAMS_LIVENESS_ENABLED=false reaches it
    static final String ENABLED = "mvhd.nats.taskstreams.liveness.enabled";
    static final Duration TTL = Duration.ofSeconds(10);

    /** subscriber prefix, default stream name (NatsSubscriberConfig, 1.0.0-RC5) */
    private static final String[][] SUBSCRIBERS = {
            {"edc.nats.cn.subscriber", "cn-stream"},
            {"edc.nats.tp.subscriber", "tp-stream"},
    };

    @Inject
    private HealthCheckService healthCheckService;

    private NatsStreamLookup lookup;

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public void initialize(ServiceExtensionContext context) {
        var monitor = context.getMonitor().withPrefix(NAME);
        var config = context.getConfig();
        if (!config.getBoolean(ENABLED, true)) {
            monitor.info(ENABLED + " is false: the task streams are not part of liveness");
            return;
        }
        var urlByStream = new LinkedHashMap<String, String>();
        for (var subscriber : SUBSCRIBERS) {
            var url = config.getString(subscriber[0] + ".url", null);
            if (url != null && !url.isBlank()) {
                urlByStream.put(config.getString(subscriber[0] + ".stream", subscriber[1]), url);
            }
        }
        if (urlByStream.isEmpty()) {
            monitor.info("no NATS task subscriber configured: nothing to check");
            return;
        }
        lookup = new NatsStreamLookup();
        var check = new TaskStreamsCheck(List.copyOf(urlByStream.keySet()),
                stream -> lookup.exists(urlByStream.get(stream), stream),
                Clock.systemUTC(), TTL, monitor);
        healthCheckService.addLivenessProvider(check);
        monitor.info("liveness covers the NATS streams " + String.join(", ", urlByStream.keySet()));
    }

    @Override
    public void shutdown() {
        if (lookup != null) {
            lookup.close();
        }
    }
}
