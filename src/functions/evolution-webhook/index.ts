import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function processBulkMessages(messages: any[]) {
    if (!messages.length) return;
    const CHUNK_SIZE = 50;
    
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE);
        const histories = [];
        const leadUpdates = new Map();

        for (const msg of chunk) {
            try {
                const messageData = msg.message || msg; 
                const key = msg.key || messageData.key;
                if (!key || !key.remoteJid) continue;

                const remoteJid = key.remoteJid;
                const actualMessage = messageData.message || messageData;
                
                let content = "";
                if (typeof actualMessage === 'string') content = actualMessage;
                else if (actualMessage.conversation) content = actualMessage.conversation;
                else if (actualMessage.extendedTextMessage) content = actualMessage.extendedTextMessage.text || actualMessage.extendedTextMessage.caption;
                else if (actualMessage.imageMessage) content = actualMessage.imageMessage.caption || "[Imagem]";
                else if (actualMessage.audioMessage) content = "[Áudio]";
                else if (actualMessage.videoMessage) content = actualMessage.videoMessage.caption || "[Vídeo]";
                else if (actualMessage.documentMessage) content = actualMessage.documentMessage.fileName || "[Documento]";
                else if (actualMessage.protocolMessage) continue; // Ignorar mensagens de protocolo
                
                // Content Fallback: Garantir que NENHUMA mensagem seja ignorada
                if (!content) {
                    if (actualMessage.stickerMessage) content = "[Figurinha]";
                    else if (actualMessage.locationMessage) content = "[Localização]";
                    else if (actualMessage.contactMessage) content = "[Contato]";
                    else content = "[Mensagem]";
                }

                const messageTimestamp = msg.messageTimestamp 
                    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() 
                    : new Date().toISOString();

                histories.push({
                    session_id: remoteJid,
                    message: { 
                        type: key.fromMe ? "ai" : "human", 
                        content: String(content).slice(0, 5000),
                        is_history: true,
                        msg_id: key.id
                    },
                    hora_data_mensagem: messageTimestamp
                });

                leadUpdates.set(remoteJid, {
                    lead_id: remoteJid,
                    lead_nome: msg.pushName || remoteJid.split("@")[0],
                    last_message_at: messageTimestamp,
                    is_active: true
                });
            } catch (e) {
                console.error(`[V13] Parse Error:`, e);
            }
        }

        if (histories.length) {
            // Upsert para evitar erro de violação de restrição se houver retry
            await supabase.from("n8n_chat_histories").upsert(histories, { onConflict: undefined });
        }

        const leadsToUpsert = Array.from(leadUpdates.values());
        if (leadsToUpsert.length) {
            await supabase.from("Leads").upsert(leadsToUpsert, { onConflict: 'lead_id' });
        }
    }
    console.log(`[V13] Processamento bulk finalizado com sucesso.`);
}

async function processSingleMessage(msgPayload: any) {
    const { key, message: messageData, pushName, messageTimestamp } = msgPayload;
    if (!key || !messageData) return;
    const remoteJid = key.remoteJid;

    let content = "";
    if (messageData.conversation) content = messageData.conversation;
    else if (messageData.extendedTextMessage) content = messageData.extendedTextMessage.text;
    else if (messageData.imageMessage) content = messageData.imageMessage.caption || "[Imagem]";
    else if (messageData.audioMessage) content = "[Áudio]";
    else content = "[Mensagem]";

    const ts = messageTimestamp ? new Date(Number(messageTimestamp) * 1000).toISOString() : new Date().toISOString();

    await supabase.from("Leads").upsert({
        lead_id: remoteJid,
        lead_nome: pushName || remoteJid.split("@")[0],
        last_message_at: ts,
        is_active: true
    }, { onConflict: 'lead_id' });

    await supabase.from("n8n_chat_histories").insert([{
        session_id: remoteJid,
        message: { type: key.fromMe ? "ai" : "human", content: content },
        hora_data_mensagem: ts
    }]);
}

Deno.serve(async (req) => {
    try {
        const payload = await req.json();
        const { event, data } = payload;
        
        // n8n
        fetch("https://chatbot-n8n.pde4mi.easypanel.host/webhook/ed6608a6-96ea-41df-863d-70588cab8739", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        }).catch(() => {});

        if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
            await processSingleMessage(data);
        } else if (event === "messages.set" || event === "MESSAGES_SET") {
            const list = Array.isArray(data) ? data : (data?.messages || [data]);
            console.log(`[V13] Iniciando processamento de ${list.length} itens do histórico.`);
            await processBulkMessages(list);
        } else if (event.includes("contacts")) {
            const contacts = Array.isArray(data) ? data : [data];
            for (const c of contacts) {
                const jid = c.remoteJid || c.id;
                if (jid) await supabase.from("Leads").upsert({ lead_id: jid, lead_nome: c.pushName || c.name || jid.split("@")[0], is_active: true }, { onConflict: 'lead_id' });
            }
        }
        return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        console.error(`[V13] Erro:`, e);
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});
