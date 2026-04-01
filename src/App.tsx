import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Contatos } from './pages/Contatos';
import { Settings } from './pages/Settings';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Rota de Login */}
            <Route path="/login" element={<Login />} />

            {/* Rotas Protegidas */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />}>
                {/* O Dashboard já lida com o chat nas rotas / e /mensagens */}
                <Route path="mensagens" element={<div className="hidden" />} />
                <Route path="contatos" element={<Contatos />} />
                <Route path="configuracoes" element={<Settings />} />
              </Route>
            </Route>

            {/* Redirecionar rotas não encontradas */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
