import React, { useState } from 'react';
import { SidebarNav } from '../components/layout/SidebarNav';
import { LeadList } from '../components/chat/LeadList';
import { ChatArea } from '../components/chat/ChatArea';
import { Outlet, useLocation } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const location = useLocation();

  // Se a rota for /mensagens ou /, mostramos o chat
  // Se for outra rota (ex: /contatos), mostramos o Outlet
  const isChatRoute = location.pathname === '/' || location.pathname === '/mensagens';

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-zinc-950 transition-colors duration-200">
      <SidebarNav />
      {isChatRoute ? (
        <>
          <LeadList selectedLeadId={selectedLeadId} onSelectLead={setSelectedLeadId} />
          <ChatArea leadId={selectedLeadId} />
        </>
      ) : (
        <div className="flex-1 overflow-auto bg-zinc-50 dark:bg-zinc-900/10 p-8">
          <Outlet />
        </div>
      )}
    </div>
  );
};
