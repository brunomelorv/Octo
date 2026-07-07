import os
import subprocess
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import List

router = APIRouter()

from pathlib import Path
from dotenv import load_dotenv
from app.routers.auth import get_current_user, require_user_manager
from app.models.user import UserResponse

load_dotenv()

logger = logging.getLogger(__name__)

# Base project directory (leads-analytics root)
BASE_DIR = Path(__file__).resolve().parents[3]

def _resolve_path(env_var: str, default: Path) -> str:
    """Returns the env var value as an absolute path.
    If the value is a relative path, resolves it relative to BASE_DIR."""
    val = os.getenv(env_var)
    if not val:
        return str(default)
    p = Path(val)
    if p.is_absolute():
        return str(p)
    # Relative path — resolve against BASE_DIR
    return str((BASE_DIR / p).resolve())

FACEBOOK_LEADS_DIR = _resolve_path(
    "FACEBOOK_LEADS_DIR",
    BASE_DIR / "Database" / "leads_facebook"
)
PITCHYES_CALLS_DIR = _resolve_path(
    "PITCHYES_CALLS_DIR",
    BASE_DIR / "Database" / "chamadas_pitchyes"
)
SCRIPT_PATH = _resolve_path(
    "SCRIPT_PATH",
    BASE_DIR / "Database" / "build_database.py"
)

# Maximum file size: 50 MB
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024

# Allowed extensions per upload type
FACEBOOK_ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls"}
PITCHYES_ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json"}


def _validate_file(file: UploadFile, allowed_extensions: set[str]) -> None:
    """Validates file extension and enforces naming safety."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")

    ext = Path(file.filename).suffix.lower()
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não permitido: '{ext}'. Permitidos: {', '.join(sorted(allowed_extensions))}",
        )

    # Prevent path traversal
    safe_name = Path(file.filename).name
    if safe_name != file.filename:
        raise HTTPException(status_code=400, detail="Nome de arquivo inválido.")


@router.post("/facebook")
async def upload_facebook_leads(
    files: List[UploadFile] = File(...),
    current_user: UserResponse = Depends(get_current_user),
):
    if not os.path.exists(FACEBOOK_LEADS_DIR):
        os.makedirs(FACEBOOK_LEADS_DIR)

    saved_files = []
    for file in files:
        _validate_file(file, FACEBOOK_ALLOWED_EXTENSIONS)

        content = await file.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Arquivo '{file.filename}' excede o limite de {MAX_FILE_SIZE_BYTES // (1024*1024)} MB.",
            )

        file_path = os.path.join(FACEBOOK_LEADS_DIR, Path(file.filename).name)
        with open(file_path, "wb") as f:
            f.write(content)
        saved_files.append(file.filename)
        logger.info("Upload Facebook: %s por %s", file.filename, current_user.email)

    return {"message": f"Upload de {len(saved_files)} arquivo(s) realizado com sucesso.", "files": saved_files}


@router.post("/pitchyes")
async def upload_pitchyes_calls(
    files: List[UploadFile] = File(...),
    current_user: UserResponse = Depends(get_current_user),
):
    if not os.path.exists(PITCHYES_CALLS_DIR):
        os.makedirs(PITCHYES_CALLS_DIR)

    saved_files = []
    for file in files:
        _validate_file(file, PITCHYES_ALLOWED_EXTENSIONS)

        content = await file.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Arquivo '{file.filename}' excede o limite de {MAX_FILE_SIZE_BYTES // (1024*1024)} MB.",
            )

        file_path = os.path.join(PITCHYES_CALLS_DIR, Path(file.filename).name)
        with open(file_path, "wb") as f:
            f.write(content)
        saved_files.append(file.filename)
        logger.info("Upload PitchYes: %s por %s", file.filename, current_user.email)

    return {"message": f"Upload de {len(saved_files)} arquivo(s) realizado com sucesso.", "files": saved_files}


@router.post("/run-build")
async def run_build_database(
    current_user: UserResponse = Depends(require_user_manager),
):
    """
    Executa o script de construção do banco de dados.
    Requer role: master, head ou administrativo.
    """
    logger.info("run-build solicitado por %s (role=%s)", current_user.email, current_user.role)
    try:
        result = subprocess.run(
            ["python", SCRIPT_PATH],
            capture_output=True,
            text=True,
            check=True,
            cwd=os.path.dirname(SCRIPT_PATH),
            timeout=300,  # 5 minutes max
        )
        return {"message": "Banco de dados reconstruído com sucesso.", "output": result.stdout}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timeout: o script demorou mais de 5 minutos.")
    except subprocess.CalledProcessError as e:
        logger.error("run-build falhou: %s", e.stderr)
        raise HTTPException(status_code=500, detail=f"Script falhou.\nErro: {e.stderr}")
    except Exception as e:
        logger.exception("Erro inesperado no run-build")
        raise HTTPException(status_code=500, detail="Erro interno do servidor.")
