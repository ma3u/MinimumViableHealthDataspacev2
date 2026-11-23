package eu.mvhd.dataplane;

import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jwt.SignedJWT;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The data plane between a control plane and a Neo4j proxy that are both
 * played here, over real HTTP: what it answers to Data Plane Signaling, what
 * it sends to the proxy, and what it reports back.
 */
class PushFlowTest {

    private static final String CONSUMER_CTX = "ctx-pharmaco";
    private static final String PROVIDER_CTX = "ctx-alpha-klinik";
    private static final String CONSUMER = "did:web:identityhub%3A7083:pharmaco";
    private static final String PROVIDER = "did:web:identityhub%3A7083:alpha-klinik";
    private static final String GOOD = "Bearer control-plane";

    private final ObjectMapper mapper = Main.mapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private final List<Call> proxyCalls = new CopyOnWriteArrayList<>();
    private final List<Call> callbacks = new CopyOnWriteArrayList<>();
    private SigningKeys keys;
    private HttpServer proxy;
    private HttpServer controlPlane;
    private HttpServer dataplane;
    private String attestationScope = "simulated";
    private int inboxStatus = 201;
    private String dataset;
    private volatile boolean consumerStarted = true;
    private final MemoryTransport transport = new MemoryTransport();

    record Call(String method, String path, Map<String, String> headers, byte[] body) {
        String text() {
            return new String(body, StandardCharsets.UTF_8);
        }
    }

    @BeforeEach
    void start() throws Exception {
        dataset = bundle(3);
        proxy = serve(exchange -> {
            var call = record(exchange, proxyCalls);
            if (call.path().equals("/spe/SPE-1/inbox")) {
                if (inboxStatus != 201) {
                    return answer(inboxStatus, Map.of("error", "SPE-1's attestation did not pass"));
                }
                var attestation = new HashMap<String, Object>();
                attestation.put("scope", attestationScope);
                attestation.put("result", "pass");
                attestation.put("evidenceDigest", "sha256:evidence");
                attestation.put("policyId", "policy-1");
                return answer(201, Map.of(
                        "endpoint", url(proxy) + "/spe/SPE-1/inbox/flow-consumer",
                        "token", "inbox-token",
                        "attestation", attestation));
            }
            if (call.path().equals("/dataspace/push-source")) {
                return new Reply(200, dataset.getBytes(StandardCharsets.UTF_8));
            }
            if (call.path().endsWith("/ready")) {
                return answer(200, Map.of("consumerStarted", consumerStarted));
            }
            if (call.path().contains("/chunks/")) {
                return answer(202, Map.of("records", 2));
            }
            return answer(200, Map.of("completed", true));
        });
        controlPlane = serve(exchange -> {
            record(exchange, callbacks);
            return answer(200, Map.of());
        });
        var values = new HashMap<String, String>();
        values.put("DATAPLANE_PROXY_URL", url(proxy));
        values.put("DATAPLANE_CONTROL_PLANE_SIGNALING_URL", url(controlPlane) + "/api/signaling");
        values.put("DATAPLANE_ATTESTATION_FLOOR", "simulated");
        values.put("DATAPLANE_CHUNK_RECORDS", "2");
        values.put("DATAPLANE_SETTLE_MILLIS", "0");
        boot(values);
    }

    private void boot(Map<String, String> values) throws Exception {
        if (dataplane != null) {
            dataplane.stop(0);
        }
        keys = SigningKeys.load("", Clock.systemUTC());
        SignalingAuth auth = header -> {
            if (!GOOD.equals(header)) {
                throw new SignalingAuth.Refused("not the control plane");
            }
        };
        var executor = Executors.newVirtualThreadPerTaskExecutor();
        dataplane = Main.assemble(Config.from(values), keys, auth, transport, executor, line -> { })
                .start(0, executor);
    }

    @AfterEach
    void stop() {
        for (var server : new HttpServer[]{proxy, controlPlane, dataplane}) {
            if (server != null) {
                server.stop(0);
            }
        }
    }

