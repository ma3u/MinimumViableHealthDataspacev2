package eu.mvhd.dataplane;

import org.eclipse.dataplane.domain.Result;
import org.eclipse.dataplane.domain.registration.Authorization;
import org.eclipse.dataplane.domain.registration.AuthorizationProfile;

import java.util.Map;

/**
 * How the data plane signs its callbacks. The control plane accepts a callback
 * for a transfer only when the token's {@code sub} is the id of the data plane
 * registered for that participant context, so the id travels in the profile
 * stored with each control plane entry and becomes the subject.
 */
public final class CallbackAuthorization implements Authorization {

    public static final String TYPE = "mvhd_dataplane_signed";
    public static final String DATAPLANE_ID = "dataplaneId";

    private final SigningKeys keys;

    public CallbackAuthorization(SigningKeys keys) {
        this.keys = keys;
    }

    public static AuthorizationProfile profileFor(String participantContextId) {
        return new AuthorizationProfile(TYPE).withAttribute(DATAPLANE_ID, Config.dataplaneId(participantContextId));
    }

    @Override
    public String type() {
        return TYPE;
    }

    @Override
    public Result<String> authorizationHeader(AuthorizationProfile profile) {
        var dataplaneId = profile.stringAttribute(DATAPLANE_ID);
        if (dataplaneId == null) {
            return Result.failure(new IllegalStateException("the control plane entry names no data plane id"));
        }
        return Result.success("Bearer " + keys.sign(dataplaneId, Map.of()));
    }

    @Override
    public Result<String> extractCallerId(String authorizationHeader) {
        // incoming signaling is checked by SignalingAuth, with the participant
        // context from the path; the SDK's own controllers are not used
        return Result.failure(new UnsupportedOperationException("incoming tokens are checked by the HTTP layer"));
    }
}
