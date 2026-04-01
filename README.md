# 🚀 WhatsApp CRM Dashboard

Este é um Dashboard de CRM moderno desenvolvido com **React + TypeScript + Vite**, projetado para monitorar e gerenciar conversas de leads capturados via WhatsApp (integrado com Evolution API e Supabase).

## ✨ Funcionalidades

- **Dashboard Real-time:** Acompanhamento de leads em tempo real via Supabase.
- **Histórico de Chat:** Visualização de mensagens trocadas entre o bot e o lead.
- **Envio de Mensagens:** Interface para resposta direta via Evolution API.
- **Interface Premium:** Design elegante e responsivo com Tailwind CSS.
- **Docker Ready:** Preparado para deploy simplificado.

## 🛠️ Tecnologias Utilizadas

- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Supabase](https://supabase.com/)
- [Evolution API](https://evolution-api.com/)
- [Docker](https://www.docker.com/)

---

## 🔧 Como Iniciar

### 1. Clonar o Repositório
```bash
git clone <url-do-seu-repositorio>
cd "Nova pasta"
```

### 2. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env` e preencha com suas credenciais:
```bash
cp .env.example .env
```
Variáveis necessárias:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_EVOLUTION_API_URL`
- `VITE_EVOLUTION_API_KEY`

### 3. Instalar Dependências
```bash
npm install
```

### 4. Rodar em Desenvolvimento
```bash
npm run dev
```

---

## 🐳 Rodando com Docker

Se preferir rodar via Docker:

```bash
docker compose up -d
```
A aplicação estará disponível em `http://localhost:80`.

---

## 🚀 Deploy no Easypanel

1. Crie um novo **App** no Easypanel apontando para este repositório.
2. Configure o **Build Method** como `Docker`.
3. Adicione as variáveis do `.env` na aba **Environment variables** do seu app.
4. Certifique-se de que a porta configurada no Easypanel é a `80`.

---
Desenvolvido com ❤️ por Matheus.
