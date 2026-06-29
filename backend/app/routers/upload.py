import os
import subprocess
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import List

router = APIRouter()

FACEBOOK_LEADS_DIR = r"C:\Users\BrunoPereiradeMeloAr\Desktop\Projetos\Marketing e Pitch\Marketing\leads_facebook"
PITCHYES_CALLS_DIR = r"C:\Users\BrunoPereiradeMeloAr\Desktop\Projetos\Marketing e Pitch\analise PitchYEs\chamadas_pitchyes"
SCRIPT_PATH = r"C:\Users\BrunoPereiradeMeloAr\Desktop\lead-analytics\Database\build_database.py"

@router.post("/facebook")
async def upload_facebook_leads(files: List[UploadFile] = File(...)):
    if not os.path.exists(FACEBOOK_LEADS_DIR):
        os.makedirs(FACEBOOK_LEADS_DIR)
        
    saved_files = []
    for file in files:
        file_path = os.path.join(FACEBOOK_LEADS_DIR, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        saved_files.append(file.filename)
    
    return {"message": f"Successfully uploaded {len(saved_files)} Facebook leads files.", "files": saved_files}

@router.post("/pitchyes")
async def upload_pitchyes_calls(files: List[UploadFile] = File(...)):
    if not os.path.exists(PITCHYES_CALLS_DIR):
        os.makedirs(PITCHYES_CALLS_DIR)
        
    saved_files = []
    for file in files:
        file_path = os.path.join(PITCHYES_CALLS_DIR, file.filename)
        with open(file_path, "wb") as f:
            content = await file.read()
            f.write(content)
        saved_files.append(file.filename)
    
    return {"message": f"Successfully uploaded {len(saved_files)} PitchYES call files.", "files": saved_files}

@router.post("/run-build")
async def run_build_database():
    try:
        # Run the script and capture output
        result = subprocess.run(
            ["python", SCRIPT_PATH], 
            capture_output=True, 
            text=True, 
            check=True,
            cwd=os.path.dirname(SCRIPT_PATH)
        )
        return {"message": "Database built successfully.", "output": result.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Script failed with output: {e.stdout}\nError: {e.stderr}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
