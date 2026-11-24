package eu.mvhd.dataplane;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.clients.admin.OffsetSpec;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.clients.consumer.KafkaConsumer;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.errors.TopicExistsException;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.apache.kafka.common.serialization.StringSerializer;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;

/**
 * The stream over Kafka: one topic per transfer, one partition so the order
 * of a recording is the order on the topic, and a last record under the key
 * {@value #END_KEY} that carries the count and the hash.
 *
 * <p>Plain text, no authentication: what the compose stack's broker offers.
 * A broker shared between organisations needs TLS, SASL and an ACL per topic
 * and group; the address format has room for them, this class does not set
 * them (ADR-095, consequences).
 */
public final class KafkaTransport implements StreamTransport {

    static final String END_KEY = "__mvhd_end__";
    private static final Duration POLL = Duration.ofMillis(500);
    /** A reader that sees nothing for this long gives up: the sender is gone. */
    private static final Duration IDLE_LIMIT = Duration.ofMinutes(10);

    private final String bootstrap;
    private final int batchRecords;
    private final ObjectMapper mapper;
    private final String securityProtocol;
    private final KafkaLogins logins;

    public KafkaTransport(String bootstrap, int batchRecords, ObjectMapper mapper) {
        this(bootstrap, batchRecords, mapper, "PLAINTEXT", KafkaLogins.none());
    }

    /**
     * With SASL PLAIN, over TLS or not, and a login per job: the admin client,
     * the writer and the reader each log in with their own (ADR-096, decision
     * 3). The logins hold for every broker this process talks to, so the two
     * sides of a transfer share a broker for now.
     */
    public KafkaTransport(String bootstrap, int batchRecords, ObjectMapper mapper, String securityProtocol,
                          KafkaLogins logins) {
        this.bootstrap = bootstrap;
        this.batchRecords = Math.max(1, batchRecords);
        this.mapper = mapper;
        this.securityProtocol = securityProtocol;
        this.logins = logins;
        if (securityProtocol.startsWith("SASL")
                && !(logins.admin().complete() && logins.send().complete() && logins.listen().complete())) {
            throw new IllegalArgumentException("the Kafka security protocol " + securityProtocol
                    + " needs a user and a password for the admin client, the writer and the reader");
        }
    }

    @Override
    public void deleteTopic(String bootstrap, String topic) throws Exception {
        try (var admin = AdminClient.create(adminProperties(bootstrap))) {
            admin.deleteTopics(List.of(topic)).all().get(30, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            if (!(e.getCause() instanceof org.apache.kafka.common.errors.UnknownTopicOrPartitionException)) {
                throw e;
            }
        }
    }

    @Override
    public String bootstrap() {
        return bootstrap;
    }

    @Override
    public void createTopic(String bootstrap, String topic) throws Exception {
        try (var admin = AdminClient.create(adminProperties(bootstrap))) {
            admin.createTopics(List.of(new NewTopic(topic, 1, (short) 1))).all().get(30, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            if (!(e.getCause() instanceof TopicExistsException)) {
                throw e;
            }
        }
    }

    @Override
    public Writer writer(String bootstrap, String topic) {
        var properties = writerProperties(bootstrap);
        properties.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        properties.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class.getName());
        // every record acknowledged and none sent twice: the receiver counts them
        properties.put(ProducerConfig.ACKS_CONFIG, "all");
        properties.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, "true");
        // a 30 s strip of two leads at 250 Hz is about 100 kB; leave room for more leads
        properties.put(ProducerConfig.MAX_REQUEST_SIZE_CONFIG, String.valueOf(4 * 1024 * 1024));
        var producer = new KafkaProducer<String, String>(properties);
        return new Writer() {
            @Override
            public void send(String record) throws Exception {
                producer.send(new ProducerRecord<>(topic, null, record)).get(60, TimeUnit.SECONDS);
            }

            @Override
            public void end(int records, String sha256) throws Exception {
                var mark = mapper.writeValueAsString(Map.of("records", records, "sha256", sha256));
                producer.send(new ProducerRecord<>(topic, END_KEY, mark)).get(60, TimeUnit.SECONDS);
            }

            @Override
            public void close() {
                producer.close(Duration.ofSeconds(10));
            }
        };
    }

