import { useState, useEffect } from 'react';
import { X, QrCode, Loader2, CheckCircle2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

export const ConnectionModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [status, setStatus] = useState<'loading' | 'disconnected' | 'connecting' | 'connected'>('loading');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('wa-gate/status');
      
      if (invokeError || data?.error) {
        if (data?.error?.includes('Secrets') || data?.error?.includes('Configuração incompleta')) {
          setError('Configuração pendente: Use "npx supabase secrets set..." ou configure no Painel das Edge Functions.');
        }
        setStatus('disconnected');
        return;
      }

      if (data?.state === 'open') {
        setStatus('connected');
        setError(null);
      } else if (status !== 'connecting') {
        setStatus('disconnected');
      }
    } catch (e) { 
      console.error(e);
      setStatus('disconnected'); 
    }
  };

  const getQR = async () => {
    setStatus('connecting');
    setError(null);
    try {
      const { error: initError } = await supabase.functions.invoke('wa-gate/init');
      if (initError) throw initError;

      const { data, error: qrError } = await supabase.functions.invoke('wa-gate/qr');
      
      if (qrError || data?.error) {
        setError(data?.error || 'Erro ao gerar QR Code');
        setStatus('disconnected');
        return;
      }

      if (data?.base64) {
        setQrCode(data.base64);
        setStatus('disconnected');
      } else if (data?.instance?.state === 'open') {
        setStatus('connected');
      }
    } catch (e: any) { 
      console.error(e);
      setError(e.message || 'Erro na conexão com a Evolution API');
      setStatus('disconnected'); 
    }
  };

  useEffect(() => { if (isOpen) fetchStatus(); }, [isOpen]);

  useEffect(() => {
    let interval: any;
    if (status === 'connecting' || qrCode) interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [status, qrCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#202c33] w-full max-w-md rounded-2xl border border-[#313d45] shadow-2xl">
        <div className="p-4 border-b border-[#313d45] flex justify-between items-center bg-[#111b21]/50">
          <div className="flex items-center gap-2 text-[#00a884] font-bold">
            <QrCode className="w-5 h-5"/> Conexão WhatsApp
          </div>
          <button onClick={onClose} className="text-[#8696a0] hover:text-white"><X /></button>
        </div>
        <div className="p-8 flex flex-col items-center">
          {status === 'loading' && <Loader2 className="animate-spin text-[#00a884] w-10 h-10" />}
          {status === 'connected' ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="text-[#00a884] w-16 h-16" />
              <h3 className="text-xl font-bold text-[#e9edef]">WhatsApp Conectado!</h3>
              <p className="text-[#8696a0] text-sm">Seu CRM está pronto para uso.</p>
            </div>
          ) : qrCode ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-4 bg-white rounded-xl shadow-inner mb-2">
                <img src={qrCode} className="w-64 h-64" alt="QR" />
              </div>
              <p className="text-[#e9edef] font-bold">Escaneie o QR Code</p>
              <p className="text-[#8696a0] text-xs">Abra o WhatsApp &gt; Aparelhos Conectados.</p>
              <button onClick={getQR} className="text-[#00a884] text-xs flex items-center gap-1 mt-2">
                <RefreshCw className="w-3 h-3"/> Atualizar QR
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="w-20 h-20 bg-[#313d45] rounded-full flex items-center justify-center opacity-50">
                <QrCode className="w-10 h-10 text-[#8696a0]" />
              </div>
              {error && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs">
                  {error}
                </div>
              )}
              <p className="text-[#8696a0] text-sm mb-4">Clique abaixo para gerar o código de pareamento.</p>
              <button 
                onClick={getQR} 
                disabled={status === 'connecting'}
                className={cn(
                  "w-full py-4 text-[#111b21] rounded-2xl font-bold shadow-lg transition-all flex items-center justify-center gap-2",
                  status === 'connecting' 
                    ? "bg-[#00a884]/50 cursor-not-allowed" 
                    : "bg-[#00a884] hover:brightness-110 cursor-pointer active:scale-[0.98]"
                )}
              >
                {status === 'connecting' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <span>Gerar QR Code</span>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
