package eu.mvhd.dataplane;

import java.util.List;

/**
 * A stream between the two data planes of a transfer: records in order, then
 * an end mark with the count and the SHA-256 of everything sent. Kafka in the
 * running system; a list in memory in the unit tests, so those need no broker.
 */
public interface StreamTransport {

    /** The broker this data plane offers topics on. */
    String bootstrap();

    void createTopic(String bootstrap, String topic) throws Exception;

    Writer writer(String bootstrap, String topic) throws Exception;

    /**
     * Reads the topic from its beginning until the end mark, handing over
     * batches in order. A batch counts as read only when the sink returned
     * without an exception; {@link #consumed} reports that to the sender.
     * {@code stopped} is asked between polls: a transfer that was ended has
     * no end mark coming.
     */
    End read(String bootstrap, String topic, String group, Sink sink, java.util.function.BooleanSupplier stopped)
            throws Exception;

    /**
     * Removes a transfer's topic once the transfer has ended. A stream is
     * kept in the workspace, not on the broker, and Event Hubs allows a
     * namespace ten topics (ADR-096).
     */
    void deleteTopic(String bootstrap, String topic) throws Exception;

    /** Whether the reader of that group has taken everything on the topic, the end mark included. */
    boolean consumed(String bootstrap, String topic, String group) throws Exception;

    interface Writer extends AutoCloseable {
        void send(String record) throws Exception;

        void end(int records, String sha256) throws Exception;

        @Override
        void close();
    }

    interface Sink {
        void accept(List<String> records) throws Exception;
    }

    /** What the sender said it sent. */
    record End(int records, String sha256) {
    }
}
