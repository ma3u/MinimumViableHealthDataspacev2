package eu.mvhd.dataplane;

import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.Properties;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** One Kafka login per job (ADR-096, decision 3), and the shared login as the fallback. */
class KafkaLoginsTest {

    private static KafkaLogins from(Map<String, String> env) {
        return KafkaLogins.from(env::get);
    }

    @Test
    void theSharedLoginServesEveryJobWhenNoneHasItsOwn() {
        var logins = from(Map.of("DATAPLANE_KAFKA_SASL_USERNAME", "dataplane",
                "DATAPLANE_KAFKA_SASL_PASSWORD", "shared-local"));

        assertTrue(logins.shared());
        assertEquals(new KafkaLogins.Login("dataplane", "shared-local"), logins.send());
    }

    @Test
    void eachJobTakesItsOwnLoginAndFallsBackPerField() {
        var env = new HashMap<String, String>();
        env.put("DATAPLANE_KAFKA_SASL_USERNAME", "$ConnectionString");
        env.put("DATAPLANE_KAFKA_ADMIN_SASL_PASSWORD", "manage-local");
        env.put("DATAPLANE_KAFKA_SEND_SASL_PASSWORD", "send-local");
        env.put("DATAPLANE_KAFKA_LISTEN_SASL_PASSWORD", "listen-local");

        var logins = from(env);

        assertFalse(logins.shared());
        // Event Hubs: one user name for every policy, a password per policy
        assertEquals(new KafkaLogins.Login("$ConnectionString", "manage-local"), logins.admin());
        assertEquals(new KafkaLogins.Login("$ConnectionString", "send-local"), logins.send());
        assertEquals(new KafkaLogins.Login("$ConnectionString", "listen-local"), logins.listen());
    }

    @Test
    void aLoginNeverShowsItsPassword() {
        assertFalse(new KafkaLogins.Login("dataplane", "very-secret").toString().contains("very-secret"));
    }

    @Test
    void eachClientLogsInWithItsJobsLogin() {
        var logins = new KafkaLogins(new KafkaLogins.Login("admin-user", "a"),
                new KafkaLogins.Login("send-user", "s"), new KafkaLogins.Login("listen-user", "l"));
        var transport = new KafkaTransport("kafka:9094", 10, Main.mapper(), "SASL_PLAINTEXT", logins);

        assertTrue(jaas(transport.adminProperties("kafka:9094")).contains("username=\"admin-user\""));
        assertTrue(jaas(transport.writerProperties("kafka:9094")).contains("username=\"send-user\""));
        assertTrue(jaas(transport.readerProperties("kafka:9094")).contains("username=\"listen-user\""));
    }

    @Test
    void saslWithoutALoginForEveryJobIsRefusedAtStart() {
        var logins = new KafkaLogins(new KafkaLogins.Login("admin-user", "a"),
                new KafkaLogins.Login("send-user", "s"), new KafkaLogins.Login("", ""));

        var refused = assertThrows(IllegalArgumentException.class,
                () -> new KafkaTransport("kafka:9094", 10, Main.mapper(), "SASL_SSL", logins));
        assertTrue(refused.getMessage().contains("reader"));
    }

    @Test
    void plainTextNeedsNoLogin() {
        var transport = new KafkaTransport("kafka:9092", 10, Main.mapper());

        assertEquals("PLAINTEXT", transport.adminProperties("kafka:9092").getProperty("security.protocol"));
        assertFalse(transport.adminProperties("kafka:9092").containsKey("sasl.jaas.config"));
    }

    private static String jaas(Properties properties) {
        return properties.getProperty("sasl.jaas.config");
    }
}
