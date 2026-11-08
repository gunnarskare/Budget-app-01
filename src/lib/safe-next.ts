/** Tillat kun interne stier som omdirigeringsmål (hindrer åpen redirect). */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback = "/oversikt"): string {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") ? v : fallback;
}
