import React, { useEffect, useState } from 'react';
import { Search, User } from 'lucide-react';
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

  useEffect(() => {
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

    fetchLeads();
  }, []);

  const filteredLeads = leads.filter(lead => 
    lead.lead_nome?.toLowerCase().includes(search.toLowerCase()) ||
    lead.lead_id?.includes(search)
  );

  return (
    <div className="h-full w-[300px] shrink-0 flex flex-col bg-white dark:bg-zinc-950 border-r border-border transition-colors duration-200">
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-xl font-bold tracking-tight">Mensagens</h1>
          <div className="p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-pointer hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors">
             <User className="w-4 h-4" />
          </div>
        </div>
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
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-all group",
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
                      {format(new Date(lead.last_message_at || lead.created_at), 'HH:mm', { locale: ptBR })}
                    </p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-500 truncate group-hover:text-zinc-600 dark:group-hover:text-zinc-400">
                      {lead.lead_id}
                    </p>
                    {lead.status && lead.status !== 'novo' && (
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ml-2",
                        lead.status === 'quente' ? "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" :
                        lead.status === 'venda' ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
                        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                      )}>
                        {lead.status}
                      </span>
                    )}
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
