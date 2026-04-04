import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const EVO_URL = Deno.env.get("EVOLUTION_BASE_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const INSTANCE = "crm";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!EVO_URL || !EVO_KEY) {
    return new Response(JSON.stringify({ 
      error: "Configuração incompleta. Configure EVOLUTION_BASE_URL e EVOLUTION_API_KEY no painel do Supabase (Secrets)." 
    }), { status: 500, headers: cors });
  }

  // Limpar a URL base (remover barra final se existir)
  const baseUrl = EVO_URL.endsWith('/') ? EVO_URL.slice(0, -1) : EVO_URL;

  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  
  let target = "";
  let method = "GET";

  if (action === "init") {
    target = `${baseUrl}/instance/create`;
    method = "POST";
  } else if (action === "qr") {
    target = `${baseUrl}/instance/connect/${INSTANCE}`;
  } else if (action === "status") {
    target = `${baseUrl}/instance/connectionState/${INSTANCE}`;
  } else if (action === "logout") {
    target = `${baseUrl}/instance/logout/${INSTANCE}`;
    method = "DELETE";
  } else {
    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: cors });
  }

  try {
    console.log(`[WA-GATE] Chamando ${method} ${target}`);
    const res = await fetch(target, {
      method,
      headers: { 
        "apikey": EVO_KEY, 
        "Content-Type": "application/json" 
      },
      body: method === "POST" ? JSON.stringify({ instanceName: INSTANCE, qrcode: true }) : null
    });
    
    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { error: "Erro ao processar resposta do servidor" };
    }
    
    return new Response(JSON.stringify(data), { 
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" } 
    });
  } catch (e) {
    console.error("[WA-GATE] Erro:", e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: cors });
  }
});
