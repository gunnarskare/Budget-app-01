import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TAXONOMY, subKey } from "@/lib/categories/defaults";

/** Oppretter standard kategorisystem for brukeren (idempotent). */
export async function seedDefaultCategories(supabase: SupabaseClient, userId: string): Promise<void> {
  const catRows = DEFAULT_TAXONOMY.map((c, i) => ({
    user_id: userId,
    system_key: c.key,
    name: c.name,
    icon: c.icon,
    color: c.color,
    kind: c.kind,
    sort_order: i * 10,
  }));
  const { error: catErr } = await supabase
    .from("categories")
    .upsert(catRows, { onConflict: "user_id,system_key", ignoreDuplicates: true });
  if (catErr) throw new Error("Kunne ikke opprette kategorier");

  const { data: cats, error: readErr } = await supabase.from("categories").select("id, system_key").not("system_key", "is", null);
  if (readErr || !cats) throw new Error("Kunne ikke lese kategorier");
  const idByKey = new Map((cats as Array<{ id: string; system_key: string }>).map((c) => [c.system_key, c.id]));

  const subRows = DEFAULT_TAXONOMY.flatMap((c) =>
    c.subs.map((s, i) => ({
      user_id: userId,
      category_id: idByKey.get(c.key),
      system_key: subKey(c.key, s.key),
      name: s.name,
      is_saving: !!s.saving,
      sort_order: i * 10,
    })),
  ).filter((r) => r.category_id);

  const { error: subErr } = await supabase
    .from("subcategories")
    .upsert(subRows, { onConflict: "user_id,system_key", ignoreDuplicates: true });
  if (subErr) throw new Error("Kunne ikke opprette underkategorier");
}
