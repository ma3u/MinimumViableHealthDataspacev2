# Local compose Vault: file storage on a named volume, so participant signing
# keys and STS client secrets survive a container restart. `vault server -dev`
# is in-memory and lost every one of them on 2026-09-24 (docs/gotchas.md).
# The vault-unseal sidecar initialises on first start and unseals on every
# start, with scripts/vault-init-or-unseal.sh, the same script the Azure
# deployment uses. Dev-grade: one unseal share, kept beside the data.
storage "file" {
  path = "/vault/file"
}
listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = 1
}
api_addr     = "http://0.0.0.0:8200"
ui           = false
disable_mlock = true
