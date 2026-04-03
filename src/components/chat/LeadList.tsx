import React, { useEffect, useState } from 'react';
import { Search, User, Plus, X, Check, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Lead {
  id: number;
  lead_nome: string;
  lead_id: string;
  created_at: string;
  last_message_at: string;
  status: string;
}

interface LeadListProps {
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
}

export const LeadList: React.FC<LeadListProps> = ({ selectedLeadId, onSelectLead }) => {
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
      .from('Leads')
      .select('*')
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
  }, []);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadPhone.trim() || isCreating) return;

    setIsCreating(true);
    try {
      // Limpar o número e formatar como JID
      const cleanPhone = newLeadPhone.replace(/\D/g, '');
      const jid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

      const { data, error } = await supabase
        .from('Leads')
        .insert([{
          lead_nome: newLeadName,
          lead_id: jid,
          status: 'novo',
          last_message_at: new Date().toISOString()
        }])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        await fetchLeads();
        onSelectLead(data[0].lead_id);
        setIsAddingLead(false);
        setNewLeadName('');
        setNewLeadPhone('');
      }
    } catch (err) {
      console.error('Erro ao criar lead:', err);
      alert('Erro ao criar novo contato. Verifique se o número já existe.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteLead = async (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!confirm(`Tem certeza que deseja excluir a conversa com ${lead.lead_nome || lead.lead_id}? Isso apagará todo o histórico.`)) return;

    try {
      // Deletar da tabela Leads
      const { error: leadError } = await supabase
        .from('Leads')
        .delete()
        .eq('lead_id', lead.lead_id);

      if (leadError) throw leadError;

      // Deletar histórico de mensagens
      await supabase
        .from('n8n_chat_histories')
        .delete()
        .eq('session_id', lead.lead_id);

      await fetchLeads();
      if (selectedLeadId === lead.lead_id) {
        onSelectLead('');
      }
    } catch (err) {
      console.error('Erro ao deletar lead:', err);
      alert('Erro ao excluir contato.');
    }
  };

  const filteredLeads = leads.filter(lead => 
    lead.lead_nome?.toLowerCase().includes(search.toLowerCase()) ||
    lead.lead_id?.includes(search)
  );

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
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {loading ? (
          <div className="p-10 text-center text-sm text-zinc-400">Carregando contatos...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-400">Nenhum lead encontrado.</div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead.lead_id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all group relative",
                  selectedLeadId === lead.lead_id 
                    ? "bg-primary/5 dark:bg-primary/10 border-l-[3px] border-primary" 
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900 border-l-[3px] border-transparent"
                )}
              >
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0 shadow-sm border border-primary/10">
                  {lead.lead_nome?.[0]?.toUpperCase() || 'L'}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="font-semibold text-sm truncate dark:text-zinc-100">{lead.lead_nome || 'Lead s/ nome'}</p>
                    <p className="text-[10px] text-zinc-400 shrink-0">
                      {lead.last_message_at ? format(new Date(lead.last_message_at), 'HH:mm', { locale: ptBR }) : ''}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 truncate group-hover:text-zinc-600 dark:group-hover:text-zinc-400">
                      {lead.lead_id}
                    </p>
                    <div className="flex items-center gap-2">
                      {lead.status && lead.status !== 'novo' && (
                        <span className={cn(
                          "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider",
                          lead.status === 'quente' ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" :
                          lead.status === 'venda' ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                          "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                        )}>
                          {lead.status}
                        </span>
                      )}
                      <button 
                        onClick={(e) => handleDeleteLead(e, lead)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                        title="Excluir conversa"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
