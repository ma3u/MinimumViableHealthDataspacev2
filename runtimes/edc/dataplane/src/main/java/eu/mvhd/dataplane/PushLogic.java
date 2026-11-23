package eu.mvhd.dataplane;

import eu.mvhd.dataplane.ProxyClient.Inbox;
import eu.mvhd.dataplane.ProxyClient.ProxyRefusal;
import org.eclipse.dataplane.Dataplane;
import org.eclipse.dataplane.domain.DataAddress;
import org.eclipse.dataplane.domain.DataAddress.EndpointProperty;
import org.eclipse.dataplane.domain.Result;
import org.eclipse.dataplane.domain.dataflow.DataFlow;
import tools.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * What the data plane does for a transfer into an SPE workspace (ADR-095).
 *
 * <p>Every transfer type ends in an inbox the consumer's side opens on
 * {@code prepare}; the workspace must have passed attestation for that. What
 * differs is the way there:
 *
 * <ul>
 *   <li>{@code HttpData-PUSH}, {@code HttpStream-PUSH}, {@code HttpFile-PUSH}:
 *       the provider's side posts into the inbox itself.</li>
 *   <li>{@code Kafka-PUSH}: the provider's side writes to a topic the consumer
 *       named; the consumer's side reads it into the inbox.</li>
 *   <li>{@code Kafka-PULL}: the provider's side offers a topic; the consumer's
 *       side reads it into the inbox.</li>
 * </ul>
 *
 * <p>On a push the provider sees the workspace's attestation in the address
 * and refuses one below its floor. On {@code Kafka-PULL} it sees no address
 * from the consumer, so only the inbox's own rule applies there.
 */
public final class PushLogic {

    public static final String BUNDLE = "HttpData-PUSH";
    public static final String STREAM = "HttpStream-PUSH";
    public static final String FILE = "HttpFile-PUSH";
    public static final String KAFKA_PUSH = "Kafka-PUSH";
    public static final String KAFKA_PULL = "Kafka-PULL";
    private static final Set<String> HTTP = Set.of(BUNDLE, STREAM, FILE);
    private static final Set<String> KAFKA = Set.of(KAFKA_PUSH, KAFKA_PULL);

    /** DSP's name for an HTTP endpoint, as siglet's data addresses carry it. */
    static final String HTTP_ENDPOINT = "https://w3id.org/idsa/v4.1/HTTP";
    static final String KAFKA_ENDPOINT = "Kafka";
    static final String DEFAULT_SPE = "SPE-1";
    static final String P_TOKEN = "authorization";
    static final String P_SCOPE = "attestationScope";
    static final String P_EVIDENCE = "attestationEvidenceDigest";
    static final String P_POLICY = "attestationPolicyId";
    static final String P_TOPIC = "topic";
    static final String P_GROUP = "groupId";
    private static final String STRING = "string";

    private final ProxyClient proxy;
    private final StreamTransport transport;
    private final AttestationScope floor;
    private final int chunkRecords;
    private final int startWaitSeconds;
    private final int settleMillis;
    private final ObjectMapper mapper;
    private final ExecutorService executor;
    private final Consumer<String> log;
    /**
     * The inboxes of the Kafka flows this process prepared, until their
     * streams end. In memory: a restart in the middle of a stream loses the
     * inbox's token, the stream stops, and the transfer has to be asked for
     * again.
     */
    private final Map<String, Inbox> streamInboxes = new ConcurrentHashMap<>();
    private volatile Dataplane dataplane;

    public PushLogic(ProxyClient proxy, StreamTransport transport, AttestationScope floor, int chunkRecords,
                     int startWaitSeconds, int settleMillis, ObjectMapper mapper, ExecutorService executor,
                     Consumer<String> log) {
        this.proxy = proxy;
        this.transport = transport;
        this.floor = floor;
        this.chunkRecords = Math.max(1, chunkRecords);
        this.startWaitSeconds = startWaitSeconds;
        this.settleMillis = settleMillis;
        this.mapper = mapper;
        this.executor = executor;
        this.log = log;
    }

