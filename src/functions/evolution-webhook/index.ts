import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function processMessages(messages: any[]) {
    if (!messages || !messages.length) return;
    
    const CHUNK_SIZE = 50;
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE);
        const bulkData = [];

        for (const msg of chunk) {
            try {
                const messageData = msg.message || msg; 
                const key = msg.key || messageData.key;
                if (!key || !key.remoteJid) continue;

                const remoteJid = key.remoteJid;
                const actualMessage = messageData.message || messageData;
                
                let content = "";
                if (typeof actualMessage === 'string' && actualMessage.trim().length > 0) content = actualMessage;
                else if (actualMessage.conversation) content = actualMessage.conversation;
                else if (actualMessage.extendedTextMessage) content = actualMessage.extendedTextMessage.text || actualMessage.extendedTextMessage.caption;
                else if (actualMessage.imageMessage) content = actualMessage.imageMessage.caption || "[Imagem]";
                else if (actualMessage.audioMessage) content = "[Áudio]";
                else if (actualMessage.videoMessage) content = actualMessage.videoMessage.caption || "[Vídeo]";
                else if (actualMessage.documentMessage) content = actualMessage.documentMessage.fileName || "[Documento]";
                else if (actualMessage.stickerMessage) content = "[Figurinha]";
                else if (actualMessage.locationMessage) content = "[Localização]";
                else if (actualMessage.contactMessage) content = "[Contato]";

                if (!content || content === "[Mensagem]") continue;

                const timestamp = msg.messageTimestamp 
                    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() 
                    : new Date().toISOString();

                bulkData.push({
                    remote_jid: remoteJid,
                    push_name: msg.pushName || remoteJid.split("@")[0],
                    content: String(content).slice(0, 5000),
                    msg_id: key.id || `${remoteJid}_${timestamp}`,
                    is_from_me: !!key.fromMe,
                    timestamp: timestamp,
                    is_history: !!msg.messageTimestamp
                });
            } catch (e) {
                console.error(`[V21] Loop Error:`, e);
            }
        }

        if (bulkData.length) {
            // Chamada Turbo Bulk RPC (Processar lista inteira em uma transação)
            const { error: bulkError } = await supabase.rpc('upsert_messages_bulk_v21', {
                p_messages: bulkData
            });
            if (bulkError) console.error(`[V21] Bulk Error:`, bulkError);
            else console.log(`[V21] Salvo lote de ${bulkData.length} mensagens.`);
        }
    }
}

Deno.serve(async (req) => {
    try {
        const payload = await req.json();
        const { event, data } = payload;
        
        fetch("https://chatbot-n8n.pde4mi.easypanel.host/webhook/ed6608a6-96ea-41df-863d-70588cab8739", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        }).catch(() => {});

        if (event.includes("messages")) {
            const list = Array.isArray(data) ? data : (data?.messages || [data]);
            await processMessages(list);
        }
        
        return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});
