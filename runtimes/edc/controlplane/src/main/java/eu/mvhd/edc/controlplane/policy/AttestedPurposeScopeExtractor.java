package eu.mvhd.edc.controlplane.policy;

import org.eclipse.edc.connector.controlplane.contract.spi.types.negotiation.ContractRequestMessage;
import org.eclipse.edc.connector.controlplane.transfer.spi.types.protocol.TransferRequestMessage;
import org.eclipse.edc.iam.decentralizedclaims.spi.scope.ScopeExtractor;
import org.eclipse.edc.policy.context.request.spi.RequestPolicyContext;
import org.eclipse.edc.policy.model.Operator;

import java.util.Set;

/**
 * The consumer's half of {@code ehds:attestedPurpose} (ADR-090): when a
 * contract or transfer request carries the constraint, the consumer asks its
 * own IdentityHub to present its {@code DataProcessingPurposeCredential}, so
 * the provider's {@link AttestedPurposeFunction} has a purpose to check.
 * <p>
 * Only the consumer's requests. The provider's own messages (the agreement,
 * a termination) carry the same policy, and a provider holds no purpose
 * credential: asking it for one fails its presentation and the consumer
 * answers 401, which is how the first run on compose ended. EDC's own
 * DynamicScopeExtractor limits itself the same way.
 * <p>
 * EDC's configured DCP scopes match a left operand by a string prefix, which
 * an expanded IRI such as {@value EhdsAttestedPurposeExtension#ATTESTED_PURPOSE}
 * never starts with; this maps the one IRI explicitly. The scope is the one
 * docker-compose.jad.yml configures as {@code data-processing-purpose}.
 */
public class AttestedPurposeScopeExtractor implements ScopeExtractor {

    static final String PURPOSE_SCOPE = "org.eclipse.dspace.dcp.vc.type:DataProcessingPurposeCredential:read";

    @Override
    public Set<String> extractScopes(Object leftValue, Operator operator, Object rightValue, RequestPolicyContext context) {
        if (!EhdsAttestedPurposeExtension.ATTESTED_PURPOSE.equals(leftValue)) {
            return Set.of();
        }
        var message = context.requestContext().getMessage();
        return message instanceof ContractRequestMessage || message instanceof TransferRequestMessage
                ? Set.of(PURPOSE_SCOPE)
                : Set.of();
    }
}