    /** The transfer types this process can serve: the Kafka ones only with a broker. */
    public Set<String> profiles() {
        var all = new java.util.TreeSet<>(HTTP);
        if (transport != null) {
            all.addAll(KAFKA);
        }
        return all;
    }

    /** The data plane is built with this logic, so it is handed over afterwards. */
    public void attach(Dataplane dataplane) {
        this.dataplane = dataplane;
    }

    /** This side will not go on; the control plane ends the transfer with this reason. */
    public static final class DeliveryRefused extends Exception {
        public DeliveryRefused(String message) {
            super(message);
        }
    }

    private Result<DataFlow> unknown(DataFlow flow) {
        return Result.failure(new DeliveryRefused("this data plane has no transfer type " + flow.getProfile()));
    }

    private static String speOf(DataFlow flow) {
        var speId = flow.getMetadata() == null ? null : flow.getMetadata().get("speId");
        return speId == null ? DEFAULT_SPE : speId.toString();
    }

    private static String topicOf(String flowId) {
        return "mvhd.flow." + flowId;
    }

    private static String groupOf(String flowId) {
        return "mvhd-flow-" + flowId;
    }

    // --- consumer side -----------------------------------------------------

    public Result<DataFlow> onPrepare(DataFlow flow) {
        var profile = flow.getProfile();
        if (!profiles().contains(profile)) {
            return unknown(flow);
        }
        try {
            var inbox = proxy.openInbox(
                    speOf(flow),
                    flow.getId(), flow.getAgreementId(), flow.getDatasetId(), profile,
                    flow.getParticipantId(), flow.getCounterPartyId());
            if (HTTP.contains(profile)) {
                flow.setDataAddress(toHttpAddress(inbox));
                return Result.success(flow);
            }
            // The token stays here: on a Kafka transfer this side writes into
            // the inbox, so the provider never holds a way into the workspace.
            streamInboxes.put(flow.getId(), inbox);
            if (KAFKA_PUSH.equals(profile)) {
                var topic = topicOf(flow.getId());
                transport.createTopic(transport.bootstrap(), topic);
                flow.setDataAddress(toKafkaAddress(transport.bootstrap(), topic, groupOf(flow.getId()), inbox));
            }
            return Result.success(flow);
        } catch (Exception e) {
            return Result.failure(e);
        }
    }

    /**
     * The consumer's control plane has taken the provider's start message.
     * Until it has, it refuses a completion ("transfer cannot be completed"),
     * and it does not ask for it again. So the inbox is told, and the provider
     * waits for that before it delivers. On a Kafka transfer this is also when
     * this side starts reading the topic.
     */
    public Result<DataFlow> onStarted(DataFlow flow) {
        var profile = flow.getProfile();
        if (flow.getType() != DataFlow.Type.CONSUMER || !profiles().contains(profile)) {
            return Result.success(flow);
        }
        try {
            proxy.consumerStarted(speOf(flow), flow.getId(), flow.getParticipantId());
            if (KAFKA.contains(profile)) {
                var inbox = streamInboxes.get(flow.getId());
                if (inbox == null && KAFKA_PULL.equals(profile)) {
                    // a control plane that does not prepare a pull: the inbox is opened now
                    inbox = proxy.openInbox(speOf(flow), flow.getId(), flow.getAgreementId(), flow.getDatasetId(),
                            profile, flow.getParticipantId(), flow.getCounterPartyId());
                }
                if (inbox == null) {
                    return Result.failure(new DeliveryRefused("this data plane no longer holds the flow's inbox; ask for the transfer again"));
                }
                var target = inbox;
                String bootstrap = transport.bootstrap();
                String topic = topicOf(flow.getId());
                String group = groupOf(flow.getId());
                if (KAFKA_PULL.equals(profile)) {
                    // the provider's topic, from its start message
                    var source = kafkaSource(flow.getDataAddress());
                    bootstrap = source.bootstrap();
                    topic = source.topic();
                    group = source.group();
                }
                var flowId = flow.getId();
                var consumer = flow.getParticipantId();
                var from = new KafkaSource(bootstrap, topic, group, null);
                executor.submit(() -> forward(flowId, consumer, from, target));
            }
            return Result.success(flow);
        } catch (DeliveryRefused | ProxyRefusal | IOException e) {
            return Result.failure(e);
        }
    }

