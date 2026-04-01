import React, { useEffect, useState, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, Users, Settings, LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { cn } from '../../lib/utils';

export const SidebarNav: React.FC = () => {
  const { signOut, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [width, setWidth] = useState(() => {
    return Number(localStorage.getItem('sidebar-width')) || 240;
  });
  const isResizing = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      let newWidth = e.clientX;
      if (newWidth < 180) newWidth = 180;
      if (newWidth > 320) newWidth = 320;
      setWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      localStorage.setItem('sidebar-width', width.toString());
      document.body.classList.remove('cursor-col-resize', 'select-none');
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [width]);

  const startResizing = () => {
    isResizing.current = true;
    document.body.classList.add('cursor-col-resize', 'select-none');
  };

  return (
    <div 
      className="h-full flex relative bg-white dark:bg-zinc-900 border-r border-border transition-colors duration-200"
      style={{ width: `${width}px` }}
    >
      <div className="flex-1 flex flex-col p-4 bg-zinc-50/50 dark:bg-zinc-900/50">
        <div className="flex items-center gap-3 mb-10 px-2 pt-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-primary/20">
            C
          </div>
          <span className="font-bold text-lg tracking-tight">Chatbox</span>
        </div>

        <nav className="flex-1 space-y-1.5">
          <NavLink 
            to="/" 
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
              isActive ? "bg-primary text-white shadow-md shadow-primary/20" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
          >
            <LayoutDashboard className="w-5 h-5" />
            <span>Dashboard</span>
          </NavLink>
          
          <NavLink 
            to="/mensagens" 
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
              isActive ? "bg-primary text-white shadow-md shadow-primary/20" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
          >
            <MessageSquare className="w-5 h-5" />
            <span>Mensagens</span>
          </NavLink>

          <NavLink 
            to="/contatos" 
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
              isActive ? "bg-primary text-white shadow-md shadow-primary/20" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
          >
            <Users className="w-5 h-5" />
            <span>Contatos</span>
          </NavLink>
        </nav>

        <div className="pt-4 border-t border-border mt-4 space-y-1">
          <NavLink 
            to="/configuracoes" 
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group",
              isActive ? "bg-primary text-white shadow-md shadow-primary/20" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100"
            )}
          >
            <Settings className="w-5 h-5" />
            <span>Configurações</span>
          </NavLink>

          <button 
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Sair</span>
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3 px-3">
          <div className="w-10 h-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-400 font-semibold border-2 border-white dark:border-zinc-800">
            {user?.email?.[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">{user?.email?.split('@')[0]}</p>
            <p className="text-[10px] text-zinc-500 truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      <div 
        onMouseDown={startResizing}
        className="w-1 absolute right-0 top-0 bottom-0 cursor-col-resize hover:bg-primary/30 transition-colors z-50 group"
      >
        <div className="w-full h-full bg-transparent group-active:bg-primary/50" />
      </div>
    </div>
  );
};
