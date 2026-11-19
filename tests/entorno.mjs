// Lee .env (si existe) y entrega la configuración del PROYECTO DE PRUEBA para las pruebas.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ENV = fileURLToPath(new URL("../.env", import.meta.url));
if (existsSync(ENV)) process.loadEnvFile(ENV);

export const cfg = {
  url: process.env.SUPABASE_URL || "",
  anon: process.env.SUPABASE_ANON_KEY || "",
  adminEmail: process.env.ADMIN_EMAIL || "",
  adminPass: process.env.ADMIN_PASSWORD || "",
};

export const configurado = /^https:\/\/[a-z0-9-]+\.supabase\.co$|^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(cfg.url)
  && cfg.anon.length > 40 && !!cfg.adminEmail && !!cfg.adminPass;

// Freno de seguridad: nunca usar la clave secreta (formato JWT antiguo o el nuevo sb_secret_…).
if (cfg.anon.startsWith("sb_secret_") || /service_role/.test(Buffer.from((cfg.anon.split(".")[1] || ""), "base64").toString())) {
  throw new Error("SUPABASE_ANON_KEY contiene la clave secreta (service_role). Use la anon/publishable key.");
}

const ALFA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function codigoMC() {
  let s = "MC-";
  for (let i = 0; i < 6; i++) s += ALFA[Math.floor(Math.random() * ALFA.length)];
  return s;
}

// Caso mínimo con la forma que envía el motor (regGuardar). Siempre marcado como prueba.
export function casoDePrueba(codigo, extra = {}) {
  return {
    id: codigo, f: new Date().toISOString(), fa: new Date().toISOString(), v: "7.9.7", prueba: true, min: 4,
    alertas: [["y", "Alerta de prueba"]],
    ent: { esp: "c", peso: 12.5, edad: "e2", sexo: "mc", hemo: "comp", hemoEf: "est", vac: ["aldia"], hxs: [], ex: { temp: "39.1" },
           motivo: "vom", motivo2: null, signs: ["vom"], signsAll: ["vom"], ans: { dur: "d1" } },
    sal: { top: [{ id: "gastritis", c: "GEN-DIG-001", n: "Gastritis aguda", sys: "dig", sc: 40 }], alta: ["GEN-DIG-001"], insuf: false, sinDx: false,
           soap: ["GEN-DIG-001"], soapAuto: true, faltan: [], qVis: 3, qPend: [] },
    ...extra,
  };
}
