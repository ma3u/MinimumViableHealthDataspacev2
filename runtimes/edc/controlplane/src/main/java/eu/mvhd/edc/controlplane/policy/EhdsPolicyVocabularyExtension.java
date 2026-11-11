package eu.mvhd.edc.controlplane.policy;

import org.eclipse.edc.policy.engine.spi.PolicyContextImpl;
import org.eclipse.edc.policy.engine.spi.PolicyEngine;
import org.eclipse.edc.policy.engine.spi.RuleBindingRegistry;
import org.eclipse.edc.policy.model.Duty;
import org.eclipse.edc.policy.model.Permission;
import org.eclipse.edc.policy.model.Prohibition;
import org.eclipse.edc.runtime.metamodel.annotation.Extension;
import org.eclipse.edc.runtime.metamodel.annotation.Inject;
import org.eclipse.edc.spi.system.ServiceExtension;
import org.eclipse.edc.spi.system.ServiceExtensionContext;

import java.util.List;

/**
 * Declares the EHDS policy vocabulary of the standard policies (jad/policies,
 * ADR-077) to the control plane, so EDC 1.0's policy validation accepts them
 * (#881, finding 16). Without it a policy definition with an EHDS duty is
 * refused: "action 'https://w3id.org/ehds/secureProcessingEnvironment' is not
 * bound to any scopes".
 * <p>
 * Declared, not enforced. Every term is bound to the scope {@value #DECLARED_SCOPE},
 * which EDC never evaluates; the catalog, negotiation and transfer scopes still
 * skip these constraints, exactly as EDC 0.18 did. Enforcing a term, such as
 * ehds:purpose against the consumer's DataProcessingPurposeCredential, means
 * binding it to a real scope with a function that decides; that is separate
 * work. The lists are the terms RC5 refused, measured by posting the standard
 * policies with validation on (odrl:event since the bonus programme's duty,
 * ADR-090). ehds:attestedPurpose is not here: EhdsAttestedPurposeExtension
 * enforces it.
 */
@Extension(EhdsPolicyVocabularyExtension.NAME)
public class EhdsPolicyVocabularyExtension implements ServiceExtension {

    public static final String NAME = "EHDS Policy Vocabulary";
    public static final String DECLARED_SCOPE = "ehds.declared";

    private static final String EHDS = "https://w3id.org/ehds/";
    private static final String ODRL = "http://www.w3.org/ns/odrl/2/";

    static final List<String> ACTIONS = List.of(
            ODRL + "anonymize", ODRL + "attribute", ODRL + "delete", ODRL + "extract",
            EHDS + "advertise", EHDS + "aggregateOnly", EHDS + "attestEnvironment",
            EHDS + "detrimentalDecision", EHDS + "developCompetingProduct",
            EHDS + "documentTrainingData", EHDS + "extractTrainingData", EHDS + "insuranceDecision",
            EHDS + "maintainAuditTrail", EHDS + "minimizeData", EHDS + "profile",
            EHDS + "prohibitedAiPractice", EHDS + "pseudonymize", EHDS + "publishResults",
            EHDS + "reIdentify", EHDS + "reportIncident", EHDS + "secureProcessingEnvironment",
            EHDS + "shareWithGatekeeper", EHDS + "transferOutsideEU");

    static final List<String> LEFT_OPERANDS = List.of(
            ODRL + "event", ODRL + "spatial",
            EHDS + "certification", EHDS + "dataPermit", EHDS + "hdabApproval", EHDS + "kAnonymity",
            EHDS + "legalBasis", EHDS + "processingEnvironment", EHDS + "purpose");

    @Inject
    private PolicyEngine policyEngine;

    @Inject
    private RuleBindingRegistry ruleBindingRegistry;

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public void initialize(ServiceExtensionContext context) {
        policyEngine.registerScope(DECLARED_SCOPE, DeclaredContext.class);
        ACTIONS.forEach(action -> ruleBindingRegistry.bind(action, DECLARED_SCOPE));
        for (var leftOperand : LEFT_OPERANDS) {
            ruleBindingRegistry.bind(leftOperand, DECLARED_SCOPE);
            // Validation wants a function per operand and rule kind. In this
            // scope nothing evaluates it; if something did, it would not decide.
            policyEngine.registerFunction(DeclaredContext.class, Permission.class, leftOperand, (operator, right, rule, ctx) -> true);
            policyEngine.registerFunction(DeclaredContext.class, Duty.class, leftOperand, (operator, right, rule, ctx) -> true);
            policyEngine.registerFunction(DeclaredContext.class, Prohibition.class, leftOperand, (operator, right, rule, ctx) -> true);
        }
    }

    /** The context of {@value #DECLARED_SCOPE}; no request ever creates one. */
    public static class DeclaredContext extends PolicyContextImpl {
        @Override
        public String scope() {
            return DECLARED_SCOPE;
        }
    }
}
