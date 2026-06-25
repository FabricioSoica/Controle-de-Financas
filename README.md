# Controle de Finanças & Lista de Compras

Sistema completo e responsivo desenvolvido com **Vue.js** (Frontend) e **Node.js/Express** (Backend) com banco de dados **MongoDB Atlas** para controle financeiro e lista de compras inteligente.

O design foi estruturado em um tema Dark moderno com elementos de vidro (Glassmorphism), transições suaves e interações reativas de alto desempenho.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend**: Vue.js 3 (Vite), Vanilla CSS (Design Responsivo), FontAwesome (Ícones)
- **Backend**: Node.js, Express, Mongoose (MongoDB ODM)
- **Banco de Dados**: MongoDB Atlas
- **Servidor Web / VM**: Nginx (Proxy Reverso), PM2 / Systemd (Gerenciamento de Processos), Let's Encrypt (SSL/HTTPS)

---

## 📁 Estrutura do Projeto

```text
Controle-de-Financas/
├── backend/
│   ├── models/
│   │   ├── Transaction.js      # Modelo de lançamentos financeiros
│   │   └── ShoppingItem.js     # Modelo de itens da lista de compras
│   ├── .env.example            # Exemplo de variáveis de ambiente
│   ├── .env                    # Configuração local (MongoDB e Porta)
│   ├── package.json
│   └── server.js               # Servidor Express com endpoints da API
├── frontend/
│   ├── dist/                   # Build de produção gerado pelo Vite
│   ├── src/
│   │   ├── assets/
│   │   ├── components/
│   │   ├── App.vue             # Componente central
│   │   ├── main.js
│   │   └── style.css           # Design System em Vanilla CSS
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── nginx.conf                  # Arquivo de configuração recomendado do Nginx
├── controle-financas-api.service # Serviço Systemd recomendado para a API
└── README.md
```

---

## 🧮 Funcionamento das Finanças (Baseado na sua Planilha)

O sistema realiza os cálculos automaticamente de acordo com as categorias estabelecidas:
- **Receita Total (Incomes)**: Somatório de todos os ganhos (ex: Salário Bruto).
- **Gastos com Cartões (Cards)**: Somatório de gastos com cartão (ex: Santander, Mercado Pago).
- **Gastos Fixos (Fixed)**: Somatório das despesas recorrentes da "Coluna C" da sua planilha (ex: TKD, Psicólogo).
- **Outros Gastos (Variables)**: Somatório de despesas variadas e assinaturas mensais (ex: MEI, Financiamento Moto, Assinatura YT, Capa do Sax).

### Fórmulas em Tempo Real:
1. **Gastos Totais** = `Cartões` + `Outros Gasto`
2. **Saldo Líquido / Salário Líquido** = `Receitas` - `Gastos Totais`
3. **Línguido Pós Gastos Fixos** = `Saldo Líquido` - `Gastos Fixos`

---

## 🛒 Lista de Compras Inteligente

- **Drag and Drop**: Arraste os itens usando o ícone lateral `⋮⋮` para redefinir a ordem de relevância de forma dinâmica. A nova ordem é salva automaticamente em lote (bulk update) no banco de dados.
- **Setas de Acessibilidade**: Se estiver no celular, você pode clicar nas setas de subir/descer para reordenar os itens com facilidade.
- **Links Externos**: Adicione links rápidos para comprar os itens. Eles abrirão em nova aba com cabeçalhos de segurança.
- **Orçamento total**: A tela exibe o somatório dinâmico do valor total da lista de desejos.

---

## 🚀 Execução Local (Desenvolvimento)

### 1. Configurar o Banco de Dados (Backend)
Entre na pasta `backend/`, abra o arquivo `.env` e configure sua porta, conexão do MongoDB e a chave JWT:
```env
PORT=5001
MONGO_URI=mongodb+srv://fabriciorosasoica_db_user:SUA_SENHA_AQUI@controlefinancas.dcncwzb.mongodb.net/?appName=ControleFinancas
JWT_SECRET=uma_chave_secreta_e_segura_aqui
```

### 2. Iniciar o Backend
```bash
cd backend
npm install
npm run dev
```
O backend rodará em `http://localhost:5001`.

### 3. Iniciar o Frontend
```bash
cd ../frontend
npm install
npm run dev
```
O frontend rodará em `http://localhost:5173`. Acesse-o pelo navegador. Ao acessar pela primeira vez, crie uma conta na aba "Criar Conta" (todas as finanças órfãs anteriores serão vinculadas automaticamente ao primeiro usuário cadastrado).

---

## 🌐 Configuração e Implantação na VM (Nginx)

Para rodar este site junto com o site do Taekwondo na mesma VM, siga os passos abaixo:

### Passo 1: Transferir arquivos e preparar diretórios
Crie o diretório de destino na VM e transfira o código do seu repositório Git ou via SCP:
```bash
sudo mkdir -p /var/www/controle-financas/html
sudo chown -R ubuntu:ubuntu /var/www/controle-financas
```
Compile o frontend localmente (`npm run build` na pasta `frontend`) e copie o conteúdo da pasta `dist/` para a pasta `/var/www/controle-financas/html` da sua máquina virtual.
Mova a pasta `backend/` para `/var/www/controle-financas/backend/` e instale as dependências executando `npm install`.

### Passo 2: Executar o Backend em Background com PM2
No terminal da VM, instale e inicie a API utilizando o gerenciador de processos PM2:
```bash
sudo npm install -g pm2
cd /var/www/controle-financas/backend
pm2 start server.js --name "financas-api"
pm2 save
pm2 startup
```

### Passo 3: Configurar Nginx (Hospedagem Multifólio)
Utilize o arquivo `nginx.conf` disponibilizado na raiz deste projeto. Copie-o para a pasta de configurações de sites do Nginx:
```bash
sudo cp /var/www/controle-financas/nginx.conf /etc/nginx/sites-available/controle-financas
```
Edite o arquivo para definir seu subdomínio cadastrado (ex: `financas.seudominio.com`):
```bash
sudo nano /etc/nginx/sites-available/controle-financas
```
Ative a configuração criando o link simbólico na pasta `sites-enabled`:
```bash
sudo ln -s /etc/nginx/sites-available/controle-financas /etc/nginx/sites-enabled/
```
Valide a sintaxe do Nginx e reinicie o serviço:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

### Passo 4: Obter Certificado SSL (HTTPS Let's Encrypt)
Execute o Certbot para configurar automaticamente a criptografia SSL e redirecionamento de tráfego HTTP:
```bash
sudo certbot --nginx -d financas.seudominio.com
```

Pronto! Seu novo site de finanças estará rodando na mesma VM com segurança máxima e baixo consumo de recursos! 