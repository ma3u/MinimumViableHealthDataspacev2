package eu.mvhd.dataplane;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import eu.mvhd.dataplane.ProxyClient.ProxyRefusal;
import eu.mvhd.dataplane.PushLogic.DeliveryRefused;
import org.eclipse.dataplane.Dataplane;
import org.eclipse.dataplane.domain.Result;
import org.eclipse.dataplane.domain.dataflow.DataFlow;
import org.eclipse.dataplane.domain.dataflow.DataFlowPrepareMessage;
import org.eclipse.dataplane.domain.dataflow.DataFlowResumeMessage;
import org.eclipse.dataplane.domain.dataflow.DataFlowStartMessage;
import org.eclipse.dataplane.domain.dataflow.DataFlowStartedNotificationMessage;
import org.eclipse.dataplane.domain.dataflow.DataFlowSuspendMessage;
import org.eclipse.dataplane.domain.dataflow.DataFlowTerminateMessage;
import org.eclipse.dataplane.domain.registration.ControlPlaneRegistrationMessage;
import org.eclipse.dataplane.exception.ResourceNotFoundException;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.function.Consumer;
import java.util.regex.Pattern;

/**
 * The data plane's HTTP face: Data Plane Signaling per participant context,
 * the JWKS, and a health check.
 *
 * <p>The SDK ships controllers for one control plane with no participant
 * context in the path. The hub's control plane is virtual: every participant
 * context registers its own data plane id and calls its own path, as it does
 * with siglet ({@code /api/v1/{context}/dataflows}). So the paths and the
 * token check are here, and the SDK's {@link Dataplane} does the rest.
 */
public final class SignalingApi {

    /** A participant context id or a flow id: what may sit in a path. */
    private static final Pattern PLAIN_ID = Pattern.compile("[A-Za-z0-9._:@~-]{1,256}");
    private static final String PREFIX = "/api/v1/";
    /** A signaling message is small; anything larger is not one. */
    private static final int MAX_BODY = 1 << 20;

    private final Dataplane dataplane;
    private final SignalingAuth auth;
    private final SigningKeys keys;
    private final URI controlPlaneSignalingUrl;
    private final ObjectMapper mapper;
    private final Consumer<String> log;

    public SignalingApi(Dataplane dataplane, SignalingAuth auth, SigningKeys keys, URI controlPlaneSignalingUrl,
                        ObjectMapper mapper, Consumer<String> log) {
        this.dataplane = dataplane;
        this.auth = auth;
        this.keys = keys;
        this.controlPlaneSignalingUrl = controlPlaneSignalingUrl;
        this.mapper = mapper;
        this.log = log;
    }

    public HttpServer start(int port, Executor executor) throws IOException {
        var server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/", this::handle);
        server.setExecutor(executor);
        server.start();
        return server;
    }

    /** What a request is answered with. */
    record Answer(int status, Object body) {
        static Answer error(int status, String message) {
            return new Answer(status, Map.of("error", message == null ? "error" : message));
        }
    }

