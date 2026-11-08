import { unstable_rethrow } from "next/navigation";

/** Standard svar fra Server Actions: enten ok med data, eller en feilmelding til brukeren. */
export type ActionResult<T extends object = Record<never, never>> = ({ ok: true } & T) | { ok: false; error: string };

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * Kjører en action og gjør uventede feil om til en vennlig melding.
 * Logger kun navn og feilkode – aldri beskrivelser, beløp eller rader.
 */
export async function safe<T extends object = Record<never, never>>(
  name: string,
  fn: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // redirect() og notFound() skal passere
    const code = typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "unknown";
    console.error(`[action:${name}] feilet (${code})`);
    if (e instanceof UserError) return fail(e.message);
    return fail("Noe gikk galt. Prøv igjen.");
  }
}

/** Feil med en melding som er trygg å vise til brukeren. */
export class UserError extends Error {}
