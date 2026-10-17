<div align="center">

# 🎯 Goals

**Defina metas, construa hábitos e acompanhe sua evolução — sozinho ou em grupo.**

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.128-009688?logo=fastapi&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)

<img src="docs/screenshots/inicio.jpg" alt="Página inicial do Goals" width="100%">

</div>

---

## Sumário

- [Sobre o projeto](#sobre-o-projeto)
- [Funcionalidades](#funcionalidades)
- [Telas](#telas)
- [Tecnologias](#tecnologias)
- [Arquitetura](#arquitetura)
- [Como rodar localmente](#como-rodar-localmente)
- [Testes](#testes)
- [Referência da API](#referência-da-api)
- [Deploy](#deploy)

## Sobre o projeto

O **Goals** é uma aplicação web para gerenciar objetivos pessoais. Mais do que uma lista de tarefas, ele entende **como** cada meta é alcançada: concluindo etapas, repetindo um hábito por ciclos ou acompanhando um número até um alvo.

O progresso é calculado automaticamente, hábitos recorrentes são reiniciados no horário de Brasília, a sequência de dias ativos (streak) é mantida sozinha e uma página de estatísticas mostra padrões de produtividade ao longo do ano. Metas também podem ser compartilhadas, de forma colaborativa ou como desafio entre amigos.

## Funcionalidades

### Três tipos de meta

| Tipo | Para que serve | Exemplo |
| --- | --- | --- |
| **Alvo** | Concluir um conjunto de tarefas até um objetivo | "Tirar a CNH" |
| **Recorrente** | Repetir uma atividade a cada ciclo (dia, semana, mês ou personalizado) | "Ler 2 livros por mês" |
| **Progresso** | Acompanhar um valor numérico, somando registros ou medindo o valor atual | "Economizar R$ 10.000", "Chegar a 78 kg" |

### Tarefas e hábitos

- Tarefas simples ou **hábitos recorrentes**, a cada N dias ou em dias específicos da semana.
- Limite de repetições ou "até o prazo da meta", com contagem automática de ocorrências.
- Reinício automático dos hábitos a cada janela de tempo, no fuso de Brasília.
- Reordenação por arrastar e soltar, inclusive no celular.

### Metas compartilhadas

- **Colaborativa:** uma única meta com progresso coletivo. Cada tarefa mostra quem a concluiu.
- **Desafio:** cada participante recebe uma cópia da meta, com progresso individual e **ranking**.
- Convites por link com validade de 7 dias e limite de 20 participantes.
- Cargos de **líder**, **moderador** e **membro**, com transferência de liderança.
- Ao sair de um desafio, a cópia vira uma meta pessoal, sem perder o histórico.

### Acompanhamento

- Página inicial com resumo, calendário de prazos, tarefas do dia e alerta de metas atrasadas.
- **Streak** de dias ativos com recorde pessoal.
- Previsão de conclusão para metas de progresso, com base no ritmo atual.
- Histórico e taxa de consistência dos ciclos de metas recorrentes.

### Estatísticas

- Mapa de atividade dos últimos 12 meses, filtrável por meta.
- Horários e dia da semana mais produtivos.
- Maiores sequências, tarefas mais concluídas e hábitos que estão ficando para trás.
- Gráficos de evolução das metas de progresso.

### Conta e segurança

- Cadastro com verificação de e-mail e login com Google.
- Autenticação JWT com refresh token rotativo e revogação no logout.
- Recuperação de senha por e-mail.
- Limite de requisições nas rotas sensíveis.
- Edição de nome, troca de senha e exclusão de conta.

## Telas

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/metas.jpg" alt="Lista de metas"><p align="center"><b>Metas</b> — filtros, busca e status</p></td>
    <td width="50%"><img src="docs/screenshots/meta-progresso.jpg" alt="Meta de progresso"><p align="center"><b>Meta de progresso</b> — evolução e previsão</p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/desafio.jpg" alt="Desafio com ranking"><p align="center"><b>Desafio</b> — ranking entre participantes</p></td>
    <td width="50%"><img src="docs/screenshots/colaborativa.jpg" alt="Meta colaborativa"><p align="center"><b>Meta colaborativa</b> — participantes e autoria</p></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/estatisticas.jpg" alt="Estatísticas"><p align="center"><b>Estatísticas</b> — atividade, horários e sequências</p></td>
    <td width="50%"><img src="docs/screenshots/convite.jpg" alt="Convite para meta"><p align="center"><b>Convite</b> — entrada em uma meta compartilhada</p></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mobile-inicio.jpg" alt="Início no celular" width="260">
  &nbsp;&nbsp;
  <img src="docs/screenshots/mobile-metas.jpg" alt="Metas no celular" width="260">
  <br>
  <b>Totalmente responsivo</b>
</p>

## Tecnologias

**Backend**

- [FastAPI](https://fastapi.tiangolo.com/) e Uvicorn
- [SQLAlchemy 2](https://www.sqlalchemy.org/) com [Alembic](https://alembic.sqlalchemy.org/) para migrações
- PostgreSQL (SQLite como alternativa para desenvolvimento)
- Pydantic para validação
- python-jose, Passlib e bcrypt para autenticação
- SlowAPI para limite de requisições
- [Resend](https://resend.com/) para envio de e-mails
- Pytest

**Frontend**

- [Next.js 16](https://nextjs.org/) (App Router) e React 19
- CSS Modules com visual em *glassmorphism*
- dnd-kit para arrastar e soltar
- Axios, com renovação automática do token
- Lucide para ícones
- Login com Google via `@react-oauth/google`

## Arquitetura

```
Goals/
├── backend/
│   ├── app/
│   │   ├── main.py          # Configuração da aplicação, CORS e rate limit
│   │   ├── models.py        # Modelos SQLAlchemy e cálculo de progresso
│   │   ├── schemas.py       # Schemas Pydantic de entrada e saída
│   │   ├── access.py        # Permissões de metas pessoais e compartilhadas
│   │   ├── sharing.py       # Regras de grupos: sair, liderança, cópias
│   │   ├── dates.py         # Datas no fuso de Brasília
│   │   └── routers/         # auth, goals, tasks, groups, stats
│   ├── alembic/             # Migrações do banco
│   └── tests/               # Testes automatizados
├── frontend/
│   └── src/
│       ├── app/             # Páginas (App Router)
│       ├── components/      # Componentes reutilizáveis
│       ├── lib/             # Cliente da API, autenticação e utilitários
│       └── styles/          # Estilos globais e de formulários
└── docs/screenshots/        # Imagens deste README
```

Algumas decisões de projeto:

- **Progresso calculado, não armazenado.** O percentual de cada meta é uma `@property` do modelo, derivada das tarefas, registros e ciclos. Isso evita valores desatualizados no banco.
- **Ciclos registrados.** Ao fim de cada ciclo de uma meta recorrente, o resultado é salvo em `goal_cycle_logs`, o que alimenta o histórico e a consistência.
- **Permissões centralizadas.** Todo acesso a metas passa por `access.py`, que define quem pode ver, agir, editar e excluir conforme o tipo de meta e o cargo no grupo.
- **Desafios por cópia.** Cada participante de um desafio tem uma meta própria, e as edições do líder são sincronizadas entre as cópias. Assim, todo o cálculo de progresso existente é reaproveitado.

## Como rodar localmente

### Pré-requisitos

- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (opcional em desenvolvimento)

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
```

Crie o arquivo `backend/.env`:

```bash
SECRET_KEY=uma-chave-secreta-aleatoria
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
DATABASE_URL=postgresql+psycopg://goals_app:sua-senha@localhost:5432/goals_db
FRONTEND_URL=http://localhost:3000
GOOGLE_CLIENT_ID=seu-google-client-id
GOOGLE_CLIENT_SECRET=seu-google-client-secret
RESEND_KEY=sua-chave-do-resend
```

| Variável | Obrigatória | Descrição |
| --- | :---: | --- |
| `SECRET_KEY` | ✅ | Chave usada para assinar os tokens JWT |
| `ALGORITHM` | ✅ | Algoritmo do JWT, normalmente `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | ✅ | Validade do token de acesso |
| `REFRESH_TOKEN_EXPIRE_DAYS` | ✅ | Validade do refresh token |
| `DATABASE_URL` | | Conexão com o banco. Sem ela, é usado o SQLite `banco.db` |
| `FRONTEND_URL` | | Origens liberadas no CORS e base dos links enviados por e-mail. Aceita várias, separadas por vírgula |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | Login com Google |
| `RESEND_KEY` | | Envio de e-mails de verificação e de recuperação de senha |
| `LOG_LEVEL` | | Nível de log (padrão `INFO`) |

Para usar PostgreSQL localmente:

```bash
brew install postgresql@16 && brew services start postgresql@16
createuser goals_app --pwprompt
createdb goals_db --owner=goals_app
```

Aplique as migrações e inicie a API:

```bash
alembic upgrade head
uvicorn app.main:app --reload
```

A API fica em http://localhost:8000, com documentação interativa em http://localhost:8000/docs.

### Frontend

```bash
cd frontend
npm install
```

Crie o arquivo `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

O client id do login com Google fica em `src/app/layout.js`. Para usar outro projeto do Google, troque-o lá e no `GOOGLE_CLIENT_ID` do backend.

```bash
npm run dev
```

O app fica em http://localhost:3000.

## Testes

O backend tem uma suíte de testes com banco SQLite em memória, cobrindo autenticação, metas numéricas e recorrentes, hábitos, streak, estatísticas, reordenação e metas compartilhadas.

```bash
cd backend
pytest
```

## Referência da API

A documentação completa e interativa está disponível em `/docs`. Todas as rotas, exceto as de cadastro, login e recuperação de conta, exigem o cabeçalho `Authorization: Bearer <token>`.

<details>
<summary><b>Autenticação e conta</b> — <code>/auth</code></summary>

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/auth/register` | Cadastra um usuário e envia o e-mail de verificação |
| `POST` | `/auth/verify-email` | Confirma o e-mail |
| `POST` | `/auth/login` | Login com e-mail e senha |
| `POST` | `/auth/google` | Login com Google |
| `POST` | `/auth/refresh` | Renova o token de acesso |
| `POST` | `/auth/logout` | Revoga o refresh token |
| `POST` | `/auth/forgot-password` | Envia o link de redefinição de senha |
| `POST` | `/auth/reset-password` | Define uma nova senha |
| `GET` | `/auth/me` | Dados do usuário logado |
| `PATCH` | `/auth/me` | Altera o nome |
| `POST` | `/auth/me/password` | Troca a senha |
| `DELETE` | `/auth/me` | Exclui a conta |
| `GET` | `/auth/me/streak` | Streak atual e recorde |

</details>

<details>
<summary><b>Metas</b> — <code>/goals</code></summary>

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/goals/` | Lista as metas, com filtro opcional `?status=open\|completed\|late` |
| `POST` | `/goals/` | Cria uma meta |
| `PUT` | `/goals/order` | Salva a ordem das metas |
| `GET` | `/goals/{id}` | Detalha uma meta |
| `PUT` | `/goals/{id}` | Edita uma meta |
| `DELETE` | `/goals/{id}` | Exclui uma meta |
| `GET` | `/goals/{id}/cycles` | Histórico de ciclos de uma meta recorrente |
| `GET` | `/goals/{id}/progress` | Evolução e previsão de uma meta de progresso |
| `GET` | `/goals/{id}/entries` | Lista os registros de valor |
| `POST` | `/goals/{id}/entries` | Adiciona um registro de valor |
| `DELETE` | `/goals/{id}/entries/{entry_id}` | Remove um registro |

</details>

<details>
<summary><b>Tarefas</b> — <code>/tasks</code></summary>

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/tasks/today` | Tarefas pendentes para hoje |
| `GET` | `/tasks/goal/{goal_id}` | Tarefas de uma meta |
| `POST` | `/tasks/{goal_id}` | Cria uma tarefa ou hábito |
| `PUT` | `/tasks/goal/{goal_id}/order` | Salva a ordem das tarefas |
| `PATCH` | `/tasks/{id}/toggle` | Marca ou desmarca uma tarefa |
| `PUT` | `/tasks/{id}` | Edita uma tarefa |
| `DELETE` | `/tasks/{id}` | Exclui uma tarefa |

</details>

<details>
<summary><b>Metas compartilhadas</b> — <code>/groups</code></summary>

| Método | Rota | Descrição |
| --- | --- | --- |
| `POST` | `/groups/` | Compartilha uma meta como colaborativa ou desafio |
| `GET` | `/groups/{id}` | Participantes, cargos e ranking |
| `POST` | `/groups/{id}/invites` | Gera um link de convite |
| `GET` | `/groups/invites/{token}` | Pré-visualiza um convite |
| `POST` | `/groups/invites/{token}/accept` | Aceita um convite |
| `PATCH` | `/groups/{id}/members/{user_id}` | Promove ou rebaixa um moderador |
| `POST` | `/groups/{id}/transfer` | Transfere a liderança |
| `DELETE` | `/groups/{id}/members/{user_id}` | Remove um participante ou sai do grupo |

</details>

<details>
<summary><b>Estatísticas</b> — <code>/stats</code></summary>

| Método | Rota | Descrição |
| --- | --- | --- |
| `GET` | `/stats/` | Atividade do último ano, horários, sequências, rankings de tarefas e evolução das metas |

</details>

## Deploy

O projeto está preparado para o [Railway](https://railway.com/):

- **Backend:** o `backend/railway.json` executa `alembic upgrade head` antes de cada deploy e sobe a API com Uvicorn.
- **Frontend:** o `frontend/Procfile` inicia o Next.js na porta definida pela plataforma, depois do `npm run build`.

Em produção, configure `DATABASE_URL` com um PostgreSQL gerenciado e `FRONTEND_URL` com o domínio do frontend, para liberar o CORS e gerar os links dos e-mails corretamente.

---

<div align="center">

Desenvolvido por [Kalil Nobrega](https://github.com/Kalilnobrega)

</div>
