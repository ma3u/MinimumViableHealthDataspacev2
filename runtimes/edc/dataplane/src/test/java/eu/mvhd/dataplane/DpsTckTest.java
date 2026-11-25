package eu.mvhd.dataplane;

import com.sun.net.httpserver.HttpServer;
import org.eclipse.dataplane.Dataplane;
import org.eclipse.dataplane.domain.DataAddress;
import org.eclipse.dataplane.domain.Result;
import org.eclipse.dataplane.domain.dataflow.DataFlow;
import org.eclipse.dataspacetck.dps.system.DpsSystemLauncher;
import org.eclipse.dataspacetck.runtime.TckRuntime;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.URI;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.platform.launcher.TagFilter.excludeTags;

/**
 * The Data Plane Signaling TCK (dps-tck, the release EDC 1.0.0-RC8 runs)
 * against this data plane's HTTP layer: the per participant context paths,
 * the token check, the 200 or 202 answers and the callbacks. The SDK's own
 * controllers are tested by the SDK; ours are not theirs, so they are tested
 * here.
 *
 * <p>The push logic is replaced by one that plays the TCK's sentinel
 * agreements (dps.tck.properties), as the SDK's own TCK test does: the TCK
 * checks the protocol, not what is delivered.
 */
class DpsTckTest {

    /** The participant context the TCK's control plane signals for, and the control plane's id. */
    private static final String CONTEXT = "tck-control-plane";
    /** What the TCK sends as Authorization; anything else is refused, as the control plane's token would be. */
    private static final String TCK_AUTHORIZATION = "Bearer tck-control-plane-token";
    /** Where the TCK's simulated control plane takes callbacks (its default port). */
    private static final URI TCK_CONTROL_PLANE = URI.create("http://localhost:8083");

    private final ScheduledExecutorService later = Executors.newSingleThreadScheduledExecutor();
    private HttpServer server;
    private Dataplane dataplane;

    @BeforeEach
    void startDataplane() throws IOException {
        var keys = SigningKeys.load("", Clock.systemUTC());
        dataplane = Dataplane.newInstance()
                .id("mvhd-dataplane")
                .registerAuthorization(new CallbackAuthorization(keys))
                .onPrepare(this::prepare)
                .onStart(this::start)
                .onStarted(this::started)
                .onSuspend(Result::success)
                .onResume(Result::success)
                .onTerminate(Result::success)
                .onCompleted(Result::success)
                .build();
        SignalingAuth auth = header -> {
            if (!TCK_AUTHORIZATION.equals(header)) {
                throw new SignalingAuth.Refused("not the TCK's control plane");
            }
        };
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        server = new SignalingApi(dataplane, auth, keys, TCK_CONTROL_PLANE, Main.mapper(), line -> { })
                .start(0, executor);
    }

    @AfterEach
    void stopDataplane() {
        later.shutdownNow();
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void passesTheDataPlaneSignalingTck() throws IOException {
        var properties = asMap(properties());
        properties.put("dataspacetck.dps.dataplane.url",
                "http://localhost:" + server.getAddress().getPort() + "/api/v1/" + CONTEXT);
        properties.put("dataspacetck.dps.dataplane.authorization", TCK_AUTHORIZATION);
        var result = TckRuntime.Builder.newInstance()
                .launcher(DpsSystemLauncher.class)
                .properties(properties)
                .addPackage("org.eclipse.dataspacetck.dps.verification.dataplane")
                // the HTTP profile's tests need a data plane that moves HTTP data; this one pushes into an SPE inbox
                .filters(excludeTags("http-profile"))
                .build()
                .execute();

        var failures = result.getFailures().stream()
                .map(f -> f.getTestIdentifier().getDisplayName() + ": " + f.getException().getMessage())
                .toList();
        assertTrue(result.getTestsSucceededCount() > 0, "the TCK ran no test");
        assertTrue(failures.isEmpty(), "TCK failures: " + failures);
    }

    // --- the TCK's sentinel behaviours ----------------------------------------

    private Result<DataFlow> prepare(DataFlow flow) {
        if ("async".equals(flow.getAgreementId())) {
            flow.transitionToPreparing();
            var id = flow.getId();
            later.schedule(() -> dataplane.notifyPrepared(id, Result::success), 50, TimeUnit.MILLISECONDS);
        } else {
            flow.setDataAddress(new DataAddress("HttpData", "http://example.invalid/inbox", List.of()));
        }
        return Result.success(flow);
    }

    private Result<DataFlow> start(DataFlow flow) {
        var id = flow.getId();
        if ("async".equals(flow.getAgreementId())) {
            flow.transitionToStarting();
            later.schedule(() -> dataplane.notifyStarted(id, Result::success), 50, TimeUnit.MILLISECONDS);
            return Result.success(flow);
        }
        flow.setDataAddress(new DataAddress("HttpData", "http://example.invalid/data", List.of()));
        if ("complete".equals(flow.getAgreementId())) {
            later.schedule(() -> dataplane.notifyCompleted(id), 250, TimeUnit.MILLISECONDS);
        }
        return Result.success(flow);
    }

    private Result<DataFlow> started(DataFlow flow) {
        if ("complete".equals(flow.getAgreementId())) {
            var id = flow.getId();
            later.schedule(() -> dataplane.notifyCompleted(id), 250, TimeUnit.MILLISECONDS);
        }
        return Result.success(flow);
    }

    private Properties properties() throws IOException {
        var properties = new Properties();
        try (var in = getClass().getClassLoader().getResourceAsStream("dps.tck.properties")) {
            properties.load(in);
        }
        return properties;
    }

    private static Map<String, String> asMap(Properties properties) {
        return properties.entrySet().stream()
                .collect(Collectors.toMap(e -> e.getKey().toString(), e -> e.getValue().toString()));
    }
}
