import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { User, Phone, Calendar, MoreVertical } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Lead {
  id: number;
  lead_nome: string;
  lead_id: string;
  created_at: string;
}

export const Contatos: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeads = async () => {
      const { data, error } = await supabase
        .from('Leads')
        .select('*')
        .order('lead_nome', { ascending: true });

      if (error) console.error(error);
      else setLeads(data || []);
      setLoading(false);
    };
    fetchLeads();
  }, []);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Contatos</h1>
          <p className="text-zinc-500 font-medium">Gerencie todos os leads capturados</p>
        </div>
        <div className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold shadow-lg shadow-primary/20 cursor-pointer hover:bg-primary/90 transition-all flex items-center gap-2">
          <User className="w-4 h-4" />
          <span>Novo Lead</span>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="h-48 bg-zinc-100 dark:bg-zinc-800 rounded-3xl animate-pulse border border-border/50" />
          ))}
        </div>
      ) : leads.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-12 text-center border border-border shadow-sm">
          <div className="w-16 h-16 bg-zinc-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
            <UsersIcon className="w-8 h-8 text-zinc-300" />
          </div>
          <p className="text-zinc-400 font-medium italic">Nenhum contato cadastrado ainda.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {leads.map((lead) => (
            <div key={lead.id} className="bg-white dark:bg-zinc-900 p-6 rounded-3xl border border-border shadow-sm hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-none transition-all group relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 -mt-8 -mr-8 rounded-full transition-transform group-hover:scale-125" />
              
              <div className="flex items-start justify-between mb-6 relative">
                <div className="w-14 h-14 bg-zinc-50 dark:bg-zinc-800 rounded-2xl flex items-center justify-center text-primary font-bold text-xl border border-border group-hover:bg-primary group-hover:text-white transition-colors duration-300 shadow-sm">
                  {lead.lead_nome?.[0]?.toUpperCase() || 'L'}
                </div>
                <button className="text-zinc-300 hover:text-zinc-500 transition-colors">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-bold text-lg dark:text-zinc-100 truncate">{lead.lead_nome || 'Lead sem Nome'}</h3>
                </div>
                
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-2.5 text-zinc-500">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm font-medium">{lead.lead_id}</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-zinc-500">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      Desde {format(new Date(lead.created_at), 'dd MMM yy', { locale: ptBR })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const UsersIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
