import React, { useState } from 'react';
import { SidebarNav } from '../components/layout/SidebarNav';
import { LeadList } from '../components/chat/LeadList';
import { ChatArea } from '../components/chat/ChatArea';
import { Outlet, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';

export const Dashboard: React.FC = () => {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const location = useLocation();

  // Se a rota for /mensagens ou /, mostramos o chat
  // Se for outra rota (ex: /contatos), mostramos o Outlet
  const isChatRoute = location.pathname === '/' || location.pathname === '/mensagens';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-zinc-950 transition-colors duration-200">
      {/* Sidebar - Oculta no mobile se um lead estiver selecionado */}
      <div className={cn(
        "hidden md:block h-full transition-all duration-300",
        selectedLeadId ? "w-20" : "w-64"
      )}>
        <SidebarNav />
      </div>

      <div className="flex flex-1 h-full overflow-hidden relative">
        {/* Lista de Leads - Oculta no mobile se um lead estiver selecionado */}
        <div className={cn(
          "w-full md:w-[320px] lg:w-[380px] h-full border-r border-border transition-all duration-300",
          selectedLeadId ? "hidden md:flex" : "flex"
        )}>
          <LeadList selectedLeadId={selectedLeadId} onSelectLead={setSelectedLeadId} />
        </div>

        {/* Área de Chat - Ocupa tela cheia no mobile se selecionado */}
        <div className={cn(
          "flex-1 h-full transition-all duration-300 bg-zinc-50/50 dark:bg-zinc-900/10",
          !selectedLeadId ? "hidden md:flex" : "flex"
        )}>
          <ChatArea leadId={selectedLeadId} onBack={() => setSelectedLeadId(null)} />
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
