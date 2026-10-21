// PerData - retired mirror.
// This function used to serve a full copy of the terminal and its data APIs with
// no plan checks, which bypassed the paid tier. The app now lives on Vercel only;
// every request is sent there. Deploy with: supabase functions deploy macro-explorer
const APP_URL = (Deno.env.get("APP_URL") || "https://perdata.site").replace(/\/+$/, "");

Deno.serve((req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/macro-explorer/, "").replace(/^\/macro-explorer/, "");
  if (path.startsWith("/api/")) {
    return new Response(JSON.stringify({ error: "Este endpoint fue retirado. Usa " + APP_URL }), {
      status: 410,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }
  return Response.redirect(APP_URL + (path === "/" ? "/explorer" : path || "/explorer") + url.search, 301);
});
