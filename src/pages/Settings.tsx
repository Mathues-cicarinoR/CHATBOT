import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { Moon, Sun, Shield, Database } from 'lucide-react';
import { cn } from '../lib/utils';

export const Settings: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2">Configurações</h1>
        <p className="text-zinc-500 font-medium">Personalize sua experiência no Dashboard</p>
      </div>

      <div className="space-y-8">
        {/* Appearance */}
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-border shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-border">
              <Sun className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Aparência</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <button 
              onClick={() => theme === 'dark' && toggleTheme()}
              className={cn(
                "p-6 rounded-3xl border-2 transition-all text-left flex items-start gap-4 ring-offset-2 ring-primary bg-zinc-50 dark:bg-zinc-800/50",
                theme === 'light' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent opacity-60 hover:opacity-100"
              )}
            >
              <Sun className="w-6 h-6 mt-1" />
              <div>
                <p className="font-bold text-lg mb-1">Modo Claro</p>
                <p className="text-xs text-zinc-500">Visual limpo e brilhante para ambientes bem iluminados.</p>
              </div>
            </button>

            <button 
              onClick={() => theme === 'light' && toggleTheme()}
              className={cn(
                "p-6 rounded-3xl border-2 transition-all text-left flex items-start gap-4 ring-offset-2 ring-primary bg-zinc-50 dark:bg-zinc-800",
                theme === 'dark' ? "border-primary shadow-lg shadow-primary/10" : "border-transparent opacity-60 hover:opacity-100"
              )}
            >
              <Moon className="w-6 h-6 mt-1" />
              <div>
                <p className="font-bold text-lg mb-1">Modo Escuro</p>
                <p className="text-xs text-zinc-500">Conforto visual para longas jornadas e ambientes escuros.</p>
              </div>
            </button>
          </div>
        </section>

        {/* Account (Placeholder) */}
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-border shadow-sm opacity-50 cursor-not-allowed">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-border">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Segurança</h2>
          </div>
          <p className="text-sm text-zinc-500 italic">As configurações de conta são gerenciadas globalmente pelo administrador.</p>
        </section>

        {/* Database (Placeholder) */}
        <section className="bg-white dark:bg-zinc-900 rounded-3xl p-8 border border-border shadow-sm opacity-50 cursor-not-allowed">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-border">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Conexão Supabase</h2>
          </div>
          <div className="p-4 bg-zinc-50 rounded-2xl flex items-center justify-between">
             <code className="text-xs">lvgdsbybyeqjsllrhvtc.supabase.co</code>
             <span className="text-[10px] font-bold uppercase tracking-widest text-green-500">Conectado</span>
          </div>
        </section>
      </div>
    </div>
  );
};