    @Test
    void prepareOpensAnInboxAndAnswersItsAddress() throws Exception {
        var response = signal(CONSUMER_CTX, "prepare", prepare("HttpData-PUSH", Map.of()));

        assertEquals(200, response.statusCode());
        var body = json(response.body());
        assertEquals("PREPARED", body.get("state"));
        var address = (Map<?, ?>) body.get("dataAddress");
        assertEquals(url(proxy) + "/spe/SPE-1/inbox/flow-consumer", address.get("endpoint"));
        var properties = (List<?>) address.get("endpointProperties");
        assertTrue(properties.toString().contains("inbox-token"));
        assertTrue(properties.toString().contains("attestationScope"));

        var open = proxyCalls.get(0);
        var sent = json(open.text());
        assertEquals("flow-consumer", sent.get("flowId"));
        assertEquals("agreement-1", sent.get("agreementId"));
        assertEquals(CONSUMER, sent.get("consumer"));
        assertEquals(PROVIDER, sent.get("provider"));
        var token = verified(open.headers().get("authorization"));
        assertEquals("inbox:open", token.getJWTClaimsSet().getStringClaim("scope"));
        assertEquals("flow-consumer", token.getJWTClaimsSet().getStringClaim("flowId"));
    }

    @Test
    void theWorkspaceComesFromTheTransfersMetadata() throws Exception {
        proxy.removeContext("/");
        proxy.createContext("/", exchange -> {
            record(exchange, proxyCalls);
            send(exchange, answer(503, Map.of("error", "SPE-2 is not connected to the hub")));
        });

        var response = signal(CONSUMER_CTX, "prepare", prepare("HttpData-PUSH", Map.of("speId", "SPE-2")));

        assertEquals("/spe/SPE-2/inbox", proxyCalls.get(0).path());
        // a stopped workspace may answer later, so the control plane is told to try again
        assertEquals(503, response.statusCode());
        assertTrue(response.body().contains("SPE-2 is not connected"));
    }

    @Test
    void aWorkspaceThatFailedAttestationEndsTheTransfer() throws Exception {
        inboxStatus = 409;

        var response = signal(CONSUMER_CTX, "prepare", prepare("HttpData-PUSH", Map.of()));

        assertEquals(409, response.statusCode());
        assertTrue(response.body().contains("attestation did not pass"));
    }

    @Test
    void startDeliversTheBundleAndReportsCompleted() throws Exception {
        var response = signal(PROVIDER_CTX, "start", start("HttpData-PUSH", "simulated"));

        assertEquals(200, response.statusCode());
        assertEquals("STARTED", json(response.body()).get("state"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        var read = call("/dataspace/push-source");
        var readToken = verified(read.headers().get("authorization"));
        assertEquals("dataset:read", readToken.getJWTClaimsSet().getStringClaim("scope"));
        assertEquals("asset-1", readToken.getJWTClaimsSet().getStringClaim("datasetId"));
        assertEquals(CONSUMER, readToken.getJWTClaimsSet().getSubject());
        assertEquals(List.of(PROVIDER), readToken.getJWTClaimsSet().getAudience());

        var push = call("/spe/SPE-1/inbox/flow-consumer/bundle");
        assertEquals("Bearer inbox-token", push.headers().get("authorization"));
        assertEquals(dataset, push.text());
        assertEquals(ProxyClient.sha256(push.body()), push.headers().get("x-content-sha256"));
        // the proxy counts a delivery against the provider, not against this process
        assertEquals(PROVIDER, push.headers().get("x-participant"));

        var completed = callbacks.stream().filter(c -> c.path().endsWith("/dataflow/completed")).findFirst().orElseThrow();
        assertEquals("/api/signaling/transfers/flow-provider/dataflow/completed", completed.path());
        // the control plane accepts a callback only from the data plane registered for that context
        var callback = verified(completed.headers().get("authorization"));
        assertEquals("mvhd-dp-" + PROVIDER_CTX, callback.getJWTClaimsSet().getSubject());
        assertNotNull(callback.getJWTClaimsSet().getJWTID());
    }

    @Test
    void nothingIsDeliveredBeforeTheConsumerHasStarted() throws Exception {
        consumerStarted = false;

        signal(PROVIDER_CTX, "start", start("HttpData-PUSH", "simulated"));
        await(() -> proxyCalls.stream().filter(c -> c.path().endsWith("/ready")).count() >= 2);

        // the consumer refuses a completion until it has started, and is not asked twice
        assertFalse(proxyCalls.stream().anyMatch(c -> c.path().equals("/dataspace/push-source")), "the dataset was read");
        assertTrue(callbacks.isEmpty());

        consumerStarted = true;
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));
        assertEquals(dataset, call("/spe/SPE-1/inbox/flow-consumer/bundle").text());
    }