    /** Reads the stream into the inbox, chunk by chunk, and closes it when the sender's end mark agrees. */
    void forward(String flowId, String consumer, KafkaSource from, Inbox inbox) {
        var total = ProxyClient.digest();
        var chunks = new int[]{0};
        var records = new int[]{0};
        try {
            var end = transport.read(from.bootstrap(), from.topic(), from.group(), batch -> {
                for (var at = 0; at < batch.size(); at += chunkRecords) {
                    var body = ndjson(batch.subList(at, Math.min(batch.size(), at + chunkRecords)));
                    proxy.pushChunk(inbox, consumer, chunks[0], body);
                    total.update(body);
                    chunks[0]++;
                }
                records[0] += batch.size();
            }, () -> ended(flowId));
            var sha256 = HexFormat.of().formatHex(total.digest());
            if (end.records() != records[0] || !end.sha256().equals(sha256)) {
                throw new DeliveryRefused("the stream does not match its end mark: %d records sent, %d read"
                        .formatted(end.records(), records[0]));
            }
            proxy.completeStream(inbox, consumer, chunks[0], records[0], sha256);
            log.accept("flow %s: %d records read from %s into the inbox".formatted(flowId, records[0], from.topic()));
        } catch (Exception e) {
            log.accept("flow %s: reading the stream failed: %s".formatted(flowId, e.getMessage()));
            try {
                proxy.refuse(inbox, consumer, "the stream failed: " + e.getMessage());
            } catch (ProxyRefusal | IOException ignored) {
                // the inbox may be closed already, or the proxy is the failure
            }
            report(flowId, "errored", () -> dataplane.notifyErrored(flowId, e));
        } finally {
            streamInboxes.remove(flowId);
        }
    }

    /** Whether the control plane has ended the flow; one that is not saved yet has not ended. */
    private boolean ended(String flowId) {
        var flow = dataplane.getById(flowId);
        return flow.succeeded() && (flow.getContent().getState() == DataFlow.State.TERMINATED
                || flow.getContent().getState() == DataFlow.State.COMPLETED);
    }

    // --- addresses ---------------------------------------------------------

    private static void attestation(List<EndpointProperty> properties, Inbox inbox) {
        properties.add(new EndpointProperty(STRING, P_SCOPE, inbox.scope().wire()));
        if (inbox.evidenceDigest() != null) {
            properties.add(new EndpointProperty(STRING, P_EVIDENCE, inbox.evidenceDigest()));
        }
        if (inbox.policyId() != null) {
            properties.add(new EndpointProperty(STRING, P_POLICY, inbox.policyId()));
        }
    }

    static DataAddress toHttpAddress(Inbox inbox) {
        var properties = new ArrayList<EndpointProperty>();
        properties.add(new EndpointProperty(STRING, P_TOKEN, inbox.token()));
        attestation(properties, inbox);
        return new DataAddress(HTTP_ENDPOINT, inbox.endpoint(), properties);
    }

    /** Where to write or read a stream. With an inbox, what its workspace proved; never its token. */
    static DataAddress toKafkaAddress(String bootstrap, String topic, String group, Inbox inbox) {
        var properties = new ArrayList<EndpointProperty>();
        properties.add(new EndpointProperty(STRING, P_TOPIC, topic));
        properties.add(new EndpointProperty(STRING, P_GROUP, group));
        if (inbox != null) {
            attestation(properties, inbox);
        }
        return new DataAddress(KAFKA_ENDPOINT, bootstrap, properties);
    }

