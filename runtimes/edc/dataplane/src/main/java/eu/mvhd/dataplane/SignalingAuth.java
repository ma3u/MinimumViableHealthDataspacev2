package eu.mvhd.dataplane;

/** Decides whether a signaling request comes from the control plane. */
public interface SignalingAuth {

    void check(String authorizationHeader) throws Refused;

    /** The request is not let in; the message says why, without the token. */
    final class Refused extends Exception {
        public Refused(String message) {
            super(message);
        }
    }
}