    @Test
    void theConsumersSideTellsTheInboxThatTheTransferStarted() throws Exception {
        signal(CONSUMER_CTX, "prepare", prepare("HttpData-PUSH", Map.of()));

        var response = signal(CONSUMER_CTX, "flow-consumer/started", "{\"messageId\":\"m-3\"}");

        assertEquals(200, response.statusCode());
        var started = call("/spe/SPE-1/inbox/flow-consumer/started");
        var token = verified(started.headers().get("authorization"));
        assertEquals("inbox:open", token.getJWTClaimsSet().getStringClaim("scope"));
        assertEquals("flow-consumer", token.getJWTClaimsSet().getStringClaim("flowId"));
    }

    @Test
    void aStreamGoesInNumberedChunksWithTheHashOfAll() throws Exception {
        signal(PROVIDER_CTX, "start", start("HttpStream-PUSH", "simulated"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        var first = call("/spe/SPE-1/inbox/flow-consumer/chunks/0");
        var second = call("/spe/SPE-1/inbox/flow-consumer/chunks/1");
        assertEquals(2, first.text().lines().count());
        assertEquals(1, second.text().lines().count());
        assertTrue(first.text().lines().allMatch(line -> line.contains("\"resourceType\":\"Patient\"")));

        var all = new byte[first.body().length + second.body().length];
        System.arraycopy(first.body(), 0, all, 0, first.body().length);
        System.arraycopy(second.body(), 0, all, first.body().length, second.body().length);
        var complete = json(call("/spe/SPE-1/inbox/flow-consumer/complete").text());
        assertEquals(2, complete.get("chunks"));
        assertEquals(3, complete.get("records"));
        assertEquals(ProxyClient.sha256(all), complete.get("sha256"));
    }

    @Test
    void aDatasetThatIsAQueryIsReadWithAPost() throws Exception {
        proxy.removeContext("/");
        proxy.createContext("/", exchange -> {
            var call = record(exchange, proxyCalls);
            if (call.path().endsWith("/ready")) {
                send(exchange, answer(200, Map.of("consumerStarted", true)));
            } else if (call.path().equals("/dataspace/push-source") && call.method().equals("GET")) {
                send(exchange, answer(405, Map.of("error", "this dataset is read with POST")));
            } else if (call.path().equals("/dataspace/push-source")) {
                send(exchange, new Reply(200, dataset.getBytes(StandardCharsets.UTF_8)));
            } else {
                send(exchange, answer(200, Map.of("completed", true)));
            }
        });

        signal(PROVIDER_CTX, "start", start("HttpData-PUSH", "simulated"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        assertEquals(List.of("GET", "POST"), proxyCalls.stream()
                .filter(c -> c.path().equals("/dataspace/push-source")).map(Call::method).toList());
        assertEquals(dataset, call("/spe/SPE-1/inbox/flow-consumer/bundle").text());
    }

    @Test
    void aStreamFollowsTheDatasetsNextLinks() throws Exception {
        proxy.removeContext("/");
        proxy.createContext("/", exchange -> {
            var call = record(exchange, proxyCalls);
            var query = exchange.getRequestURI().getQuery();
            if (call.path().endsWith("/ready")) {
                send(exchange, answer(200, Map.of("consumerStarted", true)));
            } else if (call.path().equals("/dataspace/push-source") && query == null) {
                send(exchange, new Reply(200, page(1, 2, "/dataspace/push-source?offsetSeconds=60").getBytes(StandardCharsets.UTF_8)));
            } else if (call.path().equals("/dataspace/push-source")) {
                send(exchange, new Reply(200, page(3, 3, null).getBytes(StandardCharsets.UTF_8)));
            } else if (call.path().contains("/chunks/")) {
                send(exchange, answer(202, Map.of("records", 1)));
            } else {
                send(exchange, answer(200, Map.of("completed", true)));
            }
        });

        signal(PROVIDER_CTX, "start", start("HttpStream-PUSH", "simulated"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        assertEquals(2, proxyCalls.stream().filter(c -> c.path().equals("/dataspace/push-source")).count());
        assertEquals(3, json(call("/spe/SPE-1/inbox/flow-consumer/complete").text()).get("records"));
    }

    @Test
    void aLinkThatLeavesThePushSourceIsNotFollowed() throws Exception {
        proxy.removeContext("/");
        proxy.createContext("/", exchange -> {
            var call = record(exchange, proxyCalls);
            if (call.path().endsWith("/ready")) {
                send(exchange, answer(200, Map.of("consumerStarted", true)));
            } else if (call.path().equals("/dataspace/push-source")) {
                send(exchange, new Reply(200, page(1, 1, "/fhir/Patient").getBytes(StandardCharsets.UTF_8)));
            } else {
                send(exchange, answer(200, Map.of("completed", true)));
            }
        });

        signal(PROVIDER_CTX, "start", start("HttpStream-PUSH", "simulated"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/errored")));

        assertFalse(proxyCalls.stream().anyMatch(c -> c.path().equals("/fhir/Patient")));
    }

    @Test
    void aKafkaPushNamesATopicAndKeepsTheInboxTokenAtHome() throws Exception {
        var response = signal(CONSUMER_CTX, "prepare", prepare("Kafka-PUSH", Map.of()));

        assertEquals(200, response.statusCode());
        var address = (Map<?, ?>) json(response.body()).get("dataAddress");
        assertEquals("Kafka", address.get("endpointType"));
        assertEquals("memory:9092", address.get("endpoint"));
        var properties = address.get("endpointProperties").toString();
        assertTrue(properties.contains("mvhd.flow.flow-consumer"));
        assertTrue(properties.contains("attestationScope"));
        // the provider gets a topic to write to, never a way into the workspace
        assertFalse(properties.contains("inbox-token"));
        assertTrue(transport.topics.containsKey("mvhd.flow.flow-consumer"));
    }

    @Test
    void aKafkaPushIsWrittenByTheProviderAndReadIntoTheInboxByTheConsumer() throws Exception {
        signal(CONSUMER_CTX, "prepare", prepare("Kafka-PUSH", Map.of()));

        var started = signal(PROVIDER_CTX, "start", kafkaStart("simulated"));
        assertEquals(200, started.statusCode());
        await(() -> transport.ended("mvhd.flow.flow-consumer"));
        // written, and not yet reported: nobody has read it
        Thread.sleep(300);
        assertTrue(callbacks.isEmpty(), "completed before the consumer read the stream");

        signal(CONSUMER_CTX, "flow-consumer/started", "{\"messageId\":\"m-3\"}");
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        var first = call("/spe/SPE-1/inbox/flow-consumer/chunks/0");
        assertEquals("Bearer inbox-token", first.headers().get("authorization"));
        assertEquals(CONSUMER, first.headers().get("x-participant"));
        var complete = json(call("/spe/SPE-1/inbox/flow-consumer/complete").text());
        assertEquals(3, complete.get("records"));
        assertEquals("/api/signaling/transfers/flow-provider/dataflow/completed",
                callbacks.stream().filter(c -> c.path().endsWith("/completed")).findFirst().orElseThrow().path());
    }

    @Test
    void aKafkaPushBelowTheFloorIsRefused() throws Exception {
        var values = new HashMap<String, String>();
        values.put("DATAPLANE_PROXY_URL", url(proxy));
        values.put("DATAPLANE_CONTROL_PLANE_SIGNALING_URL", url(controlPlane) + "/api/signaling");
        values.put("DATAPLANE_ATTESTATION_FLOOR", "workload");
        values.put("DATAPLANE_SETTLE_MILLIS", "0");
        boot(values);

        var response = signal(PROVIDER_CTX, "start", kafkaStart("simulated"));

        assertEquals(409, response.statusCode());
        assertTrue(transport.topics.isEmpty(), "something was written to a topic");
    }

    @Test
    void aKafkaPullOffersATopicAndTheConsumerReadsItIntoItsInbox() throws Exception {
        signal(CONSUMER_CTX, "prepare", prepare("Kafka-PULL", Map.of()));

        var response = signal(PROVIDER_CTX, "start", pullStart());

        assertEquals(200, response.statusCode());
        var address = (Map<?, ?>) json(response.body()).get("dataAddress");
        assertEquals("Kafka", address.get("endpointType"));
        assertTrue(address.get("endpointProperties").toString().contains("mvhd.flow.flow-provider"));
        await(() -> transport.ended("mvhd.flow.flow-provider"));

        // the consumer's control plane hands its data plane the provider's address
        var startedMessage = mapper.writeValueAsString(Map.of("messageId", "m-4", "dataAddress", address));
        signal(CONSUMER_CTX, "flow-consumer/started", startedMessage);
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        assertEquals(3, json(call("/spe/SPE-1/inbox/flow-consumer/complete").text()).get("records"));
    }

    @Test
    void aRateLimitIsWaitedOutAndNotTakenForARefusal() throws Exception {
        var limited = new java.util.concurrent.atomic.AtomicInteger();
        proxy.removeContext("/");
        proxy.createContext("/", exchange -> {
            var call = record(exchange, proxyCalls);
            if (call.path().endsWith("/ready")) {
                send(exchange, answer(200, Map.of("consumerStarted", true)));
            } else if (call.path().equals("/dataspace/push-source") && limited.getAndIncrement() == 0) {
                exchange.getResponseHeaders().set("Retry-After", "1");
                send(exchange, answer(429, Map.of("error", "Query rate limit exceeded")));
            } else if (call.path().equals("/dataspace/push-source")) {
                send(exchange, new Reply(200, dataset.getBytes(StandardCharsets.UTF_8)));
            } else {
                send(exchange, answer(200, Map.of("completed", true)));
            }
        });

        signal(PROVIDER_CTX, "start", start("HttpData-PUSH", "simulated"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        assertEquals(2, limited.get());
        assertFalse(callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/errored")));
    }

    @Test
    void aReaderStopsWhenItsTransferIsTerminated() throws Exception {
        signal(CONSUMER_CTX, "prepare", prepare("Kafka-PUSH", Map.of()));
        signal(CONSUMER_CTX, "flow-consumer/started", "{\"messageId\":\"m-3\"}");

        // nothing is ever written to the topic; the control plane ends the transfer
        signal(CONSUMER_CTX, "flow-consumer/terminate", "{\"messageId\":\"m-5\",\"reason\":\"the provider failed\"}");
        await(() -> proxyCalls.stream().anyMatch(c -> c.path().endsWith("/refuse")));

        assertFalse(proxyCalls.stream().anyMatch(c -> c.path().endsWith("/complete")));
    }

    @Test
    void aStreamThatDoesNotMatchItsEndMarkIsRefused() throws Exception {
        signal(CONSUMER_CTX, "prepare", prepare("Kafka-PUSH", Map.of()));
        var topic = "mvhd.flow.flow-consumer";
        try (var writer = transport.writer("memory:9092", topic)) {
            writer.send("{\"resourceType\":\"Patient\",\"id\":\"p1\"}");
            writer.end(2, "0".repeat(64));
        }

        signal(CONSUMER_CTX, "flow-consumer/started", "{\"messageId\":\"m-3\"}");
        await(() -> proxyCalls.stream().anyMatch(c -> c.path().endsWith("/refuse")));

        assertFalse(proxyCalls.stream().anyMatch(c -> c.path().endsWith("/complete")));
        assertTrue(callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/errored")));
    }

    @Test
    void aFileGoesAsBytesWithItsName() throws Exception {
        dataset = "{\"cohort\":{\"patients\":127}}";

        signal(PROVIDER_CTX, "start", start("HttpFile-PUSH", "simulated"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));

        var file = call("/spe/SPE-1/inbox/flow-consumer/file");
        assertEquals("PUT", file.method());
        assertEquals(dataset, file.text());
        assertEquals("asset-1.json", file.headers().get("x-file-name"));
    }

    @Test
    void aWorkspaceBelowTheFloorGetsNothing() throws Exception {
        var values = new HashMap<String, String>();
        values.put("DATAPLANE_PROXY_URL", url(proxy));
        values.put("DATAPLANE_CONTROL_PLANE_SIGNALING_URL", url(controlPlane) + "/api/signaling");
        values.put("DATAPLANE_ATTESTATION_FLOOR", "workload");
        values.put("DATAPLANE_SETTLE_MILLIS", "0");
        boot(values);

        var response = signal(PROVIDER_CTX, "start", start("HttpData-PUSH", "node"));

        // a 4xx: the control plane ends the transfer and does not try again
        assertEquals(409, response.statusCode());
        assertTrue(response.body().contains("'node'"));
        assertTrue(response.body().contains("'workload'"));
        assertFalse(proxyCalls.stream().anyMatch(c -> c.path().equals("/dataspace/push-source")), "the dataset was read");
        assertFalse(proxyCalls.stream().anyMatch(c -> c.path().endsWith("/bundle")), "data was pushed");
        // and the receiving side is told, so the refusal is on its audit chain
        assertTrue(call("/spe/SPE-1/inbox/flow-consumer/refuse").text().contains("workload"));
    }

    @Test
    void aDeliveryTheProxyRefusesIsReportedAsErrored() throws Exception {
        dataset = "not json";
        proxy.removeContext("/");
        proxy.createContext("/", exchange -> {
            var call = record(exchange, proxyCalls);
            if (call.path().endsWith("/ready")) {
                send(exchange, answer(200, Map.of("consumerStarted", true)));
            } else if (call.path().equals("/dataspace/push-source")) {
                send(exchange, new Reply(200, dataset.getBytes(StandardCharsets.UTF_8)));
            } else if (call.path().endsWith("/bundle")) {
                send(exchange, answer(422, Map.of("error", "not a FHIR Bundle")));
            } else {
                send(exchange, answer(200, Map.of()));
            }
        });

        signal(PROVIDER_CTX, "start", start("HttpData-PUSH", "simulated"));
        await(() -> callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/errored")));

        var errored = callbacks.stream().filter(c -> c.path().endsWith("/dataflow/errored")).findFirst().orElseThrow();
        assertTrue(errored.text().contains("not a FHIR Bundle"));
        assertFalse(callbacks.stream().anyMatch(c -> c.path().endsWith("/dataflow/completed")));
    }

    @Test
    void aRequestWithoutTheControlPlanesTokenIsRefused() throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url(dataplane) + "/api/v1/" + CONSUMER_CTX + "/dataflows/prepare"))
                .header("Authorization", "Bearer someone-else")
                .POST(HttpRequest.BodyPublishers.ofString(prepare("HttpData-PUSH", Map.of())))
                .build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(401, response.statusCode());
        assertTrue(proxyCalls.isEmpty());
    }

    @Test
    void aFlowIsOnlySeenByTheContextThatOpenedIt() throws Exception {
        signal(CONSUMER_CTX, "prepare", prepare("HttpData-PUSH", Map.of()));

        assertEquals(200, get(CONSUMER_CTX, "flow-consumer/status").statusCode());
        assertEquals(404, get(PROVIDER_CTX, "flow-consumer/status").statusCode());
    }

    @Test
    void anUnknownTransferTypeIsRefused() throws Exception {
        var response = signal(CONSUMER_CTX, "prepare", prepare("Sftp-PUSH", Map.of()));

        assertEquals(409, response.statusCode());
        assertTrue(proxyCalls.isEmpty());
    }

    @Test
    void theJwksVerifiesWhatTheDataPlaneSigns() throws Exception {
        var response = http.send(HttpRequest.newBuilder(URI.create(url(dataplane) + "/.well-known/jwks.json")).build(),
                HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode());
        var key = JWKSet.parse(response.body()).getKeys().get(0).toRSAKey();
        assertFalse(key.isPrivate());
        assertTrue(SignedJWT.parse(keys.sign("someone", Map.of())).verify(new RSASSAVerifier(key)));
    }

    // --- helpers -----------------------------------------------------------

    private String prepare(String profile, Map<String, Object> metadata) {
        var message = new HashMap<String, Object>();
        message.put("messageId", "m-1");
        message.put("participantId", CONSUMER);
        message.put("counterPartyId", PROVIDER);
        message.put("dataspaceContext", "http-dsp-profile-2025-1");
        message.put("dataFlowId", "flow-consumer");
        message.put("agreementId", "agreement-1");
        message.put("datasetId", "asset-1");
        message.put("profile", profile);
        message.put("metadata", metadata);
        return mapper.writeValueAsString(message);
    }

    private String start(String profile, String scope) {
        var properties = new ArrayList<Map<String, String>>();
        properties.add(Map.of("type", "string", "name", "authorization", "value", "inbox-token"));
        properties.add(Map.of("type", "string", "name", "attestationScope", "value", scope));
        var message = new HashMap<String, Object>();
        message.put("messageId", "m-2");
        message.put("participantId", PROVIDER);
        message.put("counterPartyId", CONSUMER);
        message.put("dataFlowId", "flow-provider");
        message.put("agreementId", "agreement-1");
        message.put("datasetId", "asset-1");
        message.put("profile", profile);
        message.put("dataAddress", Map.of(
                "@type", "DataAddress",
                "endpointType", "https://w3id.org/idsa/v4.1/HTTP",
                "endpoint", url(proxy) + "/spe/SPE-1/inbox/flow-consumer",
                "endpointProperties", properties));
        return mapper.writeValueAsString(message);
    }

    private String kafkaStart(String scope) {
        var properties = new ArrayList<Map<String, String>>();
        properties.add(Map.of("type", "string", "name", "topic", "value", "mvhd.flow.flow-consumer"));
        properties.add(Map.of("type", "string", "name", "groupId", "value", "mvhd-flow-flow-consumer"));
        properties.add(Map.of("type", "string", "name", "attestationScope", "value", scope));
        var message = startMessage("Kafka-PUSH");
        message.put("dataAddress", Map.of("@type", "DataAddress", "endpointType", "Kafka",
                "endpoint", "memory:9092", "endpointProperties", properties));
        return mapper.writeValueAsString(message);
    }

    private String pullStart() {
        return mapper.writeValueAsString(startMessage("Kafka-PULL"));
    }

    private HashMap<String, Object> startMessage(String profile) {
        var message = new HashMap<String, Object>();
        message.put("messageId", "m-2");
        message.put("participantId", PROVIDER);
        message.put("counterPartyId", CONSUMER);
        message.put("dataFlowId", "flow-provider");
        message.put("agreementId", "agreement-1");
        message.put("datasetId", "asset-1");
        message.put("profile", profile);
        return message;
    }

    /** One window of a paged dataset: patients from..to, and where the next window is. */
    private static String page(int from, int to, String next) {
        var entries = new StringBuilder();
        for (var i = from; i <= to; i++) {
            entries.append(i > from ? "," : "")
                    .append("{\"resource\":{\"resourceType\":\"Patient\",\"id\":\"p").append(i).append("\"}}");
        }
        var link = next == null ? "" : ",\"link\":[{\"relation\":\"next\",\"url\":\"" + next + "\"}]";
        return "{\"resourceType\":\"Bundle\",\"type\":\"searchset\"" + link + ",\"entry\":[" + entries + "]}";
    }

    /** Kafka's part, played by lists: a topic is its records, a group is how far it has read. */
    static final class MemoryTransport implements StreamTransport {
        final Map<String, List<String[]>> topics = new java.util.concurrent.ConcurrentHashMap<>();
        final Map<String, Integer> committed = new java.util.concurrent.ConcurrentHashMap<>();

        boolean ended(String topic) {
            var records = topics.get(topic);
            return records != null && records.stream().anyMatch(r -> "end".equals(r[0]));
        }

        @Override
        public String bootstrap() {
            return "memory:9092";
        }

        @Override
        public void createTopic(String bootstrap, String topic) {
            topics.computeIfAbsent(topic, t -> new CopyOnWriteArrayList<>());
        }

        @Override
        public Writer writer(String bootstrap, String topic) {
            createTopic(bootstrap, topic);
            return new Writer() {
                @Override
                public void send(String record) {
                    topics.get(topic).add(new String[]{"record", record});
                }

                @Override
                public void end(int records, String sha256) {
                    topics.get(topic).add(new String[]{"end", records + " " + sha256});
                }

                @Override
                public void close() {
                }
            };
        }

        @Override
        public End read(String bootstrap, String topic, String group, Sink sink,
                        java.util.function.BooleanSupplier stopped) throws Exception {
            var at = 0;
            while (true) {
                if (stopped.getAsBoolean()) {
                    throw new IllegalStateException("the transfer was ended while its stream was being read");
                }
                var records = topics.get(topic);
                if (records == null || at >= records.size()) {
                    Thread.sleep(20);
                    continue;
                }
                var record = records.get(at++);
                if ("end".equals(record[0])) {
                    committed.put(topic + "/" + group, at);
                    var parts = record[1].split(" ");
                    return new End(Integer.parseInt(parts[0]), parts[1]);
                }
                sink.accept(List.of(record[1]));
                committed.put(topic + "/" + group, at);
            }
        }

        @Override
        public boolean consumed(String bootstrap, String topic, String group) {
            var records = topics.get(topic);
            return records != null && committed.getOrDefault(topic + "/" + group, 0) >= records.size();
        }
    }

    private static String bundle(int patients) {
        var entries = new StringBuilder();
        for (var i = 1; i <= patients; i++) {
            entries.append(i > 1 ? "," : "")
                    .append("{\"resource\":{\"resourceType\":\"Patient\",\"id\":\"p").append(i).append("\"}}");
        }
        return "{\"resourceType\":\"Bundle\",\"type\":\"searchset\",\"entry\":[" + entries + "]}";
    }

    private HttpResponse<String> signal(String context, String action, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url(dataplane) + "/api/v1/" + context + "/dataflows/" + action))
                .header("Authorization", GOOD)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> get(String context, String path) throws Exception {
        var request = HttpRequest.newBuilder(URI.create(url(dataplane) + "/api/v1/" + context + "/dataflows/" + path))
                .header("Authorization", GOOD)
                .build();
        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private Call call(String path) {
        return proxyCalls.stream().filter(c -> c.path().equals(path)).findFirst()
                .orElseThrow(() -> new AssertionError("the proxy was not called at " + path + "; calls: "
                        + proxyCalls.stream().map(Call::path).toList()));
    }

    private SignedJWT verified(String authorization) throws Exception {
        var jwt = SignedJWT.parse(authorization.substring("Bearer ".length()));
        var key = JWKSet.parse(keys.jwks()).getKeys().get(0).toRSAKey();
        assertTrue(jwt.verify(new RSASSAVerifier(key)), "the token does not verify against the JWKS");
        return jwt;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> json(String text) {
        return mapper.readValue(text, Map.class);
    }

    private static void await(java.util.function.BooleanSupplier condition) throws InterruptedException {
        for (var i = 0; i < 100; i++) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(100);
        }
        throw new AssertionError("timed out");
    }

    record Reply(int status, byte[] body) {
    }

    interface Responder {
        Reply reply(HttpExchange exchange) throws IOException;
    }

    private Reply answer(int status, Map<String, Object> body) {
        return new Reply(status, mapper.writeValueAsBytes(body));
    }

    private static Call record(HttpExchange exchange, List<Call> into) throws IOException {
        var headers = new HashMap<String, String>();
        exchange.getRequestHeaders().forEach((name, values) -> headers.put(name.toLowerCase(), values.get(0)));
        var call = new Call(exchange.getRequestMethod(), exchange.getRequestURI().getPath(), headers,
                exchange.getRequestBody().readAllBytes());
        into.add(call);
        return call;
    }

    private static void send(HttpExchange exchange, Reply reply) throws IOException {
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(reply.status(), reply.body().length);
        try (var out = exchange.getResponseBody()) {
            out.write(reply.body());
        }
    }

    private static HttpServer serve(Responder responder) throws IOException {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> send(exchange, responder.reply(exchange)));
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.start();
        return server;
    }

    private static String url(HttpServer server) {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }
}