    private static Map<String, String> properties(DataAddress address) throws DeliveryRefused {
        if (address == null || address.endpoint() == null || address.endpointProperties() == null) {
            throw new DeliveryRefused("the transfer names no address");
        }
        var values = new HashMap<String, String>();
        for (var property : address.endpointProperties()) {
            if (property.name() != null && property.value() != null) {
                values.put(property.name(), property.value());
            }
        }
        return values;
    }

    private static AttestationScope scope(Map<String, String> values) throws DeliveryRefused {
        var scope = values.get(P_SCOPE);
        if (scope == null) {
            throw new DeliveryRefused("the address carries no attestation");
        }
        try {
            return AttestationScope.parse(scope);
        } catch (IllegalArgumentException e) {
            throw new DeliveryRefused("the address names an attestation this data plane does not know: " + scope);
        }
    }

    static Inbox fromAddress(DataAddress address) throws DeliveryRefused {
        var values = properties(address);
        if (values.get(P_TOKEN) == null) {
            throw new DeliveryRefused("the address carries no inbox token");
        }
        return new Inbox(address.endpoint(), values.get(P_TOKEN), scope(values), values.get(P_EVIDENCE), values.get(P_POLICY));
    }

    /** A topic to write to or read from; the scope only on an address the consumer made. */
    record KafkaSource(String bootstrap, String topic, String group, AttestationScope scope) {
    }

    static KafkaSource kafkaSource(DataAddress address) throws DeliveryRefused {
        var values = properties(address);
        if (values.get(P_TOPIC) == null || values.get(P_GROUP) == null) {
            throw new DeliveryRefused("the address names no topic or no group");
        }
        return new KafkaSource(address.endpoint(), values.get(P_TOPIC), values.get(P_GROUP),
                values.containsKey(P_SCOPE) ? scope(values) : null);
    }

    // --- provider side -----------------------------------------------------

    public Result<DataFlow> onStart(DataFlow flow) {
        var profile = flow.getProfile();
        if (!profiles().contains(profile)) {
            return unknown(flow);
        }
        var flowId = flow.getId();
        var datasetId = flow.getDatasetId();
        // on the provider's side the participant is the provider
        var provider = flow.getParticipantId();
        var consumer = flow.getCounterPartyId();
        try {
            if (KAFKA_PULL.equals(profile)) {
                var topic = topicOf(flowId);
                transport.createTopic(transport.bootstrap(), topic);
                var offer = new KafkaSource(transport.bootstrap(), topic, groupOf(flowId), null);
                flow.setDataAddress(toKafkaAddress(offer.bootstrap(), offer.topic(), offer.group(), null));
                executor.submit(() -> produce(flowId, datasetId, consumer, provider, offer));
                return Result.success(flow);
            }
            if (KAFKA_PUSH.equals(profile)) {
                var target = kafkaSource(flow.getDataAddress());
                if (target.scope() == null) {
                    throw new DeliveryRefused("the address carries no attestation");
                }
                refuseBelowFloor(target.scope());
                executor.submit(() -> produce(flowId, datasetId, consumer, provider, target));
                return Result.success(flow);
            }
            var inbox = fromAddress(flow.getDataAddress());
            try {
                refuseBelowFloor(inbox.scope());
            } catch (DeliveryRefused refused) {
                try {
                    // so the refusal is on the receiving side's audit chain too
                    proxy.refuse(inbox, provider, refused.getMessage());
                } catch (ProxyRefusal | IOException e) {
                    log.accept("flow %s: the refusal could not be recorded at the inbox: %s".formatted(flowId, e.getMessage()));
                }
                throw refused;
            }
            executor.submit(() -> deliver(flowId, profile, datasetId, consumer, provider, inbox));
            return Result.success(flow);
        } catch (Exception e) {
            return Result.failure(e);
        }
    }

