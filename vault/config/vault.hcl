# vault/config/vault.hcl
# Vault server configuration — file backend (persistent across restarts)

ui = true

listener "tcp" {
  address     = "0.0.0.0:8200"
  tls_disable = true # TLS terminated by Traefik in local dev; enable for prod
}

storage "file" {
  path = "/vault/data"
}

# Allow longer lease TTLs for EDC-V JWT tokens
max_lease_ttl     = "87600h" # 10 years
default_lease_ttl = "768h"   # 32 days

# Log level
log_level = "info"
