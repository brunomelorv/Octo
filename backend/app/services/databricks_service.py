import os
import asyncio
import logging
from dotenv import load_dotenv
from databricks import sql

# Configure logging
logger = logging.getLogger("app.services.databricks_service")

# Load environment variables from .env file
load_dotenv()

class DatabricksService:
    def __init__(self, host: str = None, token: str = None, http_path: str = None):
        """
        Initializes the DatabricksService reading connection details from parameters
        or environment variables.
        """
        raw_host = host or os.getenv("DATABRICKS_HOST")
        self.token = token or os.getenv("DATABRICKS_TOKEN")
        self.http_path = http_path or os.getenv("DATABRICKS_HTTP_PATH")
        
        # Clean host name (remove http:// or https:// and any trailing paths)
        if raw_host:
            self.host = raw_host.replace("https://", "").replace("http://", "").split("/")[0]
        else:
            self.host = None

        if not self.host or not self.token or not self.http_path:
            logger.warning(
                "Configurações de conexão do Databricks incompletas. "
                f"DATABRICKS_HOST={'definido' if self.host else 'ausente'}, "
                f"DATABRICKS_TOKEN={'definido' if self.token else 'ausente'}, "
                f"DATABRICKS_HTTP_PATH={'definido' if self.http_path else 'ausente'}."
            )

    def get_connection(self):
        """
        Establishes and returns a connection using databricks-sql-connector.
        """
        if not self.host or not self.token or not self.http_path:
            raise ValueError(
                "Não é possível conectar ao Databricks: variáveis de conexão incompletas no arquivo .env."
            )
        
        try:
            logger.info("Estabelecendo conexão com o Databricks SQL Warehouse...")
            connection = sql.connect(
                server_hostname=self.host,
                http_path=self.http_path,
                access_token=self.token
            )
            logger.info("Conexão com o Databricks estabelecida com sucesso.")
            return connection
        except Exception as e:
            logger.error(f"Erro de conexão com o Databricks: {str(e)}", exc_info=True)
            raise

    def _execute_query(self, sql_query: str, params: dict = None) -> list[dict]:
        """
        Synchronous helper to run the query using a single connection and cursor.
        """
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cursor:
                    if params:
                        logger.debug(f"Executando query no Databricks com parâmetros: {sql_query}")
                        cursor.execute(sql_query, params)
                    else:
                        logger.debug(f"Executando query no Databricks: {sql_query}")
                        cursor.execute(sql_query)
                    
                    description = cursor.description
                    if description is None:
                        # Em caso de queries que não retornam resultados (ex: DDL/DML)
                        return []
                    
                    columns = [desc[0] for desc in description]
                    rows = cursor.fetchall()
                    
                    # Converte cada linha em um dicionário
                    return [dict(zip(columns, row)) for row in rows]
        except Exception as e:
            logger.error(f"Erro ao executar query no Databricks: {str(e)}", exc_info=True)
            raise

    async def query(self, sql: str, params: dict = None) -> list[dict]:
        """
        Executes a SQL query asynchronously and returns the results as a list of dictionaries.
        """
        # Executa no thread pool para não bloquear o loop de eventos assíncrono do FastAPI
        return await asyncio.to_thread(self._execute_query, sql, params)

    async def get_campanhas(self, data_inicio=None, data_fim=None) -> list[dict]:
        """
        Queries the table bcj.marketing.campanhas with optional date filters.
        """
        query_str = "SELECT * FROM bcj.marketing.campanhas"
        conditions = []
        params = {}

        if data_inicio:
            conditions.append("data >= :data_inicio")
            params["data_inicio"] = data_inicio
        if data_fim:
            conditions.append("data <= :data_fim")
            params["data_fim"] = data_fim

        if conditions:
            query_str += " WHERE " + " AND ".join(conditions)
        
        # Ordenar por data decrescente por padrão
        query_str += " ORDER BY data DESC"

        return await self.query(query_str, params)
