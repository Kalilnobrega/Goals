# Goals

Uma API RESTful robusta e inteligente construída com **FastAPI** para gerenciamento de Metas (Goals) e Tarefas (Tasks). 

Diferente de um simples "To-Do List", este sistema possui um motor avançado para lidar com **Hábitos Recorrentes**, calculando automaticamente o progresso das metas com base em um sistema de pontuação e gerenciando janelas de tempo de forma autônoma.

## 🚀 Funcionalidades Principais

* **Autenticação Segura:** Registro de usuários e Login via JWT (JSON Web Tokens). O acesso às rotas é estritamente protegido, garantindo que usuários gerenciem apenas seus próprios dados.
* **CRUD de Metas (Goals):** Criação, leitura, atualização e exclusão de objetivos de vida ou de estudo.
* **Progresso Dinâmico (Gamificação):** As metas calculam a própria porcentagem de conclusão (`progress`) em tempo real, baseando-se no peso de tarefas normais vs. hábitos, sem sobrecarregar o banco de dados.
* **Histórico de Conquistas:** Filtros inteligentes integrados na rota de listagem (`GET /goals/?status=COMPLETED`) para separar metas ativas de metas concluídas.
* **Motor de Hábitos (Recurring Tasks):** Tarefas podem ser configuradas com recorrência (ex: "Fazer todo dia", "Fazer a cada 2 dias") e limite máximo (ex: "Ler por 30 dias"). A API possui uma rotina que detecta a passagem do tempo e reseta a tarefa automaticamente caso a janela de oportunidade tenha expirado.

## 🛠️ Tecnologias Utilizadas

* **Linguagem:** Python 3
* **Framework Web:** FastAPI
* **ORM & Banco de Dados:** SQLAlchemy e SQLite
* **Migrações:** Alembic
* **Validação de Dados:** Pydantic
* **Segurança:** Autenticação JWT (Passlib, python-jose)
* **Servidor ASGI:** Uvicorn

## ⚙️ Como rodar o projeto localmente

**1. Clone o repositório e entre na pasta**
```bash
git clone [https://github.com/seu-usuario/seu-repositorio.git](https://github.com/seu-usuario/seu-repositorio.git)
cd seu-repositorio/backend

2. Crie e ative um ambiente virtual
# No Windows:
python -m venv venv
venv\Scripts\activate

# No Mac/Linux:
python3 -m venv venv
source venv/bin/activate

3. Instale as dependências
pip install -r requirements.txt

4. Rode as migrações do banco de dados
alembic upgrade head

5. Inicie o servidor
uvicorn app.main:app --reload

A API estará rodando em http://127.0.0.1:8000.
Para acessar a documentação interativa e testar as rotas, acesse o Swagger UI em: http://127.0.0.1:8000/docs.

📚 Estrutura de Endpoints (API)
A documentação completa está disponível no Swagger, mas aqui estão as rotas principais:

Autenticação

POST /auth/register - Cadastra um novo usuário.

POST /auth/login - Recebe e-mail/senha e devolve o Token JWT.

Metas (Goals)

POST /goals/ - Cria uma nova meta.

GET /goals/ - Lista as metas (Aceita Query Parameter opcional ?status=OPEN ou ?status=COMPLETED).

PUT /goals/{id} - Edita uma meta.

DELETE /goals/{id} - Apaga uma meta e todas as suas tarefas (Cascade).

Tarefas (Tasks)

POST /tasks/{goal_id} - Cria uma tarefa/hábito dentro de uma meta.

GET /tasks/goal/{goal_id} - Lista todas as tarefas de uma meta específica.

PUT /tasks/{id} - Atualiza dados da tarefa (inclui lógica de reset automático ao transformar task normal em hábito).

DELETE /tasks/{id} - Apaga a tarefa.

🧠 Arquitetura: O Motor de Progresso
O sistema utiliza o conceito de Fat Models (Modelos Gordos). O cálculo da barra de progresso não é armazenado fisicamente no banco de dados para evitar requisições desnecessárias. Ele é gerado sob demanda usando a anotação @property do Python no modelo do SQLAlchemy, cruzando o peso da tarefa com a contagem de recorrências.