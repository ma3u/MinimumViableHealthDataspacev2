/**
 * EDC-V / CFM API client barrel export
 *
 * @example
 *   import { edcClient, EDC_CONTEXT } from '@/lib/edc';
 *
 *   // List catalog
 *   const catalog = await edcClient.management('/v5alpha/participants/{ctxId}/catalog/request', 'POST', {
 *     '@context': [EDC_CONTEXT],
 *     '@type': 'QuerySpec',
 *     counterPartyAddress: 'http://health-dataspace-controlplane:8082/api/dsp',
 *     protocol: 'dataspace-protocol-http',
 *   });
 */
export { edcClient, EDC_CONTEXT } from "./client";
export type { ApiName, RequestOptions } from "./client";
