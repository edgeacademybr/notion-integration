# Notion Course Progress — Inicializador de Progresso

Webhook TypeScript hospedado na Vercel que, ao ser chamado pelo botão da home do curso no Notion, cria todas as entradas de progresso do aluno de uma vez — status "Não iniciado" para todas as aulas, exceto a primeira que já entra como "Em andamento".

---

## Estrutura do projeto

```
notion-progress/
├── api/
│   └── init-progress.ts   # Endpoint chamado pelo Notion
├── lib/
│   └── notion.ts          # Lógica de integração com a API do Notion
├── .env.example           # Template das variáveis de ambiente
├── package.json
├── tsconfig.json
└── vercel.json
```

---

## Passo 1 — Criar a integração no Notion

1. Acesse https://www.notion.so/my-integrations
2. Clique em **"New integration"**
3. Dê um nome (ex: "Course Progress") e selecione seu workspace
4. Em **"Capabilities"**, marque: Read content, Update content, Insert content
5. Salve e copie o **Internal Integration Token** (começa com `secret_`)
6. Abra as databases **Aulas** e **Progresso dos Alunos** no Notion
7. Em cada uma: clique em `...` → **"Add connections"** → selecione sua integração

---

## Passo 2 — Configurar as variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
NOTION_TOKEN=secret_...         # Token copiado no passo anterior
NOTION_DB_AULAS=cfc78666e07f8237b2a381fcef970b25
NOTION_DB_PROGRESSO=ff678666e07f838e983b0174338fec58
WEBHOOK_SECRET=...              # Qualquer string longa (use: openssl rand -hex 32)
```

---

## Passo 3 — Deploy na Vercel

```bash
npm install
npm i -g vercel   # Se ainda não tiver a CLI

vercel login
vercel --prod
```

Adicione as variáveis de ambiente quando solicitado, ou depois em:
**vercel.com → seu projeto → Settings → Environment Variables**

Após o deploy, seu endpoint estará em:

```
https://seu-projeto.vercel.app/api/init-progress
```

---

## Passo 4 — Configurar a Automação no Notion

1. Abra a página home do curso
2. Edite o botão → **"Add automation"** (ou edite a existente)
3. Configure:
    - **Trigger**: Button clicked
    - **Action**: Send HTTP request
        - **URL**: `https://seu-projeto.vercel.app/api/init-progress`
        - **Method**: `POST`
        - **Headers**:
          | Key | Value |
          |-----|-------|
          | `Content-Type` | `application/json` |
          | `x-webhook-secret` | _(seu WEBHOOK_SECRET)_ |
        - **Body**:
            ```json
            { "userId": "{{current user.id}}" }
            ```

---

## Como o script funciona

1. Recebe o `userId` do Notion (quem clicou no botão)
2. Busca todas as aulas da database, ordenadas por `Número`
3. Verifica quais aulas já possuem entrada em Progresso para esse usuário
4. Cria as entradas faltando em lotes de 5 (respeita o rate limit da API)
5. A primeira aula recebe status **"Em andamento"**, todas as demais **"Não iniciado"**
6. É idempotente: se chamado novamente, só cria entradas para aulas ainda não cadastradas

---

## Calculando progresso no Notion (após a inicialização)

Com todas as entradas criadas, os cálculos ficam viáveis via recursos nativos:

**% de conclusão por módulo** (na database Módulos):

1. Em Módulos, crie um rollup da relação `Aulas`
2. Aponte para a relação `Progresso` nas aulas e conte entradas com status `Concluída`
3. Divida pelo total de aulas do módulo para obter a porcentagem

**% geral do aluno** (na database Progresso, agrupado por Aluno):

- Use uma view agrupada por `Aluno` com um rollup ou fórmula que conta `Concluída / total`
