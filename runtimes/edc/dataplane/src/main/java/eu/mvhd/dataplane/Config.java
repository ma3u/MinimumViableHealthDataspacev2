package eu.mvhd.dataplane;

import java.net.URI;
import java.util.Map;
import java.util.function.Function;

/**
 * What the data plane is told from outside. Every value is an environment
 * variable; the defaults are the compose stack's.
 *
 * @param port the one port: signaling, the JWKS and the health check
 * @param publicUrl how the control plane reaches this process; the JWKS address in a registration is built from it
 * @param controlPlaneSignalingUrl where callbacks go ({@code .../transfers/{id}/dataflow/{action}} is appended by the SDK)
 * @param signalingJwksUrl the keys that sign the control plane's tokens (Keycloak's realm certificates)
 * @param signalingClientId the Keycloak client the control plane calls with; a token of another client is refused
 * @param proxyUrl the Neo4j proxy: SPE inboxes and the datasets
 * @param attestationFloor the least attestation a workspace must show before data is pushed into it
 * @param chunkRecords resources per chunk of a stream
 * @param startWaitSeconds how long the provider waits for the consumer to report the transfer started
 * @param settleMillis a pause after that report, for the consumer's control plane to save its state
 * @param kafkaBootstrap the broker for the Kafka transfer types; empty offers none of them
 * @param dbUrl JDBC address of the store; empty keeps flows in memory (tests only)
 * @param dbUser the store's user
 * @param dbPassword the store's password
 * @param signingKeyJwk the RSA key as a JWK; empty generates one at start, and callbacks sent before a restart stop verifying after it
 */
public record Config(
        int port,
        URI publicUrl,
        URI controlPlaneSignalingUrl,
        URI signalingJwksUrl,
        String signalingClientId,
        URI proxyUrl,
        AttestationScope attestationFloor,
        int chunkRecords,
        int startWaitSeconds,
        int settleMillis,
        String kafkaBootstrap,
        String dbUrl,
        String dbUser,
        String dbPassword,
        String signingKeyJwk) {

    public static Config fromEnvironment() {
        return from(System.getenv()::get);
    }

    static Config from(Map<String, String> values) {
        return from(values::get);
    }

    static Config from(Function<String, String> env) {
        return new Config(
                Integer.parseInt(value(env, "DATAPLANE_PORT", "8090")),
                URI.create(value(env, "DATAPLANE_PUBLIC_URL", "http://dataplane:8090")),
                URI.create(value(env, "DATAPLANE_CONTROL_PLANE_SIGNALING_URL", "http://controlplane:8182/api/signaling")),
                URI.create(value(env, "DATAPLANE_SIGNALING_JWKS_URL",
                        "http://keycloak:8080/realms/edcv/protocol/openid-connect/certs")),
                value(env, "DATAPLANE_SIGNALING_CLIENT_ID", "dataplane-signaling"),
                URI.create(value(env, "DATAPLANE_PROXY_URL", "http://neo4j-proxy:9090")),
                AttestationScope.parse(value(env, "DATAPLANE_ATTESTATION_FLOOR", "workload")),
                Integer.parseInt(value(env, "DATAPLANE_CHUNK_RECORDS", "500")),
                Integer.parseInt(value(env, "DATAPLANE_START_WAIT_SECONDS", "60")),
                Integer.parseInt(value(env, "DATAPLANE_SETTLE_MILLIS", "1000")),
                value(env, "DATAPLANE_KAFKA_BOOTSTRAP", ""),
                value(env, "DATAPLANE_DB_URL", ""),
                value(env, "DATAPLANE_DB_USER", ""),
                value(env, "DATAPLANE_DB_PASSWORD", ""),
                value(env, "DATAPLANE_SIGNING_KEY_JWK", ""));
    }

    private static String value(Function<String, String> env, String key, String fallback) {
        var value = env.apply(key);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    /** The id this data plane is registered under for one participant context. */
    public static String dataplaneId(String participantContextId) {
        return "mvhd-dp-" + participantContextId;
    }
}
