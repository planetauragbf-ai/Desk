// Persistance de Planet'Dash : même principe que Planet'Stock —
// une ligne JSONB dans la table partagée app_state (clé dédiée),
// avec repli localStorage quand Supabase n'est pas configuré.
import { supabase } from "../lib/supabase";

const KEY = "pa-dash-v1";

export async function loadDash() {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("app_state")
        .select("value")
        .eq("key", KEY)
        .maybeSingle();
      if (!error && data?.value) return data.value;
    } catch (e) {
      console.warn("Planet'Dash : chargement cloud impossible", e);
    }
  }
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

let timer = null;
export function saveDash(value) {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch (e) {
    console.warn(e);
  }
  if (!supabase) return;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    try {
      const { error } = await supabase
        .from("app_state")
        .upsert({ key: KEY, value, updated_at: new Date().toISOString() });
      if (error) console.warn("Planet'Dash : sauvegarde cloud", error.message);
    } catch (e) {
      console.warn("Planet'Dash : sauvegarde cloud", e);
    }
  }, 600);
}
