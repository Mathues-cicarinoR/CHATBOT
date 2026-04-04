import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const findBase64 = (obj: any): string | null => {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.base64 && typeof obj.base64 === 'string') return obj.base64;
    for (const key in obj) {
        const result = findBase64(obj[key]);
        if (result) return result;
    }
    return null;
};

// Processamento em Lote de Mensagens (V6 - Focado em ativos)
async function processBulkMessages(messages: any[]) {
    if (!messages.length) return;
    const histories = [];
    const leadUpdates = new Map();

    for (const msg of messages) {
        const { key, message: messageData, pushName } = msg;
        if (!key || !messageData) continue;
        const remoteJid = key.remoteJid;
        let content = "";
        if (messageData.conversation) content = messageData.conversation;
        else if (messageData.extendedTextMessage) content = messageData.extendedTextMessage.text;
        else if (messageData.imageMessage) content = messageData.imageMessage.caption || "[Imagem]";
        else if (messageData.audioMessage) content = "[Áudio]";
        else if (messageData.videoMessage) content = messageData.videoMessage.caption || "[Vídeo]";
        else if (messageData.documentMessage) content = messageData.documentMessage.fileName || "[Documento]";
        else if (messageData.documentWithCaptionMessage) content = messageData.documentWithCaptionMessage.message.documentMessage.caption || "[Documento]";

        histories.push({
            session_id: remoteJid,
            message: { type: key.fromMe ? "ai" : "human", content: content },
            hora_data_mensagem: new Date().toISOString()
        });

        // SOMENTE mensagens atualizam o last_message_at
        leadUpdates.set(remoteJid, {
            lead_id: remoteJid,
            lead_nome: pushName || remoteJid.split("@")[0],
            last_message_at: new Date().toISOString(),
            is_active: true
        });
    }

    if (histories.length) await supabase.from("n8n_chat_histories").insert(histories);
    const leadsToUpsert = Array.from(leadUpdates.values());
    if (leadsToUpsert.length) await supabase.from("Leads").upsert(leadsToUpsert, { onConflict: 'lead_id', ignoreDuplicates: false });
}

// Processa um único contato (SEM last_message_at)
async function processContact(contact: any) {
    const jid = contact.remoteJid || contact.id;
    if (!jid) return;
    // IMPORTANTE: Não definimos last_message_at aqui para não "poluir" a lista com quem não tem conversa
    await supabase.from("Leads").upsert({
        lead_id: jid,
        lead_nome: contact.pushName || contact.name || jid.split("@")[0],
        profile_pic: contact.profilePicUrl || null,
        is_active: true
    }, { onConflict: 'lead_id' });
}

async function processSingleMessage(msgPayload: any, rootPayload: any = {}) {
    const { key, message: messageData, pushName } = msgPayload;
    if (!key || !messageData) return;
    const remoteJid = key.remoteJid;
    const { data: lead } = await supabase.from("Leads").select("id, is_active").eq("lead_id", remoteJid).maybeSingle();
    if (lead && lead.is_active === false) return;

    let content = "";
    let mediaUrl = null;
    let mediaType = null;
    let fileName = null;
    let mimetype = null;

    if (messageData.conversation) content = messageData.conversation;
    else if (messageData.extendedTextMessage) content = messageData.extendedTextMessage.text;
    else if (messageData.imageMessage) { content = messageData.imageMessage.caption || ""; mediaType = "image"; mimetype = messageData.imageMessage.mimetype; }
    else if (messageData.audioMessage) { mediaType = "audio"; mimetype = messageData.audioMessage.mimetype; }
    else if (messageData.videoMessage) { content = messageData.videoMessage.caption || ""; mediaType = "video"; mimetype = messageData.videoMessage.mimetype; }
    else if (messageData.documentMessage) { mediaType = "document"; fileName = messageData.documentMessage.fileName; mimetype = messageData.documentMessage.mimetype; }
    else if (messageData.documentWithCaptionMessage) { 
        const doc = messageData.documentWithCaptionMessage.message.documentMessage;
        content = doc.caption || ""; mediaType = "document"; fileName = doc.fileName; mimetype = doc.mimetype; 
    }

    await supabase.from("Leads").upsert({
        lead_id: remoteJid,
        lead_nome: pushName || remoteJid.split("@")[0],
        last_message_at: new Date().toISOString(),
        is_active: true
    }, { onConflict: 'lead_id' });

    let base64Data = rootPayload.base64 || msgPayload.base64 || findBase64(messageData);
    if (mediaType && base64Data) {
        try {
            if (base64Data.includes(',')) base64Data = base64Data.split(',')[1];
            const buffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
            const ext = mimetype?.split("/")[1]?.split(";")[0] || "file";
            const path = `${remoteJid}/${Date.now()}.${ext}`;
            const { error: uploadError } = await supabase.storage.from("chat-media").upload(path, buffer, { contentType: mimetype, upsert: true });
            if (!uploadError) {
                const { data: { publicUrl } } = supabase.storage.from("chat-media").getPublicUrl(path);
                mediaUrl = publicUrl;
            }
        } catch (e) { console.error("Media error:", e); }
    }

    await supabase.from("n8n_chat_histories").insert([{
        session_id: remoteJid,
        message: { type: key.fromMe ? "ai" : "human", content: content, media_url: mediaUrl, media_type: mediaType, file_name: fileName },
        hora_data_mensagem: new Date().toISOString()
    }]);
}

Deno.serve(async (req) => {
    const { method } = req;
    if (method === "OPTIONS") return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
    const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");
    if (WEBHOOK_SECRET && req.headers.get("apikey") !== WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });

    try {
        const payload = await req.json();
        const { event, data } = payload;
        const n8nUrl = "https://chatbot-n8n.pde4mi.easypanel.host/webhook/ed6608a6-96ea-41df-863d-70588cab8739";
        fetch(n8nUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});

        if (event.includes("contacts")) {
            const contacts = Array.isArray(data) ? data : [data];
            for (const c of contacts) await processContact(c);
        } else if (event === "messages.upsert" || event === "MESSAGES_UPSERT") {
            await processSingleMessage(data, payload);
        } else if (event === "messages.set" || event === "MESSAGES_SET") {
            const messages = Array.isArray(data) ? data : [data];
            await processBulkMessages(messages);
        } else if (event.includes("chats.set")) {
            const chats = Array.isArray(data) ? data : [data];
            // CHATS_SET apenas ativa o lead, NÃO define last_message_at
            const updates = chats.map(c => ({ lead_id: c.id, is_active: true }));
            await supabase.from("Leads").upsert(updates, { onConflict: 'lead_id' });
        }
        return new Response(JSON.stringify({ status: "processed" }), { headers: { "Content-Type": "application/json" } });
    } catch (error) {
        console.error("Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
