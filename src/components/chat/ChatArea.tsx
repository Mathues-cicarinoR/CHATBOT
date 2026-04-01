import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { format, isToday, isYesterday } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../../lib/utils';
import { User, Bot, Clock, Send, Loader2, MessageSquare } from 'lucide-react';

interface Message {
  id: number;
  session_id: string;
  message: {
    type: 'human' | 'ai';
    content: string;
  };
  hora_data_mensagem: string | null;
}

interface ChatAreaProps {
  leadId: string | null;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ leadId }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

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
      setLoading(true);
      const { data, error } = await supabase
        .from('n8n_chat_histories')
        .select('*')
        .eq('session_id', leadId)
        .order('id', { ascending: true }); // Usando id para garantir ordem se a data for nula

      if (error) {
        console.error('Error fetching messages:', error);
      } else {
        setMessages(data || []);
        scrollToBottom();
      }
      setLoading(false);
    };

    fetchMessages();

    // Realtime subscription
    const channel = supabase
      .channel('chat_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'n8n_chat_histories',
          filter: `session_id=eq.${leadId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          scrollToBottom();
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
      if (msg.hora_data_mensagem) {
        const date = new Date(msg.hora_data_mensagem);
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

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newMessage.trim() || !leadId || isSending) return;

    setIsSending(true);
    const messageContent = newMessage.trim();

    try {
      // 1. Persistir no Supabase para o histórico aparecer no CRM (Realtime fará o resto)
      const { error: supabaseError } = await supabase
        .from('n8n_chat_histories')
        .insert([{
          session_id: leadId,
          message: {
            type: 'ai',
            content: messageContent
          },
          hora_data_mensagem: new Date().toISOString()
        }]);

      if (supabaseError) throw supabaseError;

      // 2. Disparar para a Evolution API para o envio real via WhatsApp
      const response = await fetch(import.meta.env.VITE_EVOLUTION_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_EVOLUTION_API_KEY
        },
        body: JSON.stringify({
          number: leadId,
          text: messageContent
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Erro Evolution API:', errorData);
      }

      setNewMessage('');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setIsSending(false);
    }
  };

  if (!leadId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-zinc-50/50 dark:bg-zinc-900/50 p-10 text-center">
        <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6 shadow-sm border border-border transition-colors">
          <MessageSquare className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
        </div>
        <h2 className="text-xl font-bold mb-2">Sua Central de Mensagens</h2>
        <p className="text-zinc-500 max-w-sm text-sm">Selecione uma conversa ao lado para visualizar o histórico completo e iniciar um atendimento.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-zinc-950 transition-colors duration-200">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border flex items-center justify-between bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm border border-primary/10">
            {leadId?.[0]?.toUpperCase() || 'L'}
          </div>
          <div>
            <p className="font-bold text-sm tracking-tight">{leadId}</p>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <p className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">Ativo Agora</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Bar */}
      <div className="shrink-0 py-2 px-4 bg-zinc-50 dark:bg-zinc-900 border-b border-border flex items-center gap-2">
        <Bot className="w-4 h-4 text-primary" />
        <p className="text-[10px] text-zinc-500 italic">Intervenção Manual habilitada. Suas mensagens serão enviadas via Evolution API.</p>
      </div>

      {/* Messages */}
      <div 
        ref={viewportRef}
        className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar bg-zinc-50/20 dark:bg-zinc-950 transition-colors"
      >
        {loading && messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-zinc-400 font-medium uppercase tracking-widest">Sincronizando histórico...</p>
          </div>
        ) : (
          Object.entries(groupedMessages).map(([date, msgs]) => (
            <div key={date} className="space-y-6">
              <div className="flex justify-center sticky top-2 z-20">
                <span className="px-3 py-1 bg-white dark:bg-zinc-800 rounded-full text-[10px] font-bold text-zinc-400 dark:text-zinc-500 border border-border uppercase tracking-widest shadow-sm">
                  {date}
                </span>
              </div>

              {msgs.map((msg) => {
                const isAI = msg.message.type === 'ai';
                return (
                  <div 
                    key={msg.id} 
                    className={cn(
                      "flex flex-col max-w-[80%] group",
                      isAI ? "items-start" : "items-end ml-auto"
                    )}
                  >
                    <div className={cn(
                      "flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider",
                      isAI ? "text-zinc-400" : "text-primary/70"
                    )}>
                      {isAI ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
                      <span>{isAI ? 'Assistente AI' : 'Lead'}</span>
                    </div>

                    <div className={cn(
                      "p-4 rounded-2xl text-sm shadow-sm transition-all",
                      isAI 
                        ? "bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 border border-border rounded-tl-none hover:shadow-md" 
                        : "bg-primary text-white rounded-tr-none shadow-primary/10 hover:shadow-lg hover:shadow-primary/20"
                    )}>
                      {msg.message.content || 'Mensagem sem conteúdo'}
                    </div>
                    
                    <div className="flex items-center gap-1 mt-1.5 px-1">
                      <Clock className="w-2.5 h-2.5 text-zinc-300 dark:text-zinc-600" />
                      <p className="text-[10px] text-zinc-400 font-medium">
                        {msg.hora_data_mensagem ? format(new Date(msg.hora_data_mensagem), 'HH:mm', { locale: ptBR }) : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 p-4 border-t border-border bg-white dark:bg-zinc-950 transition-colors">
        <form 
          onSubmit={handleSendMessage}
          className={cn(
            "flex items-center gap-3 bg-zinc-100 dark:bg-zinc-900 p-2 pl-4 rounded-xl border border-transparent transition-all focus-within:border-primary/30 focus-within:ring-4 focus-within:ring-primary/5",
            isSending && "opacity-70 pointer-events-none"
          )}
        >
          <input 
            type="text" 
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            disabled={isSending}
            placeholder="Digite sua resposta aqui..."
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-zinc-400"
          />
          <button 
            type="submit"
            disabled={!newMessage.trim() || isSending}
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
              newMessage.trim() && !isSending 
                ? "bg-primary text-white shadow-lg shadow-primary/20 hover:scale-105 active:scale-95" 
                : "bg-zinc-200 dark:bg-zinc-800 text-zinc-400"
            )}
          >
            {isSending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

