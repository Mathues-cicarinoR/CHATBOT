import React, { useEffect, useState } from 'react';
import { Search, User, Plus, X, Check, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface Lead {
  id: number;
  lead_nome: string;
  lead_id: string;
  created_at: string;
  last_message_at: string;
  status: string;
  is_active: boolean;
  profile_pic?: string;
  last_message_content?: string;
  unread_count?: number;
}

interface LeadListProps {
  selectedLeadId: string | null;
  onSelectLead: (lead: Lead | null) => void;
  refreshTrigger?: number;
}

export const LeadList: React.FC<LeadListProps> = ({ selectedLeadId, onSelectLead, refreshTrigger }) => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isAddingLead, setIsAddingLead] = useState(false);
  const [newLeadName, setNewLeadName] = useState('');
  const [newLeadPhone, setNewLeadPhone] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('active_leads_view')
      .select('*')
      .eq('is_active', true)
      .order('last_message_at', { ascending: false });

    if (error) {
      console.error('Error fetching leads:', error);
    } else {
      setLeads(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads();

    // Inscrição Realtime para atualizações automáticas na lista (Sincronização)
    const channel = supabase
      .channel('sidebar-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Leads' },
        (payload) => {
          console.log('Realtime Lead Update:', payload);
          fetchLeads();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        (payload) => {
          console.log('Realtime Message Update:', payload);
          fetchLeads();
        }
      )
      .subscribe((status) => {
        console.log('Realtime Subscription Status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshTrigger]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadPhone.trim() || isCreating) return;

    setIsCreating(true);
    try {
      // Limpar o número e formatar como JID
      const cleanPhone = newLeadPhone.replace(/\D/g, '');
      const jid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

      // Verificar se o lead já existe (mesmo inativo)
      const { data: existing } = await supabase
        .from('Leads')
        .select('*')
        .eq('lead_id', jid)
        .maybeSingle();

      if (existing) {
        // Reativar o lead
        const { data, error } = await supabase
          .from('Leads')
          .update({
            lead_nome: newLeadName,
            is_active: true,
            last_message_at: new Date().toISOString()
          })
          .eq('id', existing.id)
          .select();

        if (error) throw error;
        await fetchLeads();
        onSelectLead(data?.[0] || existing);
      } else {
        // Criar novo
        const { data, error } = await supabase
          .from('Leads')
          .insert([{
            lead_nome: newLeadName,
            lead_id: jid,
            status: 'novo',
            last_message_at: new Date().toISOString(),
            is_active: true
          }])
          .select();

        if (error) throw error;
        await fetchLeads();
        if (data?.[0]) onSelectLead(data[0]);
      }

      setIsAddingLead(false);
      setNewLeadName('');
      setNewLeadPhone('');
    } catch (err) {
      console.error('Erro ao criar/reativar lead:', err);
      alert('Erro ao processar contato.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteLead = async (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!confirm(`Tem certeza que deseja ocultar a conversa com ${lead.lead_nome || lead.lead_id}? Ela só voltará se você buscá-la novamente.`)) return;

    try {
      // Remoção otimista da UI
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      if (selectedLeadId === lead.lead_id) {
        onSelectLead(null);
      }

      // Marcar como inativo no banco (Exclusão Lógica)
      const { error } = await supabase
        .from('Leads')
        .update({ is_active: false })
        .eq('id', lead.id);

      if (error) {
        await fetchLeads();
        throw error;
      }
    } catch (err) {
      console.error('Erro ao arquivar lead:', err);
      alert('Erro ao arquivar contato.');
    }
  };

  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = lead.lead_nome?.toLowerCase().includes(search.toLowerCase()) ||
                         lead.lead_id?.includes(search);
    const matchesStatus = !filterStatus || lead.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const statuses = [
    { id: 'novo', label: 'Novo', color: 'bg-blue-500' },
    { id: 'frio', label: 'Frio', color: 'bg-zinc-400' },
    { id: 'quente', label: 'Quente', color: 'bg-orange-500' },
    { id: 'venda', label: 'Venda', color: 'bg-green-500' },
  ];

  return (
    <div className="h-full w-[300px] shrink-0 flex flex-col bg-white dark:bg-zinc-950 border-r border-border transition-colors duration-200">
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-xl font-bold tracking-tight">Mensagens</h1>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsAddingLead(!isAddingLead)}
              className={cn(
                "p-2 rounded-full transition-all",
                isAddingLead 
                  ? "bg-red-50 text-red-500 hover:bg-red-100" 
                  : "bg-primary/10 text-primary hover:bg-primary/20"
              )}
            >
              {isAddingLead ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
            <div className="p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
               <User className="w-4 h-4" />
            </div>
          </div>
        </div>

        {isAddingLead && (
          <form onSubmit={handleCreateLead} className="p-3 bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/10 space-y-3 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="Nome do contato"
                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary/30"
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                autoFocus
              />
              <input 
                type="text" 
                placeholder="WhatsApp (ex: 5511999999999)"
                className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-border rounded-lg text-xs outline-none focus:ring-1 focus:ring-primary/30"
                value={newLeadPhone}
                onChange={(e) => setNewLeadPhone(e.target.value)}
              />
            </div>
            <button 
              type="submit"
              disabled={isCreating}
              className="w-full py-2 bg-primary text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              {isCreating ? 'Criando...' : 'Iniciar Conversa'}
            </button>
          </form>
        )}

        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-primary transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar leads..."
            className="w-full pl-10 pr-4 py-2 bg-zinc-100/50 dark:bg-zinc-900 border-none rounded-xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar shrink-0">
          <button 
            onClick={() => setFilterStatus(null)}
            className={cn(
              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all whitespace-nowrap",
              !filterStatus 
                ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white" 
                : "bg-transparent text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
            )}
          >
            Todos
          </button>
          {statuses.map(status => (
            <button 
              key={status.id}
              onClick={() => setFilterStatus(status.id)}
              className={cn(
                "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all whitespace-nowrap",
                filterStatus === status.id 
                  ? "bg-primary text-white border-primary" 
                  : "bg-transparent text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:border-zinc-400"
              )}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-10 space-y-4">
            <Loader2 className="w-8 h-8 text-wa-teal animate-spin" />
            <p className="text-sm text-wa-text-muted">Carregando contatos...</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-wa-text-muted">Nenhum lead encontrado.</div>
        ) : (
          <div className="divide-y divide-wa-border">
            {filteredLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 transition-all hover:bg-wa-sidebar-hover group",
                  selectedLeadId === lead.lead_id ? "bg-wa-sidebar-hover" : "bg-transparent"
                )}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  {lead.profile_pic ? (
                    <img 
                      src={lead.profile_pic} 
                      alt={lead.lead_nome} 
                      className="w-12 h-12 rounded-full object-cover border border-wa-border"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-wa-border flex items-center justify-center text-wa-text-muted font-medium border border-wa-border">
                      <User className="w-6 h-6" />
                    </div>
                  )}
                  {lead.status === 'venda' && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-wa-sidebar" />
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 text-left min-w-0 border-b border-wa-border pb-3 group-last:border-none">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium text-wa-text truncate">
                      {lead.lead_nome || lead.lead_id.split('@')[0]}
                    </h3>
                    <span className="text-[11px] text-wa-text-muted">
                      {lead.last_message_at ? format(new Date(lead.last_message_at), 'HH:mm', { locale: ptBR }) : ''}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-wa-text-muted truncate pr-4">
                      {lead.last_message_content || lead.lead_id}
                    </p>
                    
                    <div className="flex items-center gap-2">
                       {lead.unread_count && lead.unread_count > 0 ? (
                         <div className="min-w-[20px] h-5 bg-wa-teal rounded-full flex items-center justify-center px-1">
                           <span className="text-[11px] font-bold text-[#111b21]">{lead.unread_count}</span>
                         </div>
                       ) : null}
                       <button 
                         onClick={(e) => handleDeleteLead(e, lead)}
                         className="opacity-0 group-hover:opacity-100 p-1 text-wa-text-muted hover:text-red-500 transition-all"
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
