import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { User, Bot, Send, Loader2, MessageSquare, Trash2, UserCheck, ChevronLeft, Zap, Paperclip, FileText, Volume2, Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

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
  leadId: string | null;
  onBack?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ leadId, onBack }) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
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
        .from('n8n_chat_histories')
        .select('*')
        .eq('session_id', leadId)
        .order('id', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data || []);
        scrollToBottom();
      }
    };

    fetchMessages();

    const channel = supabase
      .channel('chat_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'n8n_chat_histories'
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newMessage = payload.new as Message;
            if (newMessage.session_id === leadId) {
              if (!newMessage.hora_data_mensagem && !newMessage.created_at) {
                newMessage.created_at = new Date().toISOString();
              }
              setMessages((prev) => [...prev, newMessage]);
              scrollToBottom();
            }
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [leadId]);

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { [key: string]: Message[] } = {};
    msgs.forEach((msg) => {
      let dateKey = 'Sem data';
      const rawDate = msg.hora_data_mensagem || msg.created_at || new Date().toISOString();
      if (rawDate) {
        const date = new Date(rawDate);
        if (isToday(date)) dateKey = 'Hoje';
        else if (isYesterday(date)) dateKey = 'Ontem';
        else dateKey = format(date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(msg);
    });
    return groups;
  };

  const groupedMessages = groupMessagesByDate(messages);

  const updateLeadStatus = async (status: string) => {
    if (!leadId) return;
    try {
      await supabase.from('Leads').update({ status }).eq('lead_id', leadId);
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
    }
  };

  const handleClearHistory = async () => {
    if (!leadId) return;
    if (!confirm('Tem certeza que deseja limpar todo o histórico desta conversa?')) return;
    setIsClearing(true);
    try {
      await supabase.from('n8n_chat_histories').delete().eq('session_id', leadId);
      setMessages([]);
    } catch (err) {
      console.error('Erro ao limpar histórico:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, content?: string, mediaData?: { url: string; type: string; name?: string }) => {
    if (e) e.preventDefault();
    const messageContent = content || newMessage;
    const hasMedia = !!mediaData;
    
    if (!messageContent.trim() && !hasMedia) return;
    if (!leadId || isSending) return;

    setIsSending(true);
    if (!content) setNewMessage('');
    setShowTemplates(false);

    try {
      const userName = user?.email?.split('@')[0] || 'Equipe';
      const mediaType = mediaData?.type as any;

      await supabase.from('n8n_chat_histories').insert([{
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
      }]);

      if (leadId.includes('@s.whatsapp.net')) {
        const baseUrl = (import.meta.env.VITE_EVOLUTION_API_URL || '').trim();
        const apiKey = (import.meta.env.VITE_EVOLUTION_API_KEY || '').trim();
        const instanceName = baseUrl.split('/').pop() || 'JEJE';
        const whatsappNumber = leadId.split('@')[0];

        if (hasMedia) {
          const mediaUrl = baseUrl.replace('/message/sendText', '/message/sendMedia');
          await fetch(`${mediaUrl}/${instanceName}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({
              number: whatsappNumber,
              media: mediaData.url,
              mediatype: mediaData.type === 'document' ? 'document' : mediaData.type,
              caption: messageContent,
              fileName: mediaData.name || 'arquivo'
            })
          });
        } else {
          await fetch(baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': apiKey },
            body: JSON.stringify({ number: whatsappNumber, instance: instanceName, text: messageContent })
          });
        }
      }
    } catch (err) {
      console.error('Erro ao enviar:', err);
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
      else if (file.type.startsWith('audio/')) mediaType = 'audio';

      await handleSendMessage(undefined, undefined, { 
        url: publicUrl, 
        type: mediaType, 
        name: file.name 
      });

    } catch (err) {
      console.error('Erro no upload:', err);
      alert("Erro ao enviar arquivo.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="md:hidden p-2 -ml-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-full transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm border border-primary/10">
            {leadId?.[0]?.toUpperCase() || 'L'}
          </div>
          <div>
            <p className="font-bold text-sm tracking-tight">{leadId}</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <select 
                onChange={(e) => updateLeadStatus(e.target.value)}
                className="text-[10px] bg-transparent text-zinc-400 font-medium uppercase tracking-wider outline-none cursor-pointer hover:text-primary transition-colors"
                defaultValue="novo"
              >
                <option value="novo">🔵 Novo</option>
                <option value="frio">❄️ Frio</option>
                <option value="quente">🔥 Quente</option>
                <option value="venda">💰 Venda</option>
              </select>
            </div>
          </div>
        </div>
        <button onClick={handleClearHistory} disabled={isClearing} className="p-2 text-zinc-400 hover:text-red-500 rounded-lg transition-all">
          {isClearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      <div ref={viewportRef} className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar bg-zinc-50/20 dark:bg-zinc-950">
        {Object.entries(groupedMessages).map(([date, msgs]) => (
          <div key={date} className="space-y-6">
            <div className="flex justify-center sticky top-2 z-20">
              <span className="px-3 py-1 bg-white dark:bg-zinc-800 rounded-full text-[10px] font-bold text-zinc-400 border border-border uppercase tracking-widest shadow-sm">{date}</span>
            </div>
            {msgs.map((msg) => {
              const isAI = msg.message.type === 'ai';
              const fromCRM = msg.message.from_crm;
              return (
                <div key={msg.id} className={cn("flex flex-col max-w-[80%] group", isAI ? "items-start" : "items-end ml-auto")}>
                  <div className={cn("flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider", isAI ? "text-zinc-400" : "text-primary/70")}>
                    {fromCRM ? <UserCheck className="w-3 h-3 text-primary" /> : (isAI ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />)}
                    <span>{fromCRM ? `${msg.message.sender_name || 'Equipe'} (CRM)` : (isAI ? 'Assistente AI' : 'Lead')}</span>
                  </div>
                  <div className={cn("p-4 rounded-2xl text-sm shadow-sm max-w-full overflow-hidden", isAI ? "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-border rounded-tl-none" : "bg-primary text-white rounded-tr-none")}>
                    {msg.message.media_url && (
                      <div className="mb-3 rounded-lg overflow-hidden bg-black/5 dark:bg-white/5">
                        {msg.message.media_type === 'image' && (
                          <img 
                            src={msg.message.media_url} 
                            alt="Mídia" 
                            className="max-w-full h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity" 
                            onClick={() => window.open(msg.message.media_url, '_blank')}
                          />
                        )}
                        {msg.message.media_type === 'audio' && (
                          <div className="p-2 flex items-center gap-3 min-w-[200px]">
                            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                              <Volume2 className="w-4 h-4 text-primary" />
                            </div>
                            <audio controls className="h-8 flex-1 text-primary">
                              <source src={msg.message.media_url} />
                            </audio>
                          </div>
                        )}
                        {(msg.message.media_type === 'document' || msg.message.media_type === 'application') && (
                          <div className="p-3 flex items-center gap-3 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
                            <div className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
                              <FileText className="w-6 h-6 text-zinc-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold truncate">{msg.message.file_name || 'Documento'}</p>
                              <a href={msg.message.media_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline flex items-center gap-1 mt-0.5">
                                <Download className="w-3 h-3" /> Baixar Arquivo
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap">{msg.message.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-4 bg-white dark:bg-zinc-950 flex flex-col gap-3">
        {showTemplates && (
          <div className="flex flex-wrap gap-2 mb-1 animate-in slide-in-from-bottom-2 duration-200">
            {templates.map((txt, idx) => (
              <button key={idx} onClick={() => handleSendMessage(undefined, txt)} className="text-xs px-3 py-1.5 bg-primary/5 dark:bg-primary/20 hover:bg-primary/10 dark:hover:bg-primary/30 text-primary border border-primary/20 rounded-full transition-all">
                {txt.length > 25 ? txt.substring(0, 25) + '...' : txt}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={(e) => handleSendMessage(e)} className="relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className={cn("p-1.5 transition-colors", isUploading ? "text-zinc-300" : "text-zinc-400 hover:text-primary")} title="Anexar arquivo">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>
            <button type="button" onClick={() => setShowTemplates(!showTemplates)} className={cn("p-1.5 transition-colors", showTemplates ? "text-primary" : "text-zinc-400 hover:text-primary")} title="Respostas rápidas"><Zap className="w-4 h-4" /></button>
          </div>
          <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder={isUploading ? "Carregando arquivo..." : "Digite sua mensagem..."} className="w-full pl-20 pr-12 py-3 bg-zinc-100 dark:bg-zinc-900 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-zinc-400" disabled={isSending || isUploading} />
          <button type="submit" disabled={(!newMessage.trim() && !isUploading) || isSending || isUploading} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-xl hover:bg-primary-hover disabled:opacity-50 disabled:grayscale transition-all shadow-lg shadow-primary/20">
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
};
