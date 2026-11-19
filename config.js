// Configuración del registro en línea del Motor Clínico HVCP (proyecto de PRODUCCIÓN).
// URL del proyecto y «publishable key» (Supabase → Project Settings → API Keys).
// La publishable key es pública por diseño: la seguridad la da Row Level Security en la base.
// NUNCA ponga aquí la «secret» / «service_role key».
window.HVCP_CONFIG = {
  supabaseUrl: "https://bjvdjznnktgfweipeshn.supabase.co",
  supabaseAnonKey: "sb_publishable_ooAmdcK3QrobsHZiXufymA_gGhVmWmE"
};
