package main

import (
	"net/http"
	"os"
	"strings"

	"github.com/eclipse-cfm/cfm/agent/common/controlplane"
	"github.com/eclipse-cfm/cfm/assembly/httpclient"
	"github.com/eclipse-cfm/cfm/assembly/serviceapi"
	"github.com/eclipse-cfm/cfm/common/runtime"
	"github.com/eclipse-cfm/cfm/common/system"
	"github.com/eclipse-cfm/cfm/common/token"
	"github.com/eclipse-cfm/cfm/common/tokenexchange"
	"github.com/eclipse-cfm/cfm/pmanager/api"
	"github.com/eclipse-cfm/cfm/pmanager/natsagent"
)

// The launcher of eclipse-cfm's EDC-V agent (agent/orchestration/edcv/launcher
// at v0.0.7) with this module's processors. MVHD_AGENT picks the activity:
// "connector" (default, mvhdconnectoragent.env) or "identityhub"
// (mvhdidentityagent.env); one image, two containers.
const (
	identityHubURLKey   = "identityhub.url"
	credentialURLKey    = "identityhub.cs.url"
	protocolURLKey      = "controlplane.protocol.url"
	dataServiceURLKey   = "controlplane.dataservice.url"
	controlPlaneURLKey  = "controlplane.url"
	stsTokenURLKey      = "identityhub.sts.url"
	profilesKey         = "controlplane.profiles"
	tokenExchangeURLKey = "tokenexchange.url"
	tokenFilePathKey    = "tokenexchange.tokenFilePath"
	audienceKey         = "tokenexchange.audience"
)

func main() {
	if os.Getenv("MVHD_AGENT") == "identityhub" {
		launchIdentity()
		return
	}
	launchConnector()
}

func tokenProvider(ctx *natsagent.AgentContext, httpClient *http.Client) *token.CachingTokenProvider {
	return tokenexchange.NewCachingTokenExchangeProvider(ctx.Config.GetString(tokenFilePathKey),
		tokenexchange.WithTokenExchangeUrl(ctx.Config.GetString(tokenExchangeURLKey)),
		tokenexchange.WithTokenExchangeAudience(ctx.Config.GetString(audienceKey)),
		tokenexchange.WithHttpClient(httpClient))
}

func assemblies() []system.ServiceAssembly {
	return []system.ServiceAssembly{&httpclient.HttpClientServiceAssembly{}}
}

func launchIdentity() {
	natsagent.LaunchAgent(runtime.CreateSignalShutdownChan(), natsagent.LauncherConfig{
		AgentName:        "MVHD IdentityHub Agent",
		ServiceName:      "mvhd.agent.identityhub",
		ConfigPrefix:     "mvhdidentityagent",
		ActivityType:     IdentityActivityType,
		AssemblyProvider: assemblies,
		NewProcessor: func(ctx *natsagent.AgentContext) api.ActivityProcessor {
			httpClient := ctx.Registry.Resolve(serviceapi.HttpClientKey).(http.Client)
			c := IdentityConfig{
				CredentialServiceURL: ctx.Config.GetString(credentialURLKey),
				ProtocolURL:          ctx.Config.GetString(protocolURLKey),
				DataServiceURL:       ctx.Config.GetString(dataServiceURLKey),
			}
			ihURL := ctx.Config.GetString(identityHubURLKey)
			if err := runtime.CheckRequiredParams(identityHubURLKey, ihURL, credentialURLKey, c.CredentialServiceURL,
				protocolURLKey, c.ProtocolURL, dataServiceURLKey, c.DataServiceURL); err != nil {
				panic(err)
			}
			return IdentityProcessor{
				Monitor:     ctx.Monitor,
				IdentityHub: HTTPIdentityHub{BaseURL: ihURL, TokenProvider: tokenProvider(ctx, &httpClient), HTTPClient: &httpClient},
				Config:      c,
			}
		},
	})
}

func launchConnector() {
	natsagent.LaunchAgent(runtime.CreateSignalShutdownChan(), natsagent.LauncherConfig{
		AgentName:        "MVHD Connector Agent",
		ServiceName:      "mvhd.agent.connector",
		ConfigPrefix:     "mvhdconnectoragent",
		ActivityType:     ActivityType,
		AssemblyProvider: assemblies,
		NewProcessor: func(ctx *natsagent.AgentContext) api.ActivityProcessor {
			httpClient := ctx.Registry.Resolve(serviceapi.HttpClientKey).(http.Client)
			cpURL := ctx.Config.GetString(controlPlaneURLKey)
			stsURL := ctx.Config.GetString(stsTokenURLKey)
			if err := runtime.CheckRequiredParams(controlPlaneURLKey, cpURL, stsTokenURLKey, stsURL); err != nil {
				panic(err)
			}
			var profiles []string
			for _, p := range strings.Split(ctx.Config.GetString(profilesKey), ",") {
				if p = strings.TrimSpace(p); p != "" {
					profiles = append(profiles, p)
				}
			}
			return Processor{
				Monitor: ctx.Monitor,
				ControlPlane: controlplane.HttpManagementAPIClient{
					BaseURL:       cpURL,
					TokenProvider: tokenProvider(ctx, &httpClient),
					HttpClient:    &httpClient,
				},
				Config: Config{STSTokenURL: stsURL, DefaultProfiles: profiles},
			}
		},
	})
}
