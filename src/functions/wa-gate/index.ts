import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const EVO_URL = Deno.env.get("EVOLUTION_BASE_URL");
const EVO_KEY = Deno.env.get("EVOLUTION_API_KEY");
const INSTANCE = "CRM";

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
  } else if (action === "sync-chat") {
    target = `${baseUrl}/chat/findMessages/${INSTANCE}`;
    method = "POST";
  } else {
    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: cors });
  }

  try {
    console.log(`[WA-GATE] Action: ${action} | Method: ${method} | Target: ${target}`);
    
    let body = null;
    if (action === "init") {
      body = JSON.stringify({
        instanceName: INSTANCE,
        token: EVO_KEY, // Algumas versões da Evolution pedem o token aqui
        qrcode: true,
        syncFullHistory: true, // Ativa a sincronização de conversas antigas
        webhook: `https://lvgdsbybyeqjsllrhvtc.supabase.co/functions/v1/evolution-webhook`,
        events: [
          "MESSAGES_UPSERT",
          "MESSAGES_UPDATE",
          "MESSAGES_DELETE",
          "SEND_MESSAGE",
          "CONTACTS_UPSERT",
          "CONTACTS_UPDATE",
          "CHATS_UPSERT",
          "CHATS_UPDATE",
          "CONNECTION_UPDATE"
        ]
      });
    } else if (action === "sync-chat" && req.method === "POST") {
      const reqData = await req.json().catch(() => ({}));
      if (!reqData.remoteJid) {
        return new Response(JSON.stringify({ error: "remoteJid é obrigatório para sync-chat" }), { status: 400, headers: cors });
      }
      body = JSON.stringify({
        where: {
          remoteJid: reqData.remoteJid
        },
        take: reqData.take || 50
      });
    }

    const res = await fetch(target, {
      method,
      headers: { 
        "apikey": EVO_KEY, 
        "Content-Type": "application/json" 
      },
      body
    });
    
    // Se a instância não existe (404), tratamos como desconectado em vez de erro
    if (action === "status" && res.status === 404) {
      return new Response(JSON.stringify({ 
        instance: { status: "disconnected", message: "Instância precisa ser inicializada" } 
      }), { 
        status: 200, 
        headers: { ...cors, "Content-Type": "application/json" } 
      });
    }

    let data;
    try {
      data = await res.json();
    } catch (e) {
      data = { error: "Resposta inválida da Evolution API" };
    }

    // Normalização: Garante que o frontend sempre veja 'state' no nível superior
    // Independente se a Evolution retornou { instance: { state: 'open' } } ou { state: 'open' }
    const normalizedData = {
      ...data,
      state: data?.instance?.state || data?.state || (res.status === 404 ? "disconnected" : "unknown")
    };

    console.log(`[WA-GATE] Response normalized:`, normalizedData.state);

    return new Response(JSON.stringify(normalizedData), { 
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" } 
    });
  } catch (e) {
    console.error("[WA-GATE] Erro Crítico:", e.message);
    return new Response(JSON.stringify({ error: e.message, state: "error" }), { 
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" } 
    });
  }
});
