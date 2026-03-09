/**
 * EDC-V / CFM API client barrel export
 *
 * @example
 *   import { edcClient } from '@/lib/edc';
 *
 *   // List catalog
 *   const catalog = await edcClient.management('/v3/catalog/request', 'POST', {
 *     '@context': { '@vocab': 'https://w3id.org/edc/v0.0.1/ns/' },
 *     counterPartyAddress: 'http://cp.localhost/api/dsp',
 *     protocol: 'dataspace-protocol-http',
 *   });
 */
export { edcClient } from "./client";
export type { ApiName, RequestOptions } from "./client";
