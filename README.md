# 💰 Controle de Finanças & Lista de Compras

Aplicação web responsiva (PWA) para controle financeiro pessoal e lista de compras, com tema dark moderno e efeitos de glassmorphism.

## ✨ Funcionalidades

- **Dashboard financeiro**: receitas, gastos com cartões, gastos fixos e variáveis, com saldos calculados em tempo real.
- **Cartões de crédito**: cadastro com dias de fechamento/vencimento e lançamento de compras parceladas.
- **Categorias**: classificação automática de lançamentos e gráfico de distribuição por categoria.
- **Evolução mensal**: acompanhamento histórico mês a mês.
- **Abastecimentos**: registro de combustível e controle de gastos.
- **Lista de compras inteligente**: reordenação por drag-and-drop, links externos e orçamento total dinâmico.
- **Autenticação**: login com JWT e senhas protegidas por hash (bcrypt).

## 🛠️ Tecnologias

- **Frontend**: Vue.js 3 + Vite, CSS puro, PWA
- **Backend**: Node.js, Express, Mongoose
- **Banco de dados**: MongoDB

## 📁 Estrutura

```text
Controle-de-Financas/
├── backend/          # API Express + Mongoose
│   ├── config/       # Conexão com o banco e migrações
│   ├── middleware/   # Autenticação JWT
│   ├── models/       # Schemas do MongoDB
│   ├── routes/       # Endpoints da API
│   └── server.js
└── frontend/         # Aplicação Vue 3
    ├── src/
    │   ├── components/
    │   ├── App.vue
    │   └── style.css
    └── vite.config.js
```

## 🚀 Como rodar localmente

### Pré-requisitos
- Node.js 20+
- Uma instância do MongoDB (local ou [MongoDB Atlas](https://www.mongodb.com/atlas))

### 1. Backend

```bash
cd backend
cp .env.example .env   # preencha MONGO_URI e JWT_SECRET
npm install
npm run dev
```

Variáveis de ambiente (`backend/.env`):

```env
PORT=5001
MONGO_URI=mongodb+srv://<USUARIO>:<SENHA>@<SEU_CLUSTER>.mongodb.net/?appName=ControleFinancas
JWT_SECRET=defina_uma_chave_secreta_longa_e_aleatoria
```

A API sobe em `http://localhost:5001`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend sobe em `http://localhost:5173`. Ao acessar pela primeira vez, crie uma conta na aba **"Criar Conta"**.

## 📄 Licença

Projeto pessoal de uso livre para fins de estudo.
