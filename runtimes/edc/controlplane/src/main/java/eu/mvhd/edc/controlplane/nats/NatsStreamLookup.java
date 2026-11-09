package eu.mvhd.edc.controlplane.nats;

import io.nats.client.Connection;
import io.nats.client.ErrorListener;
import io.nats.client.JetStreamApiException;
import io.nats.client.JetStreamOptions;
import io.nats.client.Nats;
import io.nats.client.Options;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Asks NATS whether a JetStream stream exists, over a connection of its own
 * per server URL. A connection that cannot be made, is not connected at the
 * moment, or does not answer in time makes the answer unknown (empty), never
 * "missing": only NATS saying "stream not found" is.
 */
final class NatsStreamLookup implements AutoCloseable {

    /** JetStream's API error code for "stream not found". */
    static final int STREAM_NOT_FOUND = 10059;

    private static final Duration TIMEOUT = Duration.ofSeconds(2);

    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    Optional<Boolean> exists(String url, String stream) {
        try {
            var connection = connection(url);
            if (connection.getStatus() != Connection.Status.CONNECTED) {
                return Optional.empty();
            }
            connection.jetStreamManagement(JetStreamOptions.builder().requestTimeout(TIMEOUT).build())
                    .getStreamInfo(stream);
            return Optional.of(true);
        } catch (JetStreamApiException e) {
            return e.getApiErrorCode() == STREAM_NOT_FOUND ? Optional.of(false) : Optional.empty();
        } catch (IOException | RuntimeException e) {
            return Optional.empty();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        }
    }

    /** The open connection for this URL, a new one when there is none or it was closed. */
    private Connection connection(String url) throws IOException, InterruptedException {
        var existing = connections.get(url);
        if (existing != null && existing.getStatus() != Connection.Status.CLOSED) {
            return existing;
        }
        var options = new Options.Builder()
                .server(url)
                .connectionName("mvhd-task-streams-liveness")
                .connectionTimeout(TIMEOUT)
                .maxReconnects(-1)
                // EDC's own connections already log every NATS disconnect
                .errorListener(new ErrorListener() { })
                .build();
        var connection = Nats.connect(options);
        connections.put(url, connection);
        return connection;
    }

    @Override
    public void close() {
        for (var connection : connections.values()) {
            try {
                connection.close();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        connections.clear();
    }
}
