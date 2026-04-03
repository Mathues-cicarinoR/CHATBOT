import React, { useState } from 'react';
import { SidebarNav } from '../components/layout/SidebarNav';
import { LeadList, type Lead } from '../components/chat/LeadList';
import { ChatArea } from '../components/chat/ChatArea';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

export const Dashboard: React.FC = () => {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const location = useLocation();

  const handleRefresh = () => setRefreshTrigger((prev: number) => prev + 1);

  // Se a rota for /mensagens ou /, mostramos o chat
  // Se for outra rota (ex: /contatos), mostramos o Outlet
  const isChatRoute = location.pathname === '/' || location.pathname === '/mensagens';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-zinc-950 transition-colors duration-200">
      {/* Sidebar - Oculta no mobile se um lead estiver selecionado */}
      <div className="hidden md:block h-full transition-all duration-300 shrink-0">
        <SidebarNav isCollapsed={!!selectedLead} />
      </div>

      <div className="flex flex-1 h-full overflow-hidden relative">
        {/* Lista de Leads - Oculta no mobile se um lead estiver selecionado */}
        <div className={cn(
          "w-full md:w-[320px] lg:w-[380px] h-full border-r border-border transition-all duration-300",
          selectedLead ? "hidden md:flex" : "flex"
        )}>
          <LeadList 
            selectedLeadId={selectedLead?.lead_id || null} 
            onSelectLead={setSelectedLead} 
            refreshTrigger={refreshTrigger}
          />
        </div>

        {/* Área de Chat - Ocupa tela cheia no mobile se selecionado */}
        <div className={cn(
          "flex-1 h-full transition-all duration-300 bg-zinc-50/50 dark:bg-zinc-900/10",
          !selectedLead ? "hidden md:flex" : "flex"
        )}>
          <ChatArea 
            lead={selectedLead} 
            onBack={() => setSelectedLead(null)} 
            onUpdate={(newData: Partial<Lead>) => {
              setSelectedLead((prev: Lead | null) => prev ? ({ ...prev, ...newData } as Lead) : null);
              handleRefresh();
            }}
          />
        </div>
      </div>

      {/* Outlet para outras rotas */}
      {!isChatRoute && (
        <div className="absolute inset-0 bg-white dark:bg-zinc-950 z-50 overflow-auto p-8">
          <Outlet />
        </div>
      )}
    </div>
  );
};
