import "server-only";
import { aiCategorize, amountBand, buildAiCatalog, sanitizeForAi, AI_BATCH_SIZE, type AiInput, type AiOutput } from "@/lib/categorize/ai";
import { AUTO_THRESHOLD, type Catalog, type Suggestion } from "@/lib/categorize/engine";
import { cleanDescription, looksLikePersonalTransfer } from "@/lib/csv/clean";

export interface AiConfig {
  apiKey: string;
  model: string;
}

export function getAiConfig(): AiConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return { apiKey, model: process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini" };
}

const MAX_UNIQUE = 120;
const TOTAL_TIMEOUT_MS = 28_000;

export interface AiRowInput {
  index: number;
  description: string;
  amount: number;
  current: Suggestion;
}

/**
 * Spør AI kun om det motoren er usikker på. Personoverføringer (Vipps/giro) sendes aldri.
 * Returnerer forslag per radindeks. Feil/timeout gir tomt resultat – importen fortsetter uten AI.
 */
export async function suggestWithAi(
  rows: AiRowInput[],
  catalog: Catalog,
  config: AiConfig,
): Promise<{ results: Map<number, AiOutput>; error: string | null }> {
  const byKey = new Map<string, { input: AiInput; indexes: number[] }>();
  for (const r of rows) {
    if (r.current.confidence >= AUTO_THRESHOLD || r.current.source === "rule") continue;
    if (looksLikePersonalTransfer(r.description)) continue;
    const key = r.current.merchantKey;
    const existing = byKey.get(key);
    if (existing) {
      existing.indexes.push(r.index);
      continue;
    }
    const text = sanitizeForAi(cleanDescription(r.description).normalized);
    if (text.length < 3 || byKey.size >= MAX_UNIQUE) continue;
    byKey.set(key, {
      input: { id: `k${byKey.size}`, text, direction: r.amount > 0 ? "in" : "out", band: amountBand(r.amount) },
      indexes: [r.index],
    });
  }
  const groups = [...byKey.values()];
  if (groups.length === 0) return { results: new Map(), error: null };

  const aiCatalog = buildAiCatalog(catalog);
  const batches: Array<typeof groups> = [];
  for (let i = 0; i < groups.length; i += AI_BATCH_SIZE) batches.push(groups.slice(i, i + AI_BATCH_SIZE));

  const results = new Map<number, AiOutput>();
  let error: string | null = null;

  const deadline = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), TOTAL_TIMEOUT_MS));
  const work = Promise.all(
    batches.map(async (batch) => {
      try {
        const out = await aiCategorize(
          batch.map((g) => g.input),
          aiCatalog,
          { apiKey: config.apiKey, model: config.model, timeoutMs: 25_000 },
        );
        const byId = new Map(out.map((o) => [o.id, o]));
        for (const g of batch) {
          const hit = byId.get(g.input.id);
          if (hit) for (const idx of g.indexes) results.set(idx, hit);
        }
      } catch {
        error = "AI-tjenesten svarte ikke – usikre transaksjoner er sendt til manuell godkjenning.";
      }
    }),
  );
  const winner = await Promise.race([work, deadline]);
  if (winner === "timeout") error = "AI brukte for lang tid – usikre transaksjoner er sendt til manuell godkjenning.";
  return { results, error };
}
