import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function processMessages(messages: any[]) {
    if (!messages || !messages.length) return;
    
    console.log(`[V22] Processando lote de ${messages.length} mensagens.`);
    const CHUNK_SIZE = 50;
    
    for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
        const chunk = messages.slice(i, i + CHUNK_SIZE);
        const bulkData = [];

        for (const msg of chunk) {
            try {
                // Normalização robusta para Evolution v2
                const key = msg.key;
                if (!key || !key.remoteJid) continue;

                // Tenta encontrar o conteúdo da mensagem em múltiplos níveis (Evolution v2 nested structure)
                const mBase = msg.message || {};
                const mContent = mBase.message || mBase; // lida com dupla profundidade do Histórico

                let content = "";
                
                // 1. Texto simples ou conversão
                if (typeof mContent === 'string' && mContent.length > 0) content = mContent;
                else if (mContent.conversation) content = mContent.conversation;
                else if (mContent.extendedTextMessage) content = mContent.extendedTextMessage.text || mContent.extendedTextMessage.caption;
                
                // 2. Mídias (Fotos, Vídeos, Documentos)
                else if (mContent.imageMessage) content = mContent.imageMessage.caption || "[Imagem]";
                else if (mContent.videoMessage) content = mContent.videoMessage.caption || "[Vídeo]";
                else if (mContent.documentMessage) content = mContent.documentMessage.fileName || mContent.documentMessage.caption || "[Documento]";
                else if (mContent.documentWithCaptionMessage) content = mContent.documentWithCaptionMessage.message?.documentMessage?.fileName || "[Documento]";
                
                // 3. Especiais (Áudio, Sticker, Localização)
                else if (mContent.audioMessage) content = "[Áudio]";
                else if (mContent.stickerMessage) content = "[Figurinha]";
                else if (mContent.locationMessage) content = "[Localização]";
                else if (mContent.contactMessage) content = "[Contato]"; e
                else if (mContent.protocolMessage) continue; // Ignorar mensagens de sistema/deletadas

                // Fallback: Se não encontrou nada mas existe um objeto de mensagem, marca como mídia genérica
                if (!content && Object.keys(mContent).length > 0) content = "[Arquivo/Mídia]";

                // Se ainda estiver vazio (ex: mensagem de sistema pura), ignora para evitar Ghosts
                if (!content || content.trim() === "") continue;

                const timestamp = msg.messageTimestamp 
                    ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() 
                    : new Date().toISOString();

                bulkData.push({
                    remote_jid: key.remoteJid,
                    push_name: msg.pushName || key.remoteJid.split("@")[0],
                    content: String(content).slice(0, 5000),
                    msg_id: key.id || `${key.remoteJid}_${timestamp}`,
                    is_from_me: !!key.fromMe,
                    timestamp: timestamp,
                    is_history: !!msg.messageTimestamp
                });
            } catch (e) {
                console.error(`[V22] Erro no Loop:`, e);
            }
        }

        if (bulkData.length) {
            const { error: bulkError } = await supabase.rpc('upsert_messages_bulk_v21', {
                p_messages: bulkData
            });
            if (bulkError) console.error(`[V22] Erro no Banco:`, bulkError);
            else console.log(`[V22] Sucesso: Salvo lote de ${bulkData.length} mensagens.`);
        } else {
            console.log(`[V22] Lote ignorado (apenas mensagens de sistema ou vazias).`);
        }
    }
}

Deno.serve(async (req) => {
    try {
        const payload = await req.json();
        const { event, data } = payload;
        
        // n8n Pass-through
        fetch("https://chatbot-n8n.pde4mi.easypanel.host/webhook/ed6608a6-96ea-41df-863d-70588cab8739", { 
            method: "POST", 
            headers: { "Content-Type": "application/json" }, 
            body: JSON.stringify(payload) 
        }).catch(() => {});

        if (event && event.includes("messages")) {
            // Em MESSAGES_SET, data.messages é o array. Em UPSERT, data é o objeto/array.
            const list = Array.isArray(data) ? data : (data?.messages || [data]);
            await processMessages(list);
        }
        
        return new Response(JSON.stringify({ status: "ok" }), { headers: { "Content-Type": "application/json" } });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
});
