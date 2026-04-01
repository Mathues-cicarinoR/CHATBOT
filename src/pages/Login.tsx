import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  if (user) return <Navigate to="/" replace />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          setError('E-mail ou senha incorretos.');
        } else {
          setError(error.message);
        }
      } else {
        navigate('/');
      }
    } catch (err) {
      setError('Não foi possível conectar. Verifique sua internet.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
      <div className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-xl shadow-zinc-200/50 dark:shadow-none border border-border p-8 backdrop-blur-sm transition-all">
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-white font-bold shadow-lg shadow-primary/30 mb-6 rotate-3">
            <LogIn className="w-7 h-7" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">Bem-vindo de volta</h1>
          <p className="text-zinc-500 text-sm font-medium">Acesse o seu Dashboard CRM WhatsApp</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest pl-1" htmlFor="email">E-mail</label>
            <div className="relative group">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
              <input 
                id="email"
                type="email" 
                placeholder="exemplo@email.com"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-zinc-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest pl-1" htmlFor="password">Senha</label>
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 group-focus-within:text-primary transition-colors" />
              <input 
                id="password"
                type="password" 
                placeholder="********"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-zinc-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-2xl flex items-center gap-3 text-sm text-red-600 dark:text-red-400 animate-shake">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="font-medium">{error}</p>
            </div>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className={cn(
              "w-full py-4 px-6 bg-primary text-white rounded-2xl font-bold transition-all shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 flex items-center justify-center gap-3 active:scale-[0.98]",
              loading ? "opacity-70 cursor-not-allowed" : "hover:bg-primary/90"
            )}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <span>Entrar no Painel</span>
                <LogIn className="w-5 h-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-xs text-zinc-400 font-medium italic">Sistema exclusivo para equipe interna.</p>
        </div>
      </div>
    </div>
  );
};
