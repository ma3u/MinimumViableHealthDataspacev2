package eu.mvhd.dataplane;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import java.text.ParseException;
import java.time.Clock;
import java.time.Duration;
import java.util.Date;
import java.util.Map;
import java.util.UUID;

/**
 * The data plane's own key. It signs two kinds of token: the callbacks to the
 * control plane, which checks {@code sub} against the data plane's id, and the
 * requests to the Neo4j proxy, which reads the scope and the dataset from
 * them. Both verify against the JWKS served here.
 *
 * <p>RSA, not an elliptic curve: the control plane's image cannot verify
 * ES256. Its BouncyCastle build loads a native library made for glibc, the
 * image is Alpine, and the provider class then fails to initialise
 * (docs/gotchas.md, 2026-11-19). RS256 is verified without it.
 */
public final class SigningKeys {

    public static final String ISSUER = "mvhd-dataplane";
    /** Long enough for one HTTP call, short enough that a logged token is useless. */
    static final Duration LIFETIME = Duration.ofMinutes(2);

    private final RSAKey key;
    private final Clock clock;

    private SigningKeys(RSAKey key, Clock clock) {
        this.key = key;
        this.clock = clock;
    }

    /** From a configured JWK, or a fresh key when none is configured. */
    public static SigningKeys load(String jwk, Clock clock) {
        try {
            if (jwk == null || jwk.isBlank()) {
                var generated = new RSAKeyGenerator(2048).keyID(UUID.randomUUID().toString()).generate();
                return new SigningKeys(generated, clock);
            }
            var parsed = RSAKey.parse(jwk);
            if (!parsed.isPrivate() || parsed.size() < 2048 || parsed.getKeyID() == null) {
                throw new IllegalArgumentException("the signing key must be a private RSA JWK of 2048 bits or more, with a kid");
            }
            return new SigningKeys(parsed, clock);
        } catch (JOSEException | ParseException e) {
            // the JWK's text is not repeated: it holds the private key
            throw new IllegalArgumentException("the signing key is not a usable RSA JWK", e);
        }
    }

    /** The public half, as the JWKS document. */
    public String jwks() {
        return new JWKSet(key.toPublicJWK()).toString();
    }

    /**
     * A token with the given subject and claims. Every token gets a {@code jti}:
     * the control plane refuses a callback token it has seen before.
     */
    public String sign(String subject, Map<String, Object> claims) {
        var now = clock.instant();
        var builder = new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .subject(subject)
                .jwtID(UUID.randomUUID().toString())
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plus(LIFETIME)));
        claims.forEach(builder::claim);
        var jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).type(JOSEObjectType.JWT).build(),
                builder.build());
        try {
            jwt.sign(new RSASSASigner(key));
        } catch (JOSEException e) {
            throw new IllegalStateException("signing failed", e);
        }
        return jwt.serialize();
    }
}
