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

  const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
  if (WEBHOOK_SECRET && req.headers.get("apikey") !== WEBHOOK_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await req.json();
    console.log("Webhook received:", JSON.stringify(payload, null, 2));

    // 1. Encaminhar para o n8n
    const n8nUrl = "https://chatbot-n8n.pde4mi.easypanel.host/webhook/ed6608a6-96ea-41df-863d-70588cab8739";
    fetch(n8nUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    }).catch(err => console.error("Error forwarding to n8n:", err));

    const { event, data } = payload;

    // 2. Processar Sincronização de Contatos
    if (event === "contacts.upsert" || event === "CONTACTS_UPSERT") {
        const contacts = Array.isArray(data) ? data : [data];
        for (const contact of contacts) {
            const jid = contact.remoteJid || contact.id;
            if (!jid) continue;

            const { data: existing } = await supabase
                .from("Leads")
                .select("id, is_active")
                .eq("lead_id", jid)
                .maybeSingle();

            if (existing) {
                // Se o lead já existe, apenas atualizamos o nome e foto de perfil se disponíveis
                await supabase.from("Leads").update({
                    lead_nome: contact.pushName || contact.name || undefined,
                    profile_pic: contact.profilePicUrl || undefined
                }).eq("id", existing.id);
            } else {
                // Criação de novo lead vindo da sincronização
                await supabase.from("Leads").insert([{
                    lead_id: jid,
                    lead_nome: contact.pushName || contact.name || jid.split("@")[0],
                    profile_pic: contact.profilePicUrl || null,
                    status: "novo",
                    is_active: true
                }]);
            }
        }
        return new Response(JSON.stringify({ status: "contacts_processed" }), { headers: { "Content-Type": "application/json" } });
    }

    // 3. Processar Mensagens (MESSAGES_UPSERT)
    if (event !== "messages.upsert") {
      return new Response(JSON.stringify({ status: "ignored_event", event }), { headers: { "Content-Type": "application/json" } });
    }

    const messageData = data.message;
    if (!messageData) return new Response("No message data", { status: 400 });

    const key = data.key;
    const remoteJid = key.remoteJid;

    // Verificar se o Lead existe e se está ativo
    const { data: lead, error: leadError } = await supabase
      .from("Leads")
      .select("id, is_active")
      .eq("lead_id", remoteJid)
      .maybeSingle();

    if (leadError) console.error("Error fetching lead:", leadError);

    // Se o lead estiver marcado como INATIVO (Excluido no CRM), ignoramos a mensagem
    if (lead && lead.is_active === false) {
        console.log(`Lead ${remoteJid} is inactive (archived). Skipping message.`);
        return new Response("Inactive lead, ignoring", { status: 200 });
    }

    // Se for do bot (fromMe), processamos apenas para histórico, mas o CRM já insere. 
    // Para evitar duplicidade de mensagens "ai" enviadas pelo CRM:
    if (key.fromMe && messageData.extendedTextMessage?.text?.includes("Assistente AI")) {
        return new Response("Duplicate AI message from CRM, ignoring", { status: 200 });
    }

    // Extrair conteúdo e mídias
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
        mediaType = "document";
        fileName = messageData.documentMessage.fileName;
        mimetype = messageData.documentMessage.mimetype;
    }

    // Upsert Lead para garantir que ele exista e atualizar timestamp
    if (lead) {
      await supabase
        .from("Leads")
        .update({ last_message_at: new Date().toISOString() })
        .eq("id", lead.id);
    } else {
      await supabase.from("Leads").insert([{
          lead_id: remoteJid,
          lead_nome: data.pushName || remoteJid.split("@")[0],
          status: "novo",
          last_message_at: new Date().toISOString(),
          is_active: true
      }]);
    }

    // Processar Mídia com Base64 (mais resiliente)
    const base64Data = data.base64 || payload.base64; // Tenta pegar de 'data' ou da raiz
    
    if (mediaType && base64Data) {
        try {
            const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const ext = mimetype?.split("/")[1]?.split(";")[0] || "file";
            const path = `${remoteJid}/${Date.now()}.${ext}`;
            
            const { error: uploadError } = await supabase.storage
                .from("chat-media")
                .upload(path, buffer, { contentType: mimetype, upsert: true });
            
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage
                    .from("chat-media")
                    .getPublicUrl(path);
                mediaUrl = publicUrl;
                console.log("Media uploaded successfully:", mediaUrl);
            } else {
                console.error("Storage upload error details:", uploadError);
            }
        } catch (mediaErr) {
            console.error("Error decoding base64 media:", mediaErr);
        }
    }

    // Inserir no histórico de chat
    const { error: historyError } = await supabase.from("n8n_chat_histories").insert([
      {
        session_id: remoteJid,
        message: {
          type: key.fromMe ? "ai" : "human",
          content: content,
          media_url: mediaUrl,
          media_type: mediaType,
          file_name: fileName,
        },
        hora_data_mensagem: new Date().toISOString(),
      },
    ]);

    if (historyError) throw historyError;

    return new Response(JSON.stringify({ status: "success" }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
