import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const { method } = req;

  if (method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  // Opcional: Validar API Key se configurada no Supabase Secrets (WEBHOOK_SECRET)
  const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
  if (WEBHOOK_SECRET && req.headers.get("apikey") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    // Encaminhar para o n8n em segundo plano (não trava o processamento do CRM)
    const n8nUrl = "https://chatbot-n8n.pde4mi.easypanel.host/webhook/ed6608a6-96ea-41df-863d-70588cab8739";
    fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).catch(err => console.error("Error forwarding to n8n:", err));

    const { event, data, instance } = payload;


    // Apenas processamos mensagens recebidas (upsert)
    if (event !== "messages.upsert") {
      return new Response(JSON.stringify({ status: "ignored_event", event }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const messageData = data.message;
    if (!messageData) return new Response("No message data", { status: 400 });

    const key = data.key;
    const isFromMe = key.fromMe;
    const remoteJid = key.remoteJid;

    // Se for do próprio bot/CRM (fromMe), ignoramos para evitar duplicidade 
    // ou processamos se desejar histórico de saída (mas o CRM já insere ao enviar)
    if (isFromMe) {
        return new Response("From me, ignoring", { status: 200 });
    }

    // Extrair conteúdo da mensagem
    let content = "";
    let mediaUrl = null;
    let mediaType = null;
    let fileName = null;
    let mimetype = null;

    if (messageData.conversation) {
      content = messageData.conversation;
    } else if (messageData.extendedTextMessage) {
      content = messageData.extendedTextMessage.text;
    } else if (messageData.imageMessage) {
      content = messageData.imageMessage.caption || "";
      mediaType = "image";
      mimetype = messageData.imageMessage.mimetype;
    } else if (messageData.audioMessage) {
      content = "";
      mediaType = "audio";
      mimetype = messageData.audioMessage.mimetype;
    } else if (messageData.videoMessage) {
      content = messageData.videoMessage.caption || "";
      mediaType = "video";
      mimetype = messageData.videoMessage.mimetype;
    } else if (messageData.documentWithCaptionMessage) {
        const doc = messageData.documentWithCaptionMessage.message.documentMessage;
        content = doc.caption || "";
        mediaType = "document";
        fileName = doc.fileName;
        mimetype = doc.mimetype;
    } else if (messageData.documentMessage) {
        content = "";
        mediaType = "document";
        fileName = messageData.documentMessage.fileName;
        mimetype = messageData.documentMessage.mimetype;
    }

    // Atualizar ou Criar o Lead
    const { data: lead, error: leadError } = await supabase
      .from("Leads")
      .select("id, lead_nome")
      .eq("lead_id", remoteJid)
      .maybeSingle();

    if (leadError) console.error("Error fetching lead:", leadError);

    // Atualizar data da última mensagem
    if (lead) {
      await supabase
        .from("Leads")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", lead.id);
    } else {
      // Cria novo lead se não existir
      await supabase.from("Leads").insert([
        {
          lead_id: remoteJid,
          lead_nome: data.pushName || remoteJid.split("@")[0],
          status: "novo",
          last_message_at: new Date().toISOString(),
        },
      ]);
    }

    // Processar Mídia se existir
    if (mediaType && (payload.data.base64 || payload.data.message)) {
        // Se a Evolution API enviou o arquivo (base64 ou link interno)
        // OBS: Ideal configurar Evolution para enviar link ou usar o ID da mensagem para baixar
        // Para simplificar, vamos tentar extrair o que vier.
        
        // Se quisermos baixar o arquivo da Evolution API, precisaríamos da API KEY e URL
        // Como o usuário quer salvar, e no momento o webhook pode vir sem o arquivo binário direto,
        // o ideal é que a Evolution API esteja configurada com 'webhook_by_base64: true'.
        
        if (payload.data.base64) {
            const buffer = Uint8Array.from(atob(payload.data.base64), c => c.charCodeAt(0));
            const ext = mimetype?.split("/")[1] || "file";
            const path = `${remoteJid}/${Date.now()}.${ext}`;
            
            const { error: uploadError } = await supabase.storage
                .from("chat-media")
                .upload(path, buffer, { contentType: mimetype });
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from("chat-media")
                    .getPublicUrl(path);
                mediaUrl = publicUrl;
            } else {
                console.error("Storage upload error:", uploadError);
            }
        }
    }

    // Inserir no histórico de chat
    const { error: historyError } = await supabase.from("n8n_chat_histories").insert([
      {
        session_id: remoteJid,
        message: {
          type: "human",
          content: content,
          media_url: mediaUrl,
          media_type: mediaType,
          file_name: fileName,
        },
        hora_data_mensagem: new Date().toISOString(),
      },
    ]);

    if (historyError) throw historyError;

    return new Response(JSON.stringify({ status: "success" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
