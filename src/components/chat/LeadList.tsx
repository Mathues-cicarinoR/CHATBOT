import React, { useEffect, useState } from 'react';
import { Search, User, Plus, X, Trash2, Loader2, QrCode } from 'lucide-react';
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
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'open' | 'disconnected' | 'loading'>('loading');

  const fetchLeads = async () => {
    setLoading(true);
    
    try {
      const { data: statusResp, error: statusError } = await supabase.functions.invoke('wa-gate/status');
      if (statusError || statusResp?.error) {
        // Se houver erro na função (ex: secrets faltando), não marcamos como desconectado fatal
        console.warn('Status check failed:', statusError || statusResp?.error);
        setConnectionStatus('open'); // Fallback para mostrar a lista se houver erro de config
      } else {
        setConnectionStatus(statusResp?.state === 'open' ? 'open' : 'disconnected');
      }
    } catch (e) {
      console.error('Error fetching connection status:', e);
      setConnectionStatus('open'); // Fallback
    }

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

    const channel = supabase
      .channel('sidebar-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'Leads' },
        () => fetchLeads()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        () => fetchLeads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshTrigger]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadName.trim() || !newLeadPhone.trim() || isCreating) return;

    setIsCreating(true);
    try {
      const cleanPhone = newLeadPhone.replace(/\D/g, '');
      const jid = cleanPhone.includes('@') ? cleanPhone : `${cleanPhone}@s.whatsapp.net`;

      const { data: existing } = await supabase
        .from('Leads')
        .select('*')
        .eq('lead_id', jid)
        .maybeSingle();

      if (existing) {
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

  const handleSyncAll = async () => {
    if (isSyncingAll) return;
    setIsSyncingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('wa-gate/sync-all');
      if (error) throw error;
      
      console.log('Sincronização iniciada:', data);
      // O webhook cuidará do salvamento, bastando aguardar o realtime ou dar um fetch
      setTimeout(fetchLeads, 2000); // Aguarda um pouco para os nomes serem processados
    } catch (err) {
      console.error('Erro ao sincronizar:', err);
      alert('Erro na sincronização global.');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleDeleteLead = async (e: React.MouseEvent, lead: Lead) => {
    e.stopPropagation();
    if (!confirm(`Ocultar conversa com ${lead.lead_nome || lead.lead_id}?`)) return;

    try {
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      if (selectedLeadId === lead.lead_id) onSelectLead(null);

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
    { id: 'novo', label: 'Novo' },
    { id: 'frio', label: 'Frio' },
    { id: 'quente', label: 'Quente' },
    { id: 'venda', label: 'Venda' },
  ];

  return (
    <div className="h-full w-[320px] shrink-0 flex flex-col bg-[#111b21] border-r border-[#222d34] transition-all">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between px-2">
          <h1 className="text-xl font-bold tracking-tight text-[#e9edef]">Mensagens</h1>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleSyncAll}
              disabled={isSyncingAll || connectionStatus !== 'open'}
              title="Sincronizar conversas do WhatsApp"
              className={cn(
                "p-2 rounded-full transition-all bg-white/5 hover:bg-white/10",
                isSyncingAll ? "text-wa-teal animate-spin" : "text-[#8696a0] hover:text-wa-teal"
              )}
            >
              <RefreshCw className={cn("w-5 h-5", isSyncingAll && "animate-spin")} />
            </button>

            <button 
              onClick={() => setIsAddingLead(!isAddingLead)}
              className={cn(
                "p-2 rounded-full transition-all",
                isAddingLead 
                  ? "bg-red-500/10 text-red-500 hover:bg-red-500/20" 
                  : "bg-wa-teal/10 text-wa-teal hover:bg-wa-teal/20"
              )}
            >
              {isAddingLead ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {isAddingLead && (
          <form onSubmit={handleCreateLead} className="p-3 bg-white/5 rounded-2xl border border-white/10 space-y-3 animate-in slide-in-from-top-2">
            <div className="space-y-2">
              <input 
                type="text" 
                placeholder="Nome do contato"
                className="w-full px-3 py-1.5 bg-[#202c33] border-none rounded-lg text-xs text-white outline-none"
                value={newLeadName}
                onChange={(e) => setNewLeadName(e.target.value)}
                autoFocus
              />
              <input 
                type="text" 
                placeholder="WhatsApp (ex: 5511999999999)"
                className="w-full px-3 py-1.5 bg-[#202c33] border-none rounded-lg text-xs text-white outline-none"
                value={newLeadPhone}
                onChange={(e) => setNewLeadPhone(e.target.value)}
              />
            </div>
            <button 
              type="submit"
              disabled={isCreating}
              className="w-full py-2 bg-wa-teal text-[#111b21] rounded-lg text-xs font-bold flex items-center justify-center gap-2"
            >
              {isCreating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              {isCreating ? 'Criando...' : 'Iniciar Conversa'}
            </button>
          </form>
        )}

        <div className="relative group mx-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0] group-focus-within:text-wa-teal transition-colors" />
          <input 
            type="text" 
            placeholder="Pesquisar..."
            className="w-full pl-10 pr-4 py-2 bg-[#202c33] border-none rounded-xl text-sm text-[#e9edef] placeholder:text-[#8696a0] outline-none"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 px-2 custom-scrollbar shrink-0">
          <button 
            onClick={() => setFilterStatus(null)}
            className={cn(
              "px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
              !filterStatus ? "bg-wa-teal/20 text-wa-teal" : "bg-[#202c33] text-[#8696a0]"
            )}
          >
            Todos
          </button>
          {statuses.map(status => (
            <button 
              key={status.id}
              onClick={() => setFilterStatus(status.id)}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap",
                filterStatus === status.id ? "bg-wa-teal/20 text-wa-teal" : "bg-[#202c33] text-[#8696a0]"
              )}
            >
              {status.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {connectionStatus === 'loading' && loading ? (
          <div className="flex flex-col items-center justify-center p-10 space-y-4">
            <Loader2 className="w-8 h-8 text-wa-teal animate-spin" />
            <p className="text-sm text-[#8696a0]">Sincronizando...</p>
          </div>
        ) : connectionStatus === 'disconnected' ? (
          <div className="flex flex-col items-center justify-center p-8 text-center h-[200px] bg-[#202c33]/30 mx-4 rounded-3xl border border-[#222d34]">
            <QrCode className="w-10 h-10 text-wa-teal mb-4 opacity-50" />
            <p className="text-[#e9edef] font-bold text-sm mb-2">WhatsApp Desconectado</p>
            <p className="text-[#8696a0] text-xs">Conecte seu celular para espelhar mensagens.</p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#8696a0]">Nenhuma conversa.</div>
        ) : (
          <div className="">
            {filteredLeads.map((lead) => (
              <button
                key={lead.id}
                onClick={() => onSelectLead(lead)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 hover:bg-[#202c33] group border-b border-[#222d34]/50",
                  selectedLeadId === lead.lead_id ? "bg-[#202c33]" : "bg-transparent"
                )}
              >
                <div className="relative shrink-0">
                  {lead.profile_pic ? (
                    <img src={lead.profile_pic} alt="AV" className="w-12 h-12 rounded-full object-cover border border-[#222d34]" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#313d45] flex items-center justify-center text-[#8696a0]">
                      <User className="w-6 h-6" />
                    </div>
                  )}
                </div>
 
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <h3 className="font-medium text-[#e9edef] truncate">{lead.lead_nome || lead.lead_id.split('@')[0]}</h3>
                    <span className={cn("text-[12px]", lead.unread_count && lead.unread_count > 0 ? "text-wa-teal font-medium" : "text-[#8696a0]")}>
                      {lead.last_message_at ? format(new Date(lead.last_message_at), 'HH:mm', { locale: ptBR }) : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[#8696a0] truncate pr-4">{lead.last_message_content || lead.lead_id}</p>
                    {lead.unread_count && lead.unread_count > 0 && (
                      <div className="min-w-[20px] h-5 bg-wa-teal rounded-full flex items-center justify-center px-1.5">
                        <span className="text-[11px] font-bold text-[#111b21]">{lead.unread_count}</span>
                      </div>
                    )}
                    <button onClick={(e) => handleDeleteLead(e, lead)} className="opacity-0 group-hover:opacity-100 p-1 text-[#8696a0] hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