    private void refuseBelowFloor(AttestationScope scope) throws DeliveryRefused {
        if (!scope.atLeast(floor)) {
            throw new DeliveryRefused("the workspace's attestation is '%s', and this holder delivers from '%s' up"
                    .formatted(scope.wire(), floor.wire()));
        }
    }

    /** Runs after {@code start} has answered: the transfer is STARTED while this works. */
    void deliver(String flowId, String profile, String datasetId, String consumer, String provider, Inbox inbox) {
        try {
            awaitConsumer(inbox, provider);
            switch (profile) {
                case BUNDLE -> proxy.pushBundle(inbox, provider, proxy.readDataset(flowId, datasetId, consumer, provider));
                case STREAM -> stream(flowId, datasetId, consumer, provider, inbox);
                default -> proxy.pushFile(inbox, provider, proxy.readDataset(flowId, datasetId, consumer, provider),
                        "application/json", datasetId + ".json");
            }
            report(flowId, "completed", () -> dataplane.notifyCompleted(flowId));
        } catch (Exception e) {
            log.accept("flow %s: delivery failed: %s".formatted(flowId, e.getMessage()));
            try {
                proxy.refuse(inbox, provider, "delivery failed: " + e.getMessage());
            } catch (ProxyRefusal | IOException ignored) {
                // the inbox may be closed already, or the proxy is the failure
            }
            report(flowId, "errored", () -> dataplane.notifyErrored(flowId, e));
        }
    }

    private void awaitConsumer(Inbox inbox, String provider) throws Exception {
        for (var waited = 0; waited < startWaitSeconds * 2; waited++) {
            if (proxy.consumerReady(inbox, provider)) {
                // the consumer's control plane saves its new state after its data plane answered
                Thread.sleep(settleMillis);
                return;
            }
            Thread.sleep(500);
        }
        throw new DeliveryRefused("the consumer did not report the transfer started within %d s".formatted(startWaitSeconds));
    }

    /** Every resource of the dataset, page after page, as one JSON text each. */
    private void eachResource(String flowId, String datasetId, String consumer, String provider,
                              ResourceSink sink) throws Exception {
        String next = null;
        do {
            awaitRunning(flowId);
            var bundle = bundle(proxy.readPage(next, flowId, datasetId, consumer, provider));
            for (var line : resources(bundle)) {
                sink.accept(line);
            }
            next = proxy.nextLink(bundle);
        } while (next != null);
    }

    interface ResourceSink {
        void accept(String resource) throws Exception;
    }

    /**
     * The dataset as NDJSON into the inbox, a chunk at a time. Between pages
     * the flow's state is read: a suspended flow waits, a terminated one stops.
     */
    private void stream(String flowId, String datasetId, String consumer, String provider, Inbox inbox) throws Exception {
        var total = ProxyClient.digest();
        var pending = new ArrayList<String>();
        var chunks = new int[]{0};
        var records = new int[]{0};
        eachResource(flowId, datasetId, consumer, provider, line -> {
            pending.add(line);
            records[0]++;
            if (pending.size() >= chunkRecords) {
                flush(inbox, provider, pending, chunks, total);
            }
        });
        if (!pending.isEmpty()) {
            flush(inbox, provider, pending, chunks, total);
        }
        proxy.completeStream(inbox, provider, chunks[0], records[0], HexFormat.of().formatHex(total.digest()));
    }

    private void flush(Inbox inbox, String provider, List<String> pending, int[] chunks, MessageDigest total)
            throws ProxyRefusal, IOException {
        var body = ndjson(pending);
        proxy.pushChunk(inbox, provider, chunks[0], body);
        total.update(body);
        chunks[0]++;
        pending.clear();
    }

