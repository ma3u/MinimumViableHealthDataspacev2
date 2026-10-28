# `android/certificate-revocations.json`

`AndroidIntegrityConfig.revocationListResource` defaults to
`ClassPathResource("android/certificate-revocations.json")` and
`MakotoConfiguration` opens it eagerly while building the `makoto` bean, so the
context fails to start without it — but the mirror ships no resources at all.
This empty list is the minimum that lets the backend boot.

It is only the **additional** list. `MakotoConfiguration` registers
`AndroidRevocationList.GoogleDefaultLoaderConfig` alongside it, so Google's own
attestation-key revocation list is still consulted. Entries here would be extra
serials this deployment distrusts on top of Google's; a demo has none.

Setting `android.integrity.revocation-list-resource` to a real file overrides it.
