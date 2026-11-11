package eu.mvhd.edc.controlplane.policy;

import org.eclipse.edc.connector.controlplane.contract.spi.policy.ContractNegotiationPolicyContext;
import org.eclipse.edc.connector.controlplane.contract.spi.policy.TransferProcessPolicyContext;
import org.eclipse.edc.iam.decentralizedclaims.spi.scope.ScopeExtractorRegistry;
import org.eclipse.edc.policy.engine.spi.PolicyEngine;
import org.eclipse.edc.policy.engine.spi.RuleBindingRegistry;
import org.eclipse.edc.policy.model.Permission;
import org.eclipse.edc.runtime.metamodel.annotation.Extension;
import org.eclipse.edc.runtime.metamodel.annotation.Inject;
import org.eclipse.edc.spi.system.ServiceExtension;
import org.eclipse.edc.spi.system.ServiceExtensionContext;

import static org.eclipse.edc.connector.controlplane.contract.spi.policy.ContractNegotiationPolicyContext.NEGOTIATION_SCOPE;
import static org.eclipse.edc.connector.controlplane.contract.spi.policy.TransferProcessPolicyContext.TRANSFER_SCOPE;

/**
 * The first EHDS term the hub's connector enforces rather than declares
 * (ADR-090, #934 step 5): {@code ehds:attestedPurpose}, bound to the
 * negotiation and transfer scopes. A policy carrying it admits a consumer only
 * for a purpose its {@code DataProcessingPurposeCredential} attests, so the
 * bonus programme policy refuses an insurer whose credential says "premium
 * setting". Every other EHDS term stays declared only
 * ({@link EhdsPolicyVocabularyExtension}), so no other offer changes.
 * <p>
 * The scope extractor is the consumer's side and needs DCP. The TCK launcher
 * (controlplane-tck) loads this extension without DCP; there the registry is
 * absent and only the provider's function is bound.
 */
@Extension(EhdsAttestedPurposeExtension.NAME)
public class EhdsAttestedPurposeExtension implements ServiceExtension {

    public static final String NAME = "EHDS Attested Purpose";
    public static final String ATTESTED_PURPOSE = "https://w3id.org/ehds/attestedPurpose";

    @Inject
    private PolicyEngine policyEngine;

    @Inject
    private RuleBindingRegistry ruleBindingRegistry;

    @Inject(required = false)
    private ScopeExtractorRegistry scopeExtractorRegistry;

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public void initialize(ServiceExtensionContext context) {
        ruleBindingRegistry.bind(ATTESTED_PURPOSE, NEGOTIATION_SCOPE);
        ruleBindingRegistry.bind(ATTESTED_PURPOSE, TRANSFER_SCOPE);
        policyEngine.registerFunction(ContractNegotiationPolicyContext.class, Permission.class, ATTESTED_PURPOSE,
                new AttestedPurposeFunction<>());
        policyEngine.registerFunction(TransferProcessPolicyContext.class, Permission.class, ATTESTED_PURPOSE,
                new AttestedPurposeFunction<>());
        if (scopeExtractorRegistry != null) {
            scopeExtractorRegistry.registerScopeExtractor(new AttestedPurposeScopeExtractor());
        } else {
            context.getMonitor().info("No DCP scope extractor registry: " + ATTESTED_PURPOSE
                    + " is checked as provider only");
        }
    }
}
