import { z } from "zod";

const size = z.enum(["small", "medium", "large"]);

export const NotesSchema = z.object({
  company: z.object({
    name: z.string(),
    what_they_do: z.string(),
    customers: z.string(),
    how_they_sell: z.string(),
    size_hints: z.string(),
  }),
  signals: z.array(z.object({
    observation: z.string(),
    quote: z.string().describe("Copied exactly from one page"),
    page: z.number().int().describe("The page number, like 2 for [P2]"),
  })),
  tools: z.array(z.object({ name: z.string(), quote: z.string(), page: z.number().int() })),
});

export const PlanSchema = z.object({
  headline: z.string(),
  opportunities: z.array(z.object({
    title: z.string(),
    problem: z.string(),
    signals: z.array(z.number().int()),
    approach: z.string(),
    measure: z.object({ metric: z.string(), baseline: z.string(), target: z.string() }),
    effort: size,
    impact: size,
    days_30: z.string(),
    days_60: z.string(),
    days_90: z.string(),
  })),
});

export const CheckSchema = z.object({
  reviews: z.array(z.object({
    opportunity: z.number().int(),
    confidence: z.enum(["high", "medium", "low"]),
    assumption: z.string(),
    ask: z.string(),
    keep: z.boolean(),
  })),
  caveat: z.string(),
  questions: z.array(z.string()),
});

export function jsonSchema(schema) {
  return z.toJSONSchema(schema, { target: "draft-7" });
}