    /**
     * The dataset onto the topic, then the end mark. The transfer is reported
     * completed only when the consumer's side has read all of it: that is the
     * one sign this side gets that the consumer has started, and a completion
     * before that is refused for good.
     */
    void produce(String flowId, String datasetId, String consumer, String provider, KafkaSource to) {
        try {
            var total = ProxyClient.digest();
            var records = new int[]{0};
            try (var writer = transport.writer(to.bootstrap(), to.topic())) {
                eachResource(flowId, datasetId, consumer, provider, line -> {
                    writer.send(line);
                    total.update(line.getBytes(StandardCharsets.UTF_8));
                    total.update((byte) '\n');
                    records[0]++;
                });
                writer.end(records[0], HexFormat.of().formatHex(total.digest()));
            }
            log.accept("flow %s: %d records written to %s".formatted(flowId, records[0], to.topic()));
            // generous: the reader writes every chunk into the workspace before it counts as read
            for (var waited = 0; !transport.consumed(to.bootstrap(), to.topic(), to.group()); waited++) {
                if (waited > startWaitSeconds * 20) {
                    throw new DeliveryRefused("the consumer did not read the stream to its end");
                }
                Thread.sleep(500);
            }
            Thread.sleep(settleMillis);
            report(flowId, "completed", () -> dataplane.notifyCompleted(flowId));
        } catch (Exception e) {
            log.accept("flow %s: writing the stream failed: %s".formatted(flowId, e.getMessage()));
            report(flowId, "errored", () -> dataplane.notifyErrored(flowId, e));
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> bundle(byte[] dataset) throws DeliveryRefused {
        Map<String, Object> bundle;
        try {
            bundle = mapper.readValue(dataset, Map.class);
        } catch (RuntimeException e) {
            throw new DeliveryRefused("the dataset is not JSON; use " + FILE);
        }
        if (!"Bundle".equals(bundle.get("resourceType")) || !(bundle.get("entry") instanceof List<?>)) {
            throw new DeliveryRefused("the dataset is not a FHIR bundle; use " + FILE);
        }
        return bundle;
    }

    /** One JSON text per resource of a FHIR bundle. */
    private List<String> resources(Map<String, Object> bundle) {
        var lines = new ArrayList<String>();
        for (var entry : (List<?>) bundle.get("entry")) {
            if (entry instanceof Map<?, ?> e && e.get("resource") instanceof Map<?, ?> resource) {
                lines.add(mapper.writeValueAsString(resource));
            }
        }
        return lines;
    }

    private static byte[] ndjson(List<String> lines) {
        var chunk = new ByteArrayOutputStream();
        for (var line : lines) {
            chunk.writeBytes(line.getBytes(StandardCharsets.UTF_8));
            chunk.write('\n');
        }
        return chunk.toByteArray();
    }

    private void awaitRunning(String flowId) throws Exception {
        // at most ten minutes suspended: the inbox does not live longer
        for (var waited = 0; waited < 600; waited++) {
            var flow = dataplane.getById(flowId);
            if (flow.failed()) {
                // this runs beside the answer to start, and the flow is saved after that answer
                Thread.sleep(200);
                continue;
            }
            var state = flow.getContent().getState();
            if (state == DataFlow.State.TERMINATED || state == DataFlow.State.COMPLETED) {
                throw new DeliveryRefused("the flow was ended while it was being delivered");
            }
            if (state != DataFlow.State.SUSPENDED) {
                return;
            }
            Thread.sleep(1000);
        }
        throw new DeliveryRefused("the flow stayed suspended");
    }

    /**
     * Tells the control plane. It may still be writing the answer to
     * {@code start} when a small dataset is already delivered, so this tries
     * again for a short while.
     */
    private void report(String flowId, String what, Supplier<Result<Void>> notification) {
        Exception last = null;
        for (var attempt = 0; attempt < 10; attempt++) {
            var result = notification.get();
            if (result.succeeded()) {
                log.accept("flow %s: %s".formatted(flowId, what));
                return;
            }
            last = result.getException();
            try {
                Thread.sleep(500L * (attempt + 1));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
        }
        log.accept("flow %s: the control plane did not take '%s': %s"
                .formatted(flowId, what, last == null ? "unknown" : last.getMessage()));
    }
}
