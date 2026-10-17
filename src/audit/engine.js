import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";

export const MODEL = "claude-opus-5-5";

export class EngineError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function engineReady(env) {
  return Boolean(env.ANTHROPIC_API_KEY) && env.LIVE_AUDITS !== "off";
}

export function apiModel(env, client) {
  const defaultHeaders = {};
  if (env.ANTHROPIC_WORKSPACE_ID) defaultHeaders["anthropic-workspace-id"] = env.ANTHROPIC_WORKSPACE_ID;
  const anthropic = client || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, defaultHeaders, maxRetries: 1, timeout: 180_000 });
  return async ({ system, user, schema, effort }) => {
    let response;
    try {
      response = await anthropic.beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort, format: betaZodOutputFormat(schema) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: user }],
      });
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw new EngineError("busy", "The team is busy. Try again in a minute.", 503);
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new EngineError("engine_off", "Live plans are paused.", 503);
      if (err instanceof Anthropic.APIError) throw new EngineError("upstream", "The model had a problem. Try again.", 502);
      throw new EngineError("upstream", "The model could not be reached. Try again.", 502);
    }
    if (response.stop_reason === "refusal") throw new EngineError("refused", "This site could not be planned.", 422);
    if (!response.parsed_output) throw new EngineError("incomplete", "A step came back incomplete. Try again.", 502);
    return response.parsed_output;
  };
}
