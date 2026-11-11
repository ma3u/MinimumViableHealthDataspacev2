package eu.mvhd.edc.controlplane.policy;

import org.eclipse.edc.iam.verifiablecredentials.spi.model.CredentialSubject;
import org.eclipse.edc.iam.verifiablecredentials.spi.model.VerifiableCredential;
import org.eclipse.edc.participant.spi.ParticipantAgent;
import org.eclipse.edc.participant.spi.ParticipantAgentPolicyContext;
import org.eclipse.edc.policy.engine.spi.AtomicConstraintRuleFunction;
import org.eclipse.edc.policy.engine.spi.PolicyContext;
import org.eclipse.edc.policy.model.Operator;
import org.eclipse.edc.policy.model.Permission;
import org.eclipse.edc.spi.result.Result;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Decides {@code ehds:attestedPurpose} (ADR-090): the consumer may use the
 * data only for a purpose a {@code DataProcessingPurposeCredential} it
 * presented attests. The right operand names the purposes the policy permits
 * ({@code eq} one, {@code isAnyOf} a list); the consumer is admitted when one
 * of its attested purposes is among them, and refused otherwise, also when it
 * presented no such credential.
 * <p>
 * The provider runs this in the negotiation and transfer scopes, on the
 * credentials DCP verified (the claim {@value #VC_CLAIM}). Which credentials
 * the consumer presents is decided on the consumer's side, by
 * {@link AttestedPurposeScopeExtractor}.
 */
public class AttestedPurposeFunction<C extends PolicyContext & ParticipantAgentPolicyContext>
        implements AtomicConstraintRuleFunction<Permission, C> {

    static final String VC_CLAIM = "vc";
    static final String CREDENTIAL_TYPE = "DataProcessingPurposeCredential";
    static final String PURPOSE_CLAIM = "purpose";

    @Override
    public boolean evaluate(Operator operator, Object rightValue, Permission rule, C context) {
        var permitted = values(rightValue);
        if (operator != Operator.EQ && operator != Operator.IS_ANY_OF) {
            context.reportProblem("ehds:attestedPurpose: operator " + operator + " is not supported, only eq and isAnyOf");
            return false;
        }
        var attested = attestedPurposes(context.participantAgent());
        if (attested.isEmpty()) {
            context.reportProblem("ehds:attestedPurpose: the consumer presented no " + CREDENTIAL_TYPE
                    + "; the policy permits " + permitted);
            return false;
        }
        if (attested.stream().anyMatch(permitted::contains)) {
            return true;
        }
        context.reportProblem("ehds:attestedPurpose: the consumer's " + CREDENTIAL_TYPE + " attests " + attested
                + "; the policy permits " + permitted);
        return false;
    }

    @Override
    public Result<Void> validate(Operator operator, Object rightValue, Permission rule) {
        if (operator != Operator.EQ && operator != Operator.IS_ANY_OF) {
            return Result.failure("ehds:attestedPurpose takes eq or isAnyOf, not " + operator);
        }
        return values(rightValue).isEmpty()
                ? Result.failure("ehds:attestedPurpose needs at least one purpose")
                : Result.success();
    }

    @Override
    public String name() {
        return "EHDS attested purpose";
    }

    /** The purposes the agent's purpose credentials attest, in order, without repeats. */
    static Set<String> attestedPurposes(ParticipantAgent agent) {
        var purposes = new LinkedHashSet<String>();
        if (agent == null || !(agent.getClaims().get(VC_CLAIM) instanceof Collection<?> credentials)) {
            return purposes;
        }
        for (var item : credentials) {
            if (item instanceof VerifiableCredential vc && isPurposeCredential(vc)) {
                for (CredentialSubject subject : vc.getCredentialSubject()) {
                    subject.getClaims().forEach((key, value) -> {
                        if (isPurposeKey(key)) {
                            purposes.addAll(values(value));
                        }
                    });
                }
            }
        }
        return purposes;
    }

    private static boolean isPurposeCredential(VerifiableCredential vc) {
        return vc.getType() != null && vc.getType().stream()
                .anyMatch(type -> type.equals(CREDENTIAL_TYPE) || type.endsWith("/" + CREDENTIAL_TYPE)
                        || type.endsWith("#" + CREDENTIAL_TYPE));
    }

    /** "purpose", or an expanded IRI that ends in it. */
    private static boolean isPurposeKey(String key) {
        return key.equals(PURPOSE_CLAIM) || key.endsWith("/" + PURPOSE_CLAIM) || key.endsWith("#" + PURPOSE_CLAIM);
    }

    /** A string, a list of them, or a JSON-LD value object, as plain strings. */
    static List<String> values(Object value) {
        var out = new ArrayList<String>();
        if (value instanceof Collection<?> list) {
            list.forEach(item -> out.addAll(values(item)));
        } else if (value instanceof Map<?, ?> map && map.containsKey("@value")) {
            out.addAll(values(map.get("@value")));
        } else if (value != null) {
            var text = value.toString().trim();
            if (!text.isEmpty()) {
                out.add(text);
            }
        }
        return out;
    }
}
