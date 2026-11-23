package eu.mvhd.dataplane;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

import java.net.MalformedURLException;
import java.net.URI;
import java.util.Set;

/**
 * Checks the token the control plane sends with a signaling message. The
 * control plane gets it from Keycloak with the client credentials in the data
 * plane's registration, so a valid token of that one client is what "this is
 * our control plane" means here. The SDK leaves this to the implementor.
 */
public final class ControlPlaneTokens implements SignalingAuth {

    private static final String BEARER = "Bearer ";

    private final DefaultJWTProcessor<SecurityContext> processor;
    private final String clientId;

    public ControlPlaneTokens(JWKSource<SecurityContext> keys, String clientId) {
        this.clientId = clientId;
        this.processor = new DefaultJWTProcessor<>();
        // Keycloak signs RS256 by default; a realm may be moved to ES256 or PS256
        this.processor.setJWSKeySelector(new JWSVerificationKeySelector<>(
                Set.of(JWSAlgorithm.RS256, JWSAlgorithm.PS256, JWSAlgorithm.ES256), keys));
    }

    public static ControlPlaneTokens remote(URI jwksUrl, String clientId) {
        try {
            return new ControlPlaneTokens(JWKSourceBuilder.create(jwksUrl.toURL()).build(), clientId);
        } catch (MalformedURLException e) {
            throw new IllegalArgumentException("not a URL: " + jwksUrl, e);
        }
    }

    @Override
    public void check(String authorizationHeader) throws Refused {
        if (authorizationHeader == null || !authorizationHeader.startsWith(BEARER)) {
            throw new Refused("no bearer token");
        }
        JWTClaimsSet claims;
        try {
            // signature and expiry; the processor refuses an expired token itself
            claims = processor.process(authorizationHeader.substring(BEARER.length()).trim(), null);
        } catch (Exception e) {
            throw new Refused("the token does not verify: " + e.getMessage());
        }
        var caller = claims.getClaim("azp") != null ? claims.getClaim("azp") : claims.getClaim("client_id");
        if (!clientId.equals(caller)) {
            throw new Refused("the token is not of the client " + clientId);
        }
    }
}
