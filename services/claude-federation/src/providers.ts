/**
 * Where an analysis is actually run.
 *
 * Three paths, and which one is used is a data protection decision before it is
 * a technical one:
 *
 * | Provider    | Pays      | Data leaves the EU | Limit          |
 * | ----------- | --------- | ------------------ | -------------- |
 * | `azure`     | operator  | no, EU data zone   | daily quota    |
 * | `anthropic` | operator  | yes, United States | daily quota    |
 * | user's own  | the user  | wherever they point | none, not here |
 *
 * Azure is the default because it is the only provider-paid option that keeps
 * special category data inside the EU data zone. ADR-033 chose it for exactly
 * that, and issue #187 moved the deployments off `GlobalStandard`, which gives
 * no EU-only guarantee, for exactly that.
 *
 * The user's own configuration never reaches this file. When someone brings
 * their own endpoint the phone calls it directly, so their key is never posted
 * to this service and their values are never seen by it. That is both better
 * for them and less for this service to protect, and it is why "bring your own"
 * has no quota: nothing here is being spent.
 */
import { SYSTEM_PROMPT, renderValues, type SharedValue } from "./analyse.js";

export type ProviderName = "azure" | "anthropic";

export interface ProviderReply {
  text: string;
  model: string;
  provider: ProviderName;
}

export interface Provider {
  readonly name: ProviderName;
  readonly model: string;
  /** True when values stay inside the EU data zone. */
  readonly euResident: boolean;
  analyse(values: SharedValue[], question: string): Promise<ProviderReply>;
}

function userContent(values: SharedValue[], question: string): string {
  return [
    renderValues(values),
    "",
    question || "Please explain these values.",
  ].join("\n");
}

/**
 * Azure OpenAI, authenticated by the workload's managed identity.
 *
 * No API key: the same identity that federates to Anthropic holds the
 * `Cognitive Services OpenAI User` role, so there is no Azure key to store or
 * rotate either. The deployment must be `DataZoneStandard`; `GlobalStandard`
 * would undo the only reason this is the default.
 */
export class AzureProvider implements Provider {
  readonly name = "azure" as const;
  readonly euResident = true;

  constructor(
    readonly model: string,
    private readonly endpoint: string,
    private readonly token: () => Promise<string>,
    private readonly apiVersion = "2024-10-21",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async analyse(
    values: SharedValue[],
    question: string,
  ): Promise<ProviderReply> {
    const url =
      `${this.endpoint.replace(/\/$/, "")}/openai/deployments/${this.model}` +
      `/chat/completions?api-version=${this.apiVersion}`;

    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await this.token()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent(values, question) },
        ],
        max_completion_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `azure returned HTTP ${response.status}: ${(
          await response.text().catch(() => "")
        ).slice(0, 300)}`,
      );
    }
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return {
      text: payload.choices?.[0]?.message?.content ?? "",
      model: this.model,
      provider: this.name,
    };
  }
}

/** Anthropic, reached with a federated token. Opt-in, and outside the EU. */
export class AnthropicProvider implements Provider {
  readonly name = "anthropic" as const;
  readonly euResident = false;

  constructor(
    readonly model: string,
    private readonly token: () => Promise<string>,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async analyse(
    values: SharedValue[],
    question: string,
  ): Promise<ProviderReply> {
    const response = await this.fetchImpl(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${await this.token()}`,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1500,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent(values, question) }],
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `anthropic returned HTTP ${response.status}: ${(
          await response.text().catch(() => "")
        ).slice(0, 300)}`,
      );
    }
    const message = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    return {
      text: (message.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("\n"),
      model: this.model,
      provider: this.name,
    };
  }
}
