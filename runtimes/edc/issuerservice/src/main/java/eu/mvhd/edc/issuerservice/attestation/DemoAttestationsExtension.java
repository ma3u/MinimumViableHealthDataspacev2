package eu.mvhd.edc.issuerservice.attestation;

import org.eclipse.edc.issuerservice.spi.issuance.attestation.AttestationDefinitionValidatorRegistry;
import org.eclipse.edc.issuerservice.spi.issuance.attestation.AttestationSource;
import org.eclipse.edc.issuerservice.spi.issuance.attestation.AttestationSourceFactoryRegistry;
import org.eclipse.edc.runtime.metamodel.annotation.Extension;
import org.eclipse.edc.runtime.metamodel.annotation.Inject;
import org.eclipse.edc.spi.result.Result;
import org.eclipse.edc.spi.system.ServiceExtension;
import org.eclipse.edc.spi.system.ServiceExtensionContext;
import org.eclipse.edc.validator.spi.ValidationResult;
import org.eclipse.edc.validator.spi.Violation;

import java.time.Instant;
import java.util.Map;

/**
 * Registers the attestation types our seeds define (jad/seed-issuer-defs.sh,
 * scripts/seed-test-issuer.sh): "membership" for MembershipCredential,
 * "manufacturer" for data quality label credentials, and "purpose" for a
 * DataProcessingPurposeCredential (ADR-090). The Metaform JAD issuer carried
 * the first two; it has no licence, so this is written fresh against the
 * issuance SPI.
 * <p>
 * All attest unconditionally: every registered holder is a full member, and a
 * purpose definition attests the purpose its configuration names to any holder
 * that asks. That is a demo shortcut, as it was in JAD. A real deployment uses EDC's built-in
 * "database" attestation against a members table. This is the only code in the
 * launchers and the one exception to ADR-076 decision 1, pending its own ADR.
 */
@Extension(DemoAttestationsExtension.NAME)
public class DemoAttestationsExtension implements ServiceExtension {

    public static final String NAME = "Demo Attestations";
    public static final String MEMBERSHIP = "membership";
    public static final String MANUFACTURER = "manufacturer";
    public static final String PURPOSE = "purpose";
    private static final String DEFAULT_CONTRACT_VERSION = "1.0.0";

    @Inject
    private AttestationSourceFactoryRegistry factoryRegistry;

    @Inject
    private AttestationDefinitionValidatorRegistry validatorRegistry;

    @Override
    public String name() {
        return NAME;
    }

    @Override
    public void initialize(ServiceExtensionContext context) {
        validatorRegistry.registerValidator(MEMBERSHIP, definition -> ValidationResult.success());
        factoryRegistry.registerFactory(MEMBERSHIP, definition -> membership());
        validatorRegistry.registerValidator(MANUFACTURER, definition -> ValidationResult.success());
        factoryRegistry.registerFactory(MANUFACTURER, definition -> manufacturer(definition.getConfiguration()));
        validatorRegistry.registerValidator(PURPOSE, definition -> definition.getConfiguration().get(PURPOSE) instanceof String
                ? ValidationResult.success()
                : ValidationResult.failure(Violation.violation(
                        "a purpose attestation names its purpose in configuration.purpose", PURPOSE)));
        factoryRegistry.registerFactory(PURPOSE, definition -> purpose(definition.getConfiguration()));
    }

    static AttestationSource membership() {
        return context -> {
            var now = Instant.now().toString();
            return Result.success(Map.of(
                    "membership", Map.of("since", now),
                    "membershipType", "full-member",
                    "membershipStartDate", now,
                    "id", context.participantContextId()));
        };
    }

    static AttestationSource manufacturer(Map<String, Object> configuration) {
        return context -> Result.success(Map.of(
                "contractVersion", configuration.getOrDefault("contractVersion", DEFAULT_CONTRACT_VERSION),
                "component_types", "all",
                "since", Instant.now().toString(),
                "id", context.participantContextId()));
    }

    /**
     * The purpose the definition is configured with, and its legal basis: one
     * definition per purpose, e.g. "bonus-payout" for AlphaKasse DE's bonus
     * programme (#934 step 5).
     */
    static AttestationSource purpose(Map<String, Object> configuration) {
        return context -> Result.success(Map.of(
                PURPOSE, String.valueOf(configuration.get(PURPOSE)),
                "legalBasis", String.valueOf(configuration.getOrDefault("legalBasis", "")),
                "since", Instant.now().toString(),
                "id", context.participantContextId()));
    }
}
