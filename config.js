// Configuración del registro en línea del Motor Clínico HVCP.
// Copie aquí la URL del proyecto y la «anon public key» (Supabase → Project Settings → API).
// La anon key es pública por diseño: la seguridad la da Row Level Security en la base.
// NUNCA ponga aquí la «service_role key».
window.HVCP_CONFIG = {
  supabaseUrl: "https://TU-PROYECTO.supabase.co",
  supabaseAnonKey: "PEGUE-AQUI-LA-ANON-KEY"
};