    @Override
    @SuppressWarnings("unchecked")
    public End read(String bootstrap, String topic, String group, Sink sink,
                    java.util.function.BooleanSupplier stopped) throws Exception {
        var properties = readerProperties(bootstrap);
        properties.put(ConsumerConfig.GROUP_ID_CONFIG, group);
        properties.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        properties.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class.getName());
        properties.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        // an offset is committed only after the sink took the batch
        properties.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, "false");
        properties.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, String.valueOf(batchRecords));
        properties.put(ConsumerConfig.MAX_PARTITION_FETCH_BYTES_CONFIG, String.valueOf(8 * 1024 * 1024));
        var partition = new TopicPartition(topic, 0);
        try (var consumer = new KafkaConsumer<String, String>(properties)) {
            consumer.assign(List.of(partition));
            var idleSince = System.nanoTime();
            while (true) {
                var polled = consumer.poll(POLL);
                if (stopped.getAsBoolean()) {
                    throw new IllegalStateException("the transfer was ended while its stream was being read");
                }
                if (polled.isEmpty()) {
                    if (System.nanoTime() - idleSince > IDLE_LIMIT.toNanos()) {
                        throw new IllegalStateException("nothing arrived on " + topic + " for " + IDLE_LIMIT.toMinutes() + " minutes");
                    }
                    continue;
                }
                idleSince = System.nanoTime();
                var batch = new ArrayList<String>();
                End end = null;
                long next = -1;
                for (var record : polled.records(partition)) {
                    next = record.offset() + 1;
                    if (END_KEY.equals(record.key())) {
                        var mark = (Map<String, Object>) mapper.readValue(record.value(), Map.class);
                        end = new End(((Number) mark.get("records")).intValue(), String.valueOf(mark.get("sha256")));
                        break;
                    }
                    batch.add(record.value());
                }
                if (!batch.isEmpty()) {
                    sink.accept(batch);
                }
                consumer.commitSync(Map.of(partition, new OffsetAndMetadata(next)));
                if (end != null) {
                    return end;
                }
            }
        }
    }

    @Override
    public boolean consumed(String bootstrap, String topic, String group) throws Exception {
        var partition = new TopicPartition(topic, 0);
        try (var admin = AdminClient.create(adminProperties(bootstrap))) {
            var end = admin.listOffsets(Map.of(partition, OffsetSpec.latest())).all().get(30, TimeUnit.SECONDS)
                    .get(partition).offset();
            var committed = admin.listConsumerGroupOffsets(group).partitionsToOffsetAndMetadata()
                    .get(30, TimeUnit.SECONDS).get(partition);
            return end > 0 && committed != null && committed.offset() >= end;
        }
    }

    /** The admin client's: it creates and deletes topics and reads a group's offsets. */
    Properties adminProperties(String bootstrap) {
        return common(bootstrap, logins.admin());
    }

    /** The writer's base settings, before the producer's own. */
    Properties writerProperties(String bootstrap) {
        return common(bootstrap, logins.send());
    }

    /** The reader's base settings, before the consumer's own. */
    Properties readerProperties(String bootstrap) {
        return common(bootstrap, logins.listen());
    }

    private Properties common(String bootstrap, KafkaLogins.Login login) {
        var properties = new Properties();
        properties.put("bootstrap.servers", bootstrap);
        properties.put("client.id", "mvhd-dataplane");
        properties.put("security.protocol", securityProtocol);
        if (securityProtocol.startsWith("SASL")) {
            properties.put("sasl.mechanism", "PLAIN");
            properties.put("sasl.jaas.config",
                    "org.apache.kafka.common.security.plain.PlainLoginModule required username=\"%s\" password=\"%s\";"
                            .formatted(jaas(login.username()), jaas(login.password())));
        }
        return properties;
    }

    /** A value inside a quoted JAAS option: a backslash or a quote would end it early. */
    static String jaas(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }
}
