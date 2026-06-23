# Lead Analytics Dashboard

Plataforma Web Fullstack para análise de leads, integrando dados de upload XLSX com backend Databricks e CRM Meta.

## Estrutura do Projeto

- **frontend/**: Interface do usuário em HTML/JS Vanilla.
- **backend/**: API em Python com FastAPI.
- **docs/**: Documentação técnica e de arquitetura.

## Requisitos Prévios

- Python 3.10 ou superior
- Node.js (opcional, para utilitários de desenvolvimento)
- Docker & Docker Compose

## Configuração e Setup Inicial

### Backend

1. Navegue até a pasta do backend:
   ```bash
   cd backend
   ```
2. Crie um ambiente virtual:
   ```bash
   python -m venv venv
   ```
3. Ative o ambiente virtual:
   - Windows: `venv\Scripts\activate`
   - Linux/macOS: `source venv/bin/activate`
4. Instale as dependências:
   ```bash
   pip install -r requirements.txt
   ```
5. Configure as variáveis de ambiente baseando-se no arquivo `.env.example`.

### Frontend

1. O frontend é servido como arquivos estáticos. Você pode abrir o `frontend/index.html` diretamente no navegador ou servir usando um servidor local simples.

### Executando com Docker

Para iniciar a aplicação completa com Docker Compose, execute na raiz do projeto:
```bash
docker-compose up --build
```
