# The hub's own CFM activity (ADR-085, #973), built like eclipse-cfm's agents
# (docker/Dockerfile.edcvagent.dockerfile at v0.0.7).
FROM --platform=$BUILDPLATFORM golang:1.26.10-alpine@sha256:87c65a688975c0b1d4585d204874c45ca78354670e3a5f11368c5a492303d696 AS builder
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -ldflags="-s -w" -o /out/mvhdconnectoragent .

FROM gcr.io/distroless/static-debian12:nonroot@sha256:afa5c872c891853ca7fcf1f12c3edb23f7eeef36189728842dd51042ff57f7ab
COPY --from=builder /out/mvhdconnectoragent /mvhdconnectoragent
USER 65532:65532
ENTRYPOINT ["/mvhdconnectoragent"]
