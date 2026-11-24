package eu.mvhd.dataplane;

import java.util.function.Function;

/**
 * The Kafka logins of the data plane, one per job (ADR-096, decision 3).
 *
 * <p>On Event Hubs a shared access policy is a login, and its rights are
 * Manage, Send or Listen. The data plane needs all three, for different
 * clients: the admin client creates and deletes a transfer's topic and reads
 * how far a reader has come (Manage), the writer sends (Send), the reader
 * receives and commits its offsets (Listen). With one login for all of them
 * the writer and the reader would hold Manage too.
 *
 * <p>Each login falls back to the shared {@code DATAPLANE_KAFKA_SASL_*}
 * settings, so a broker with one user (compose before this) keeps working.
 *
 * @param admin topics and consumer group offsets
 * @param send the writer of a stream
 * @param listen the reader of a stream
 */
public record KafkaLogins(Login admin, Login send, Login listen) {

    /** A SASL PLAIN login. The password is never logged. */
    public record Login(String username, String password) {
        public boolean complete() {
            return !username.isBlank() && !password.isBlank();
        }

        @Override
        public String toString() {
            return "Login[" + username + "]";
        }
    }

    public static KafkaLogins none() {
        var empty = new Login("", "");
        return new KafkaLogins(empty, empty, empty);
    }

    /** From DATAPLANE_KAFKA_{ADMIN,SEND,LISTEN}_SASL_{USERNAME,PASSWORD}, each falling back to DATAPLANE_KAFKA_SASL_*. */
    static KafkaLogins from(Function<String, String> env) {
        var shared = login(env, "DATAPLANE_KAFKA_SASL_", new Login("", ""));
        return new KafkaLogins(
                login(env, "DATAPLANE_KAFKA_ADMIN_SASL_", shared),
                login(env, "DATAPLANE_KAFKA_SEND_SASL_", shared),
                login(env, "DATAPLANE_KAFKA_LISTEN_SASL_", shared));
    }

    private static Login login(Function<String, String> env, String prefix, Login fallback) {
        var username = trimmed(env.apply(prefix + "USERNAME"));
        var password = trimmed(env.apply(prefix + "PASSWORD"));
        return new Login(username.isEmpty() ? fallback.username() : username,
                password.isEmpty() ? fallback.password() : password);
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }

    /** Whether the three are one login, as before ADR-096 decision 3 was met. */
    public boolean shared() {
        return admin.equals(send) && send.equals(listen);
    }
}
