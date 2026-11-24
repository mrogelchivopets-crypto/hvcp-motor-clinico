// Carrera de la entrada anónima (sin Supabase: se simula la autenticación).
// El inicio de la página y el primer envío de la cola pueden pedir la sesión al mismo tiempo; debe haber
// una sola entrada anónima, para que la sesión de uso y el caso queden en el mismo usuario.
import { test, expect } from "@playwright/test";

test("dos pedidos simultáneos de sesión hacen una sola entrada anónima", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.route("**/config.js", (r) => r.fulfill({ contentType: "text/javascript",
    body: 'window.HVCP_CONFIG={supabaseUrl:"https://TU-PROYECTO.supabase.co",supabaseAnonKey:"PEGUE-AQUI-LA-ANON-KEY"};' }));
  const page = await ctx.newPage();
  await page.goto("/index.html");
  const r = await page.evaluate(async () => {
    let actual = null, entradas = 0;
    const espera = (ms) => new Promise((s) => setTimeout(s, ms));
    REG.uid = null; REG.sesion = "sesion-vieja";
    REG.sb = { auth: {
      getSession: async () => { await espera(30); return { data: { session: actual } }; },
      signInAnonymously: async () => { entradas++; await espera(80); actual = { user: { id: "anon-" + entradas } }; return { data: { session: actual }, error: null }; },
    } };
    const ok = await Promise.all([regSesionLista(), regSesionLista(), regSesionLista()]);
    const primera = { entradas, ok, uid: REG.uid };
    // Si después cambia el usuario (p. ej. entra el admin), la sesión de uso anterior se descarta.
    REG.sesion = "sesion-de-anon-1"; actual = { user: { id: "otro" } };
    await regSesionLista();
    return { ...primera, sesionTrasCambio: REG.sesion, uidTrasCambio: REG.uid };
  });
  expect(r.entradas).toBe(1);
  expect(r.ok).toEqual([true, true, true]);
  expect(r.uid).toBe("anon-1");
  expect(r.uidTrasCambio).toBe("otro");
  expect(r.sesionTrasCambio).toBeNull();
  await ctx.close();
});
