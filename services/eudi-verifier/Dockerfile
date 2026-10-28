# The gate in front of the self-hosted EUDI verifier (ADR-066): nginx, run
# unprivileged, passing /wallet/* and nothing else. The image's entrypoint
# renders templates/*.template with envsubst, which fills VERIFIER_UPSTREAM.
FROM nginxinc/nginx-unprivileged:1.29.3-alpine
COPY gate.conf.template /etc/nginx/templates/default.conf.template
# The base image already runs as nginx (101); said here so scanners see it.
USER 101:101
EXPOSE 8081