    private void handle(HttpExchange exchange) throws IOException {
        Answer answer;
        try {
            answer = route(exchange);
        } catch (RuntimeException e) {
            log.accept("unexpected: " + e);
            answer = Answer.error(500, "the data plane failed");
        }
        var bytes = answer.body() instanceof String text
                ? text.getBytes(StandardCharsets.UTF_8)
                : mapper.writeValueAsBytes(answer.body() == null ? Map.of() : answer.body());
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(answer.status(), bytes.length);
        try (var out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    Answer route(HttpExchange exchange) throws IOException {
        var method = exchange.getRequestMethod();
        var path = exchange.getRequestURI().getPath();
        if ("GET".equals(method) && "/health".equals(path)) {
            return new Answer(200, Map.of("status", "UP"));
        }
        if ("GET".equals(method) && "/.well-known/jwks.json".equals(path)) {
            return new Answer(200, keys.jwks());
        }
        if (!path.startsWith(PREFIX)) {
            return Answer.error(404, "Not found");
        }
        // {context}/dataflows/{action} or {context}/dataflows/{flowId}/{action}
        var parts = path.substring(PREFIX.length()).split("/");
        if (parts.length < 3 || parts.length > 4 || !"dataflows".equals(parts[1])
                || !PLAIN_ID.matcher(parts[0]).matches()) {
            return Answer.error(404, "Not found");
        }
        try {
            auth.check(exchange.getRequestHeaders().getFirst("Authorization"));
        } catch (SignalingAuth.Refused e) {
            return Answer.error(401, e.getMessage());
        }
        var context = parts[0];
        var body = new String(exchange.getRequestBody().readNBytes(MAX_BODY), StandardCharsets.UTF_8);
        try {
            if (parts.length == 3) {
                return "POST".equals(method) ? open(context, parts[2], body) : Answer.error(405, "POST only");
            }
            if (!PLAIN_ID.matcher(parts[2]).matches()) {
                return Answer.error(404, "Not found");
            }
            return onFlow(method, context, parts[2], parts[3], body);
        } catch (JacksonException e) {
            return Answer.error(400, "the message is not valid JSON for this endpoint");
        }
    }

    /** {@code prepare} and {@code start}: the two messages that create a flow. */
    private Answer open(String context, String action, String body) {
        var registered = ensureControlPlane(context);
        if (registered.failed()) {
            return failure(registered.getException());
        }
        return switch (action) {
            case "prepare" -> {
                var message = mapper.readValue(body, DataFlowPrepareMessage.class);
                yield status(dataplane.prepare(context, message), DataFlow.State.PREPARING);
            }
            case "start" -> {
                var message = mapper.readValue(body, DataFlowStartMessage.class);
                yield status(dataplane.start(context, message), DataFlow.State.STARTING);
            }
            default -> Answer.error(404, "Not found");
        };
    }

    private Answer onFlow(String method, String context, String flowId, String action, String body) {
        // a flow belongs to the participant context that opened it
        var flow = dataplane.getById(flowId);
        if (flow.failed() || !context.equals(flow.getContent().getControlplaneId())) {
            return Answer.error(404, "no such data flow");
        }
        if ("GET".equals(method)) {
            return "status".equals(action) ? of(dataplane.status(flowId)) : Answer.error(404, "Not found");
        }
        if (!"POST".equals(method)) {
            return Answer.error(405, "POST only");
        }
        var json = body.isBlank() ? "{}" : body;
        return switch (action) {
            case "suspend" -> of(dataplane.suspend(flowId, mapper.readValue(json, DataFlowSuspendMessage.class)));
            case "resume" -> of(dataplane.resume(flowId, mapper.readValue(json, DataFlowResumeMessage.class)));
            case "terminate" -> of(dataplane.terminate(flowId, mapper.readValue(json, DataFlowTerminateMessage.class)));
            case "started" -> of(dataplane.started(flowId, mapper.readValue(json, DataFlowStartedNotificationMessage.class)));
            case "completed" -> of(dataplane.completed(flowId));
            default -> Answer.error(404, "Not found");
        };
    }

    /**
     * The SDK keys a flow's callbacks by a registered control plane. Each
     * participant context gets its own entry, because the token of a callback
     * must name that context's data plane id.
     */
    private Result<Void> ensureControlPlane(String context) {
        if (dataplane.controlPlaneStore().findById(context).succeeded()) {
            return Result.success();
        }
        return dataplane.registerControlPlane(new ControlPlaneRegistrationMessage(
                context, controlPlaneSignalingUrl, CallbackAuthorization.profileFor(context)));
    }

    private <T> Answer status(Result<T> result, DataFlow.State transitional) {
        if (result.failed()) {
            return failure(result.getException());
        }
        // 202 while the data plane is still working, as the specification has it
        var body = result.getContent();
        var pending = body instanceof org.eclipse.dataplane.domain.dataflow.DataFlowStatusMessage message
                && transitional.name().equals(message.state());
        return new Answer(pending ? 202 : 200, body);
    }

    private <T> Answer of(Result<T> result) {
        return result.failed() ? failure(result.getException()) : new Answer(200, result.getContent());
    }

    /**
     * The control plane retries a 5xx and ends the transfer on a 4xx, so the
     * status says whether trying again can help.
     */
    private Answer failure(Exception e) {
        if (e instanceof DeliveryRefused) {
            return Answer.error(409, e.getMessage());
        }
        if (e instanceof ProxyRefusal refusal) {
            // a workspace that is stopped or starting may answer later (ADR-072)
            return Answer.error(refusal.status() >= 500 ? 503 : 409, e.getMessage());
        }
        if (e instanceof ResourceNotFoundException) {
            return Answer.error(404, "no such data flow");
        }
        if (e instanceof IOException) {
            return Answer.error(503, "the Neo4j proxy did not answer");
        }
        log.accept("signaling failed: " + e);
        return Answer.error(500, "the data plane failed");
    }
}
