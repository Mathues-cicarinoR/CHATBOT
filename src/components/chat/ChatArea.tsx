import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { Send, Loader2, MessageSquare, Trash2, ChevronLeft, Zap, Paperclip, FileText, Edit3, Check, X, Mic } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { type Lead } from './LeadList';

interface Message {
  id: number;
  session_id: string;
  message: {
    type: 'human' | 'ai';
    content: string;
    from_crm?: boolean;
    sender_name?: string;
    media_url?: string;
    media_type?: 'image' | 'video' | 'audio' | 'document' | 'application';
    file_name?: string;
  };
  hora_data_mensagem: string | null;
  created_at?: string;
}

interface ChatAreaProps {
  lead: Lead | null;
  onBack?: () => void;
  onUpdate?: (newData: Partial<Lead>) => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ lead, onBack, onUpdate }) => {
  const leadId = lead?.lead_id || null;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(lead?.lead_nome || '');
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const templates = [
    "Olá! Como posso te ajudar hoje? 😊",
    "Seguem nossos planos e condições: ",
    "Vou verificar essa informação e já te retorno!",
    "Pode me confirmar seu e-mail, por favor?",
    "Agradecemos o seu contato! Qualquer dúvida estou aqui."
  ];

  const scrollToBottom = () => {
    setTimeout(() => {
      if (viewportRef.current) {
        viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      }
    }, 120);
  };

  useEffect(() => {
    if (!leadId) return;

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', leadId)
        .order('id', { ascending: true });
  
      if (error) {
        console.error('Error fetching messages:', error);
      } else if (data && data.length > 0) {
        setMessages(data);
        scrollToBottom();
      } else {
        // Se o banco retornar vazio, tenta sincronizar com a Evolution API
        await syncHistoricalMessages();
      }
    };
  
    const syncHistoricalMessages = async () => {
      if (!leadId || isSyncing) return;
      setIsSyncing(true);
      
      try {
        console.log(`[SYNC] Iniciando busca ativa para: ${leadId}`);
        
        // 1. Chamar Edge Function wa-gate para buscar mensagens na Evolution API
        const { data: response, error: invokeError } = await supabase.functions.invoke('wa-gate/sync-chat', {
          body: { remoteJid: leadId, take: 50 },
          method: 'POST'
        });
  
        if (invokeError) throw invokeError;
        
        // A Evolution API retorna a lista de mensagens no campo 'instance' ou diretamente
        const rawMessages = Array.isArray(response) ? response : (response?.messages || response?.data || []);
        
        if (!rawMessages.length) {
          console.log('[SYNC] Nenhuma mensagem encontrada na Evolution API.');
          setIsSyncing(false);
          return;
        }
  
        // 2. Normalizar as mensagens para o formato do banco (baseado no evolution-webhook/index.ts)
        const messagesToInsert = rawMessages.map((msg: any) => {
          const mBase = msg.message || {};
          const mContent = mBase.message || mBase;
          
          let content = "";
          if (typeof mContent === 'string') content = mContent;
          else if (mContent.conversation) content = mContent.conversation;
          else if (mContent.extendedTextMessage) content = mContent.extendedTextMessage.text || mContent.extendedTextMessage.caption;
          else if (mContent.imageMessage) content = mContent.imageMessage.caption || "[Imagem]";
          else if (mContent.videoMessage) content = mContent.videoMessage.caption || "[Vídeo]";
          else if (mContent.documentMessage) content = mContent.documentMessage.fileName || "[Documento]";
          else if (mContent.audioMessage) content = "[Áudio]";
          
          const timestamp = msg.messageTimestamp 
            ? new Date(Number(msg.messageTimestamp) * 1000).toISOString() 
            : new Date().toISOString();
  
          return {
            remote_jid: leadId,
            push_name: msg.pushName || leadId.split("@")[0],
            content: content || "[Mídia/Arquivo]",
            msg_id: msg.key?.id || `${leadId}_${timestamp}`,
            is_from_me: !!msg.key?.fromMe,
            timestamp: timestamp,
            is_history: true,
            // Campos adicionais esperados pela tabela chat_messages baseada no ChatArea.tsx
            session_id: leadId,
            message: {
              type: msg.key?.fromMe ? 'ai' : 'human',
              content: content || "[Mídia/Arquivo]",
              media_url: null, // O findMessages normalmente não traz a URL da mídia diretamente sem processamento adicional
              media_type: mContent.imageMessage ? 'image' : mContent.videoMessage ? 'video' : mContent.audioMessage ? 'audio' : mContent.documentMessage ? 'document' : null
            },
            hora_data_mensagem: timestamp
          };
        }).filter((m: any) => m.content);
  
        // 3. Persistir no banco usando a RPC já configurada no projeto
        if (messagesToInsert.length > 0) {
          console.log(`[SYNC] Salvando ${messagesToInsert.length} mensagens via RPC...`);
          const { error: rpcError } = await supabase.rpc('upsert_messages_bulk_v21', {
            p_messages: messagesToInsert
          });
  
          if (rpcError) throw rpcError;
  
          // 4. Buscar novamente do banco para garantir que temos os IDs e ordenação corretos
          const { data: finalMessages } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', leadId)
            .order('id', { ascending: true });
  
          setMessages(finalMessages || []);
          scrollToBottom();
        }
      } catch (err) {
        console.error('[SYNC] Erro na sincronização ativa:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    fetchMessages();

    // Canal global de mensagens para estabilidade
    const channel = supabase
      .channel('public_chat_room')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.session_id === leadId) {
            setMessages((prev) => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              const updated = [...prev, newMsg];
              return updated.sort((a, b) => a.id - b.id);
            });
            scrollToBottom();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    msgs.forEach((msg) => {
      let dateKey = 'Sem data';
      const rawDate = msg.hora_data_mensagem || msg.created_at || new Date().toISOString();
      const date = new Date(rawDate);
      if (isToday(date)) dateKey = 'Hoje';
      else if (isYesterday(date)) dateKey = 'Ontem';
      else dateKey = format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const groupedMessages = groupMessagesByDate(messages);

  const updateLeadStatus = async (status: string) => {
    if (!leadId) return;
    try {
      const { error } = await supabase.from('Leads').update({ status }).eq('id', lead?.id);
      if (error) throw error;
      if (onUpdate) onUpdate({ status });
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  const handleClearHistory = async () => {
    if (!leadId) return;
    if (!confirm('Tem certeza que deseja limpar todo o histórico desta conversa?')) return;
    setIsClearing(true);
    try {
      await supabase.from('chat_messages').delete().eq('session_id', leadId);
      setMessages([]);
    } catch (err) {
      console.error('Erro ao limpar histórico:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, content?: string, mediaData?: { url: string; type: string; name?: string; mimetype?: string }) => {
    if (e) e.preventDefault();
    const messageContent = content || newMessage;
    const hasMedia = !!mediaData;

    if (!messageContent.trim() && !hasMedia) return;
    if (!leadId || isSending) return;

    setIsSending(true);
    if (!content) setNewMessage('');
    setShowTemplates(false);

    console.log('Iniciando envio:', { messageContent, hasMedia, mediaData });

    try {
      const userName = user?.email?.split('@')[0] || 'Equipe';
      const mediaType = mediaData?.type as any;

      // Inserção no Banco de Dados
      const { data: inserted, error: dbError } = await supabase.from('chat_messages').insert([{
        session_id: leadId,
        message: {
          type: 'ai',
          content: messageContent,
          from_crm: true,
          sender_name: userName,
          media_url: mediaData?.url,
          media_type: mediaType,
          file_name: mediaData?.name
        },
        hora_data_mensagem: new Date().toISOString()
      }]).select();

      if (dbError) {
        console.error('Erro no Supabase:', dbError);
      } else if (inserted) {
        // Atualização imediata da UI para evitar sensação de travamento
        setMessages(prev => {
          if (prev.some(m => m.id === inserted[0].id)) return prev;
          return [...prev, inserted[0]].sort((a, b) => a.id - b.id);
        });
        scrollToBottom();
      }

      // Envio para Evolution API
      if (leadId.includes('@s.whatsapp.net')) {
        const baseUrl = (import.meta.env.VITE_EVOLUTION_API_URL || '').trim();
        const apiKey = (import.meta.env.VITE_EVOLUTION_API_KEY || '').trim();
        const instanceName = baseUrl.split('/').pop() || 'JEJE';
        const whatsappNumber = leadId.split('@')[0];
        const apiBaseUrl = baseUrl.split('/message/')[0];

        if (hasMedia) {
          const mediaType = mediaData.type;
          const mimetype = mediaData.mimetype || (mediaType === 'image' ? 'image/png' : 'application/pdf');

          if (mediaType === 'audio') {
            // Revertendo para o endpoint sendWhatsAppAudio que funciona na sua versão
            const audioEndpoint = `${apiBaseUrl}/message/sendWhatsAppAudio/${instanceName}`;
            const payload = {
              number: whatsappNumber,
              audio: mediaData.url,
              delay: 1200
            };
            console.log('Enviando Áudio (PTT):', { audioEndpoint, payload });

            const response = await fetch(audioEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify(payload)
            });
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error('Erro Evolution Áudio:', errorData);
            }
          } else {
            const mediaEndpoint = `${apiBaseUrl}/message/sendMedia/${instanceName}`;
            const payload = {
              number: whatsappNumber,
              media: mediaData.url,
              mediatype: mediaType === 'document' ? 'document' : mediaType,
              caption: messageContent,
              fileName: mediaData.name || 'arquivo',
              mimetype: mimetype
            };
            console.log('Enviando Mídia:', { mediaEndpoint, payload });

            const response = await fetch(mediaEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
              body: JSON.stringify(payload)
            });
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              console.error('Erro Evolution Mídia:', errorData);
              // Caso o sendMedia falhe em versões específicas, tentamos uma alternativa simplificada ou alertamos
            }
          }
        } else {
          await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: whatsappNumber, instance: instanceName, text: messageContent })
          });
        }
      }
    } catch (err) {
      console.error('Erro no envio API:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !leadId) return;

    if (file.size > 50 * 1024 * 1024) {
      alert("Arquivo muito grande! O limite é 50MB.");
      return;
    }

    console.log('Iniciando upload de arquivo:', { name: file.name, type: file.type, size: file.size });

    if (file.size > 50 * 1024 * 1024) {
      alert("Arquivo muito grande! O limite é 50MB.");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${leadId}/${fileName}`;

      const { error } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      let mediaType: 'image' | 'video' | 'audio' | 'document' = 'document';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/') || file.name.endsWith('.ogg') || file.name.endsWith('.webm') || file.name.endsWith('.mp3') || file.name.endsWith('.m4a') || file.name.endsWith('.wav')) mediaType = 'audio';

      console.log('Arquivo carregado no Storage:', { publicUrl, mediaType });

      await handleSendMessage(undefined, undefined, {
        url: publicUrl,
        type: mediaType,
        name: file.name,
        mimetype: file.type
      });

    } catch (err) {
      console.error('Erro no upload storage:', err);
      alert("Erro ao subir arquivo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };


  useEffect(() => {
    setEditedName(lead?.lead_nome || '');
    setIsEditingName(false);
  }, [lead]);

  const handleUpdateName = async () => {
    if (!lead || !editedName.trim() || isUpdatingName) return;
    setIsUpdatingName(true);
    try {
      const { error } = await supabase
        .from('Leads')
        .update({ lead_nome: editedName })
        .eq('id', lead?.id);

      if (error) throw error;
      if (lead) lead.lead_nome = editedName; // Atualização otimista
      if (onUpdate) onUpdate({ lead_nome: editedName });
      setIsEditingName(false);
    } catch (err) {
      console.error('Erro ao atualizar nome:', err);
      alert('Erro ao atualizar nome.');
    } finally {
      setIsUpdatingName(false);
    }
  };

  if (!leadId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50/50 dark:bg-zinc-900/50 p-10 text-center">
        <MessageSquare className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mb-6" />
        <h2 className="text-xl font-bold mb-2">Sua Central de Mensagens</h2>
        <p className="text-zinc-500 max-w-sm text-sm">Selecione uma conversa ao lado para iniciar um atendimento.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-950 transition-colors duration-200">
      <div className="h-16 border-b border-border flex items-center justify-between px-4 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3 overflow-hidden">
          {onBack && (
            <button onClick={onBack} className="md:hidden p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm border border-primary/10 shrink-0">
            {(lead?.lead_nome?.[0] || leadId?.[0])?.toUpperCase() || 'L'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="text"
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-sm font-bold outline-none focus:ring-2 focus:ring-primary/20 w-full"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateName()}
                  />
                  <button onClick={handleUpdateName} disabled={isUpdatingName} className="p-1 text-green-500 hover:bg-green-50 rounded">
                    {isUpdatingName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </button>
                  <button onClick={() => setIsEditingName(false)} className="p-1 text-red-500 hover:bg-red-50 rounded">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <>
                  <p className="font-bold text-sm tracking-tight truncate dark:text-white">
                    {lead?.lead_nome || leadId}
                  </p>
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="p-1 text-zinc-400 hover:text-primary transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <p className="text-[10px] text-zinc-400 truncate max-w-[150px]">{leadId}</p>
              <span className="text-zinc-300 dark:text-zinc-700 mx-0.5">•</span>
              <select
                value={lead?.status || 'novo'}
                onChange={(e) => updateLeadStatus(e.target.value)}
                className="text-[10px] bg-transparent text-zinc-400 font-medium uppercase tracking-wider outline-none cursor-pointer hover:text-primary transition-colors"
              >
                <option value="novo">🔵 Novo</option>
                <option value="frio">❄️ Frio</option>
                <option value="quente">🔥 Quente</option>
                <option value="venda">💰 Venda</option>
              </select>
            </div>
          </div>
        </div>
        <button onClick={handleClearHistory} disabled={isClearing} className="p-2 text-zinc-400 hover:text-red-500 rounded-lg transition-all shrink-0">
          {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      <div 
        ref={viewportRef} 
        className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar"
        style={{ 
          backgroundImage: `url('https://w0.peakpx.com/wallpaper/580/630/HD-wallpaper-whatsapp-aesthetic-dark-green-thumbnail.jpg')`,
          backgroundBlendMode: 'overlay',
          backgroundColor: 'rgba(11, 20, 26, 0.95)'
        }}
      >
        {isSyncing && (
          <div className="flex flex-col items-center justify-center py-8 space-y-3 bg-black/10 rounded-lg animate-pulse">
            <Loader2 className="w-6 h-6 text-wa-teal animate-spin" />
            <p className="text-xs text-wa-text-muted font-medium">Buscando mensagens antigas...</p>
          </div>
        )}
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date} className="space-y-4">
            <div className="flex justify-center sticky top-0 z-20 py-2">
              <span className="px-3 py-1 bg-[#182229] rounded-lg text-[11px] font-medium text-wa-text-muted shadow-sm uppercase tracking-wide border border-wa-border/30">
                {date}
              </span>
            </div>
            {msgs.map((msg) => {
              const isSentByMe = msg.message.type === 'ai' || msg.message.from_crm;

              return (
                <div key={msg.id} className={cn("flex w-full mb-2", isSentByMe ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "relative max-w-[65%] px-3 py-2 rounded-lg shadow-sm whitespace-pre-wrap text-[14.2px] leading-relaxed",
                    isSentByMe 
                      ? "bg-wa-bubble-out text-wa-text rounded-tr-none" 
                      : "bg-wa-bubble-in text-wa-text rounded-tl-none"
                  )}>
                    {/* Tail */}
                    <div className={cn(
                      "absolute top-0 w-3 h-3",
                      isSentByMe 
                        ? "-right-2 bg-wa-bubble-out [clip-path:polygon(0_0,0_100%,100%_0)]" 
                        : "-left-2 bg-wa-bubble-in [clip-path:polygon(0_0,100%_0,100%_100%)]"
                    )} />

                    {msg.message.media_url && (
                      <div className="mb-2 rounded-md overflow-hidden bg-black/20">
                        {msg.message.media_type === 'image' && (
                          <img
                            src={msg.message.media_url}
                            alt="Mídia"
                            className="max-w-full h-auto object-contain cursor-pointer"
                            onClick={() => window.open(msg.message.media_url, '_blank')}
                          />
                        )}
                        {msg.message.media_type === 'audio' && (
                           <audio controls className="w-full h-8 scale-90 origin-left">
                             <source src={msg.message.media_url} />
                           </audio>
                        )}
                        {msg.message.media_type === 'document' && (
                          <div className="p-3 flex items-center gap-3 bg-[#111b21]/40">
                             <FileText className="w-8 h-8 text-wa-text-muted" />
                             <div className="flex-1 min-w-0">
                               <p className="text-xs font-medium truncate">{msg.message.file_name || 'Documento'}</p>
                               <a href={msg.message.media_url} target="_blank" className="text-[10px] text-wa-teal hover:underline">Baixar</a>
                             </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-end justify-between gap-4">
                      <span>{msg.message.content}</span>
                      <div className="flex items-center gap-1 shrink-0 pb-0.5">
                        <span className="text-[10px] text-wa-text-muted uppercase">
                          {msg.hora_data_mensagem ? format(new Date(msg.hora_data_mensagem), 'HH:mm') : ''}
                        </span>
                        {isSentByMe && (
                          <div className="flex text-wa-teal">
                            <Check className="w-3.5 h-3.5 -mr-1.5" />
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-2.5 bg-wa-sidebar flex flex-col gap-2 relative">
        {showTemplates && (
          <div className="flex flex-wrap gap-2 mb-2 p-2 bg-wa-bg rounded-lg border border-wa-border">
            {templates.map((txt, idx) => (
              <button key={idx} onClick={() => handleSendMessage(undefined, txt)} className="text-[13px] px-3 py-1.5 bg-wa-sidebar-hover text-wa-teal rounded-full transition-all border border-wa-teal/20">
                {txt.length > 30 ? txt.substring(0, 30) + '...' : txt}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={(e) => handleSendMessage(e)} className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 text-wa-text-muted hover:text-wa-text">
               <Paperclip className="w-6 h-6" />
            </button>
            <button type="button" onClick={() => setShowTemplates(!showTemplates)} className={cn("p-2", showTemplates ? "text-wa-teal" : "text-wa-text-muted hover:text-wa-teal")}>
               <Zap className="w-6 h-6" />
            </button>
          </div>

          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite uma mensagem"
            className="flex-1 px-4 py-2.5 bg-wa-bg border-none rounded-lg text-sm text-wa-text focus:ring-0 outline-none placeholder:text-wa-text-muted"
            disabled={isSending || isUploading}
          />

          <div className="flex items-center">
            {newMessage.trim() || isUploading ? (
              <button type="submit" disabled={isSending} className="p-2 text-wa-teal">
                {isSending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
              </button>
            ) : (
              <button type="button" className="p-2 text-wa-text-muted">
                <Mic className="w-6 h-6" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
