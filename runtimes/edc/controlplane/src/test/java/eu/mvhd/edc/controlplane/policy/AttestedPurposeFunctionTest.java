package eu.mvhd.edc.controlplane.policy;

import org.eclipse.edc.connector.controlplane.contract.spi.policy.ContractNegotiationPolicyContext;
import org.eclipse.edc.connector.controlplane.contract.spi.types.agreement.ContractAgreement;
import org.eclipse.edc.connector.controlplane.contract.spi.types.agreement.ContractAgreementMessage;
import org.eclipse.edc.connector.controlplane.contract.spi.types.negotiation.ContractRequestMessage;
import org.eclipse.edc.connector.controlplane.contract.spi.types.offer.ContractOffer;
import org.eclipse.edc.controlplane.ProtocolRemoteMessage;
import org.eclipse.edc.iam.verifiablecredentials.spi.model.CredentialSubject;
import org.eclipse.edc.iam.verifiablecredentials.spi.model.Issuer;
import org.eclipse.edc.iam.verifiablecredentials.spi.model.VerifiableCredential;
import org.eclipse.edc.participant.spi.ParticipantAgent;
import org.eclipse.edc.policy.context.request.spi.RequestContractNegotiationPolicyContext;
import org.eclipse.edc.policy.model.Operator;
import org.eclipse.edc.policy.model.Permission;
import org.eclipse.edc.policy.model.Policy;
import org.eclipse.edc.protocol.spi.RequestContext;
import org.eclipse.edc.spi.iam.RequestScope;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ehds:attestedPurpose (ADR-090, #934 step 5): the bonus programme policy
 * admits a consumer whose DataProcessingPurposeCredential attests the bonus
 * payout, and refuses one that attests premium setting, or none. AlphaKasse DE
 * and the authority are fictional.
 */
class AttestedPurposeFunctionTest {

    private static final String BONUS = "bonus-payout";
    private static final String GA = "did:web:wellbeing-ga-issuer%3A10016:wellbeing-ga";

    private final AttestedPurposeFunction<ContractNegotiationPolicyContext> function = new AttestedPurposeFunction<>();
    private final Permission rule = Permission.Builder.newInstance().build();

    private static VerifiableCredential credential(String type, Map<String, Object> claims) {
        return VerifiableCredential.Builder.newInstance()
                .types(List.of("VerifiableCredential", type))
                .issuer(new Issuer(GA))
                .issuanceDate(Instant.parse("2026-11-11T00:00:00Z"))
                .credentialSubject(CredentialSubject.Builder.newInstance()
                        .id("did:web:identityhub%3A7083:alphakasse").claims(claims).build())
                .build();
    }

    private static VerifiableCredential purpose(String purpose) {
        return credential("DataProcessingPurposeCredential", Map.of("purpose", purpose, "legalBasis", "GDPR Art. 9(2)(a)"));
    }

    private static ContractNegotiationPolicyContext presenting(VerifiableCredential... credentials) {
        return new ContractNegotiationPolicyContext("alpha-klinik",
                new ParticipantAgent("did:web:identityhub%3A7083:alphakasse", Map.of("vc", List.of(credentials)), Map.of()));
    }

    @Test
    void admitsTheBonusPayout() {
        var context = presenting(credential("MembershipCredential", Map.of("membershipType", "full-member")), purpose(BONUS));
        assertTrue(function.evaluate(Operator.EQ, BONUS, rule, context));
        assertFalse(context.hasProblems());
    }

    @Test
    void refusesPremiumSettingAndSaysWhy() {
        var context = presenting(purpose("premium-setting"));
        assertFalse(function.evaluate(Operator.EQ, BONUS, rule, context));
        assertEquals(1, context.getProblems().size());
        assertTrue(context.getProblems().get(0).contains("[premium-setting]"), context.getProblems().get(0));
        assertTrue(context.getProblems().get(0).contains("[bonus-payout]"), context.getProblems().get(0));
    }

    @Test
    void refusesAConsumerThatPresentsNoPurpose() {
        var context = presenting(credential("MembershipCredential", Map.of("membershipType", "full-member")));
        assertFalse(function.evaluate(Operator.EQ, BONUS, rule, context));
        assertTrue(context.getProblems().get(0).contains("no DataProcessingPurposeCredential"));
    }

    @Test
    void refusesWhenNoCredentialsReachedThePolicy() {
        var context = new ContractNegotiationPolicyContext("alpha-klinik",
                new ParticipantAgent("did:web:identityhub%3A7083:alphakasse", Map.of(), Map.of()));
        assertFalse(function.evaluate(Operator.EQ, BONUS, rule, context));
    }

    @Test
    void aPurposeClaimOfAnotherCredentialTypeDoesNotCount() {
        var context = presenting(credential("MembershipCredential", Map.of("purpose", BONUS)));
        assertFalse(function.evaluate(Operator.EQ, BONUS, rule, context));
    }

    @Test
    void isAnyOfAdmitsOneOfTheListedPurposes() {
        var context = presenting(purpose(BONUS));
        assertTrue(function.evaluate(Operator.IS_ANY_OF, List.of("statistics", BONUS), rule, context));
        assertFalse(function.evaluate(Operator.IS_ANY_OF, List.of("statistics"), rule, presenting(purpose(BONUS))));
    }

    @Test
    void readsExpandedClaimsAndJsonLdValues() {
        var context = presenting(credential("https://w3id.org/ehds/DataProcessingPurposeCredential",
                Map.of("https://w3id.org/ehds/purpose", List.of(Map.of("@value", BONUS)))));
        assertEquals(Set.of(BONUS), AttestedPurposeFunction.attestedPurposes(context.participantAgent()));
        assertTrue(function.evaluate(Operator.EQ, Map.of("@value", BONUS), rule, context));
    }

    @Test
    void anOperatorThatCannotNameAPurposeIsRefused() {
        var context = presenting(purpose(BONUS));
        assertFalse(function.evaluate(Operator.NEQ, "premium-setting", rule, context));
        assertTrue(function.validate(Operator.NEQ, "premium-setting", rule).failed());
        assertTrue(function.validate(Operator.EQ, " ", rule).failed());
        assertTrue(function.validate(Operator.EQ, BONUS, rule).succeeded());
    }

    private static RequestContractNegotiationPolicyContext sending(ProtocolRemoteMessage message) {
        return new RequestContractNegotiationPolicyContext(
                RequestContext.Builder.newInstance().message(message).direction(RequestContext.Direction.Egress).build(),
                RequestScope.Builder.newInstance());
    }

    @Test
    void theConsumerAsksForItsPurposeCredentialOnlyForThisTerm() {
        var extractor = new AttestedPurposeScopeExtractor();
        var request = sending(ContractRequestMessage.Builder.newInstance().protocol("dsp").callbackAddress("http://consumer")
                .contractOffer(ContractOffer.Builder.newInstance().id("o-1").assetId("bonus-programme-answer")
                        .policy(Policy.Builder.newInstance().build()).build())
                .build());
        assertEquals(Set.of("org.eclipse.dspace.dcp.vc.type:DataProcessingPurposeCredential:read"),
                extractor.extractScopes(EhdsAttestedPurposeExtension.ATTESTED_PURPOSE, Operator.EQ, BONUS, request));
        assertEquals(Set.of(), extractor.extractScopes("https://w3id.org/ehds/purpose", Operator.EQ, BONUS, request));
    }

    @Test
    void theProviderSendingTheAgreementIsNotAskedForAPurpose() {
        // A provider holds no purpose credential; asking for one answered 401 on compose.
        var agreement = sending(ContractAgreementMessage.Builder.newInstance().protocol("dsp")
                .contractAgreement(ContractAgreement.Builder.newInstance().id("a-1").providerId("alpha-klinik")
                        .consumerId("alphakasse").assetId("bonus-programme-answer")
                        .policy(Policy.Builder.newInstance().build()).build())
                .build());
        assertEquals(Set.of(), new AttestedPurposeScopeExtractor()
                .extractScopes(EhdsAttestedPurposeExtension.ATTESTED_PURPOSE, Operator.EQ, BONUS, agreement));
    }
}
