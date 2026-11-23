package eu.mvhd.dataplane;

import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The data plane's calls to the Neo4j proxy: open an SPE inbox, read a
 * dataset, deliver into an inbox. The proxy is the only component that
 * writes into a workspace and the only one that reads the graph, so the data
 * plane holds no database credentials for either.
 */
public class ProxyClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(60);
    static final String HASH_HEADER = "X-Content-Sha256";

    private final URI proxyUrl;
    private final SigningKeys keys;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public ProxyClient(URI proxyUrl, SigningKeys keys, ObjectMapper mapper) {
        this.proxyUrl = proxyUrl;
        this.keys = keys;
        this.mapper = mapper;
    }

    /** An inbox the consumer's side opened, and what its workspace proved. */
    public record Inbox(String endpoint, String token, AttestationScope scope, String evidenceDigest, String policyId) {
    }

    /**
     * Whose rate limit a call counts against at the proxy. Without it every
     * call counts against the data plane's address, and a stream of chunks
     * for one participant would use up everyone's budget.
     */
    static final String PARTICIPANT_HEADER = "X-Participant";

    /** The proxy answered, and not with success. */
    public static final class ProxyRefusal extends Exception {
        private final int status;

        public ProxyRefusal(int status, String message) {
            super(message);
            this.status = status;
        }

        public int status() {
            return status;
        }
    }

    public Inbox openInbox(String speId, String flowId, String agreementId, String datasetId, String profile,
                           String consumer, String provider) throws ProxyRefusal, IOException {
        var body = new LinkedHashMap<String, Object>();
        body.put("flowId", flowId);
        body.put("agreementId", agreementId);
        body.put("datasetId", datasetId);
        body.put("profile", profile);
        body.put("consumer", consumer);
        body.put("provider", provider);
        var token = keys.sign(consumer, Map.of("scope", "inbox:open", "flowId", flowId));
        var request = HttpRequest.newBuilder(proxyUrl.resolve("/spe/" + encode(speId) + "/inbox"))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .header(PARTICIPANT_HEADER, consumer)
                .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                .build();
        var answer = json(send(request, 201));
        var attestation = map(answer.get("attestation"));
        return new Inbox(
                text(answer.get("endpoint")),
                text(answer.get("token")),
                AttestationScope.parse(text(attestation.get("scope"))),
                text(attestation.get("evidenceDigest")),
                text(attestation.get("policyId")));
    }

    /** Consumer side: the control plane says the transfer has started. */
    public void consumerStarted(String speId, String flowId, String consumer) throws ProxyRefusal, IOException {
        var token = keys.sign(consumer, Map.of("scope", "inbox:open", "flowId", flowId));
        var request = HttpRequest.newBuilder(proxyUrl.resolve("/spe/" + encode(speId) + "/inbox/" + encode(flowId) + "/started"))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + token)
                .header("Content-Type", "application/json")
                .header(PARTICIPANT_HEADER, consumer)
                .POST(HttpRequest.BodyPublishers.ofString("{}"))
                .build();
        send(request, 200);
    }

    /** Provider side: has the consumer reported the transfer started? */
    public boolean consumerReady(Inbox inbox, String provider) throws ProxyRefusal, IOException {
        var request = HttpRequest.newBuilder(URI.create(inbox.endpoint() + "/ready"))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + inbox.token())
                .header(PARTICIPANT_HEADER, provider)
                .GET()
                .build();
        return Boolean.TRUE.equals(json(send(request, 200)).get("consumerStarted"));
    }

    static final String SOURCE_PATH = "/dataspace/push-source";

    /** The dataset as the proxy serves it for this agreement's parties: its first page. */
    public byte[] readDataset(String flowId, String datasetId, String consumer, String provider)
            throws ProxyRefusal, IOException {
        return readPage(null, flowId, datasetId, consumer, provider);
    }

    /**
     * One page of the dataset: the first, or the one a page's {@code next}
     * link names. A long recording comes window by window, so it is never
     * whole in memory here or at the proxy.
     */
    public byte[] readPage(String next, String flowId, String datasetId, String consumer, String provider)
            throws ProxyRefusal, IOException {
        var claims = new HashMap<String, Object>();
        claims.put("scope", "dataset:read");
        claims.put("flowId", flowId);
        claims.put("datasetId", datasetId);
        claims.put("aud", provider);
        var uri = proxyUrl.resolve(next == null ? SOURCE_PATH : next);
        // a link is followed only to where the token is valid, never to another host or route
        if (!proxyUrl.getAuthority().equals(uri.getAuthority()) || !uri.getPath().startsWith(SOURCE_PATH)) {
            throw new ProxyRefusal(502, "the dataset's next page points outside the proxy's push source");
        }
        try {
            return send(source(uri, consumer, provider, claims).GET().build(), 200);
        } catch (ProxyRefusal refusal) {
            if (refusal.status() != 405) {
                throw refusal;
            }
            // some datasets are a query the proxy takes as a POST (a cohort
            // bundle, the OMOP statistics); the transfer names no parameters,
            // so the query is the dataset's default
            return send(source(uri, consumer, provider, claims)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString("{}"))
                    .build(), 200);
        }
    }

    /** A FHIR bundle's {@code next} link, or null when this was the last page. */
    public String nextLink(Map<String, Object> bundle) {
        if (bundle.get("link") instanceof java.util.List<?> links) {
            for (var link : links) {
                if (link instanceof Map<?, ?> l && "next".equals(l.get("relation")) && l.get("url") != null) {
                    return l.get("url").toString();
                }
            }
        }
        return null;
    }

    private HttpRequest.Builder source(URI uri, String consumer, String provider, Map<String, Object> claims) {
        // a token per request: each lives two minutes, a recording far longer
        return HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + keys.sign(consumer, claims))
                .header(PARTICIPANT_HEADER, provider);
    }

    public void pushBundle(Inbox inbox, String provider, byte[] bundle) throws ProxyRefusal, IOException {
        send(deliver(inbox, provider, "/bundle", "application/json", bundle).POST(bytes(bundle)).build(), 200);
    }

    public void pushChunk(Inbox inbox, String provider, int seq, byte[] ndjson) throws ProxyRefusal, IOException {
        send(deliver(inbox, provider, "/chunks/" + seq, "application/x-ndjson", ndjson).POST(bytes(ndjson)).build(), 202);
    }

    public void completeStream(Inbox inbox, String provider, int chunks, int records, String sha256)
            throws ProxyRefusal, IOException {
        var body = mapper.writeValueAsString(Map.of("chunks", chunks, "records", records, "sha256", sha256))
                .getBytes(StandardCharsets.UTF_8);
        send(deliver(inbox, provider, "/complete", "application/json", body).POST(bytes(body)).build(), 200);
    }

    public void pushFile(Inbox inbox, String provider, byte[] file, String mediaType, String name)
            throws ProxyRefusal, IOException {
        send(deliver(inbox, provider, "/file", mediaType, file).header("X-File-Name", name).PUT(bytes(file)).build(), 200);
    }

    /** Tells the receiving side that nothing will come, and why. */
    public void refuse(Inbox inbox, String provider, String reason) throws ProxyRefusal, IOException {
        var body = mapper.writeValueAsString(Map.of("reason", reason)).getBytes(StandardCharsets.UTF_8);
        send(deliver(inbox, provider, "/refuse", "application/json", body).POST(bytes(body)).build(), 200);
    }

    private HttpRequest.Builder deliver(Inbox inbox, String provider, String path, String contentType, byte[] body) {
        return HttpRequest.newBuilder(URI.create(inbox.endpoint() + path))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer " + inbox.token())
                .header("Content-Type", contentType)
                .header(PARTICIPANT_HEADER, provider)
                .header(HASH_HEADER, sha256(body));
    }

    /**
     * The proxy limits how many heavy requests a participant makes a minute,
     * and a long recording is many of them. A 429 is therefore waited out, for
     * as long as the proxy says, and not treated as a refusal.
     */
    private static final int RATE_LIMIT_WAITS = 40;

    private byte[] send(HttpRequest request, int expected) throws ProxyRefusal, IOException {
        HttpResponse<byte[]> response;
        try {
            response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            for (var waits = 0; response.statusCode() == 429 && waits < RATE_LIMIT_WAITS; waits++) {
                Thread.sleep(retryAfterMillis(response));
                response = http.send(request, HttpResponse.BodyHandlers.ofByteArray());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted while calling the proxy", e);
        }
        if (response.statusCode() != expected) {
            throw new ProxyRefusal(response.statusCode(), errorOf(response.body(), response.statusCode()));
        }
        return response.body();
    }

    /** What Retry-After or RateLimit-Reset says, in seconds; five seconds when neither does, a minute at most. */
    static long retryAfterMillis(HttpResponse<?> response) {
        var seconds = response.headers().firstValue("Retry-After")
                .or(() -> response.headers().firstValue("RateLimit-Reset"))
                .map(value -> {
                    try {
                        return Long.parseLong(value.trim());
                    } catch (NumberFormatException e) {
                        return 5L;
                    }
                })
                .orElse(5L);
        return Math.max(1, Math.min(seconds, 60)) * 1000;
    }

    /** The proxy's errors are {@code {error}}; anything else is named by its status. */
    private String errorOf(byte[] body, int status) {
        try {
            var error = json(body).get("error");
            if (error != null) {
                return error.toString();
            }
        } catch (RuntimeException ignored) {
            // not JSON: the status has to do
        }
        return "the proxy answered " + status;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> json(byte[] body) {
        return mapper.readValue(body, Map.class);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static String text(Object value) {
        return value == null ? null : value.toString();
    }

    private static HttpRequest.BodyPublisher bytes(byte[] body) {
        return HttpRequest.BodyPublishers.ofByteArray(body);
    }

    private static String encode(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8);
    }

    public static String sha256(byte[] body) {
        return HexFormat.of().formatHex(digest().digest(body));
    }

    static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
