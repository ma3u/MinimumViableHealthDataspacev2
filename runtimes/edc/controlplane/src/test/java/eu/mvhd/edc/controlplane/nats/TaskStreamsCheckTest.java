package eu.mvhd.edc.controlplane.nats;

import org.eclipse.edc.spi.monitor.Monitor;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TaskStreamsCheckTest {

    private static final List<String> STREAMS = List.of("cn-stream", "tp-stream");

    private final Map<String, Optional<Boolean>> answers = new HashMap<>();
    private final List<String> asked = new ArrayList<>();
    private final List<String> warnings = new ArrayList<>();
    private final MutableClock clock = new MutableClock();

    private final Monitor monitor = new Monitor() {
        @Override
        public void warning(String message, Throwable... errors) {
            warnings.add(message);
        }
    };

    private TaskStreamsCheck check() {
        return new TaskStreamsCheck(STREAMS, stream -> {
            asked.add(stream);
            return answers.getOrDefault(stream, Optional.of(true));
        }, clock, Duration.ofSeconds(10), monitor);
    }

    @Test
    void liveWhenBothStreamsExist() {
        var result = check().get();

        assertTrue(result.succeeded());
        assertEquals(STREAMS, asked);
        assertTrue(warnings.isEmpty());
    }

    @Test
    void failsAndNamesTheStreamNatsDoesNotHave() {
        answers.put("cn-stream", Optional.of(false));

        var result = check().get();

        assertTrue(result.failed());
        assertTrue(result.getFailureDetail().contains("cn-stream"), result.getFailureDetail());
        assertFalse(result.getFailureDetail().contains("tp-stream"), result.getFailureDetail());
        assertEquals(1, warnings.size());
    }

    @Test
    void namesBothStreamsWhenNatsLostBoth() {
        answers.put("cn-stream", Optional.of(false));
        answers.put("tp-stream", Optional.of(false));

        var result = check().get();

        assertTrue(result.failed());
        assertEquals("NATS has no streams cn-stream, tp-stream; a restart of the control plane creates them again (ADR-084)",
                result.getFailureDetail());
    }

    @Test
    void liveWhenNatsCannotBeAsked() {
        answers.put("cn-stream", Optional.empty());
        answers.put("tp-stream", Optional.of(false));

        assertTrue(check().get().succeeded());
        // one unanswered lookup is enough; the next would wait for its own timeout
        assertEquals(List.of("cn-stream"), asked);
    }

    @Test
    void asksNatsAtMostOncePerPeriod() {
        var check = check();

        check.get();
        clock.advance(Duration.ofSeconds(9));
        check.get();
        assertEquals(2, asked.size());

        clock.advance(Duration.ofSeconds(1));
        check.get();
        assertEquals(4, asked.size());
    }

    @Test
    void recoversOnceTheStreamIsBack() {
        var check = check();
        answers.put("tp-stream", Optional.of(false));
        assertTrue(check.get().failed());

        answers.remove("tp-stream");
        clock.advance(Duration.ofSeconds(10));

        assertTrue(check.get().succeeded());
    }

    @Test
    void warnsOnChangeOnly() {
        var check = check();
        answers.put("tp-stream", Optional.of(false));

        for (var i = 0; i < 3; i++) {
            check.get();
            clock.advance(Duration.ofSeconds(30));
        }

        assertEquals(1, warnings.size());
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-09T12:00:00Z");

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public Instant instant() {
            return now;
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }
    }
}
