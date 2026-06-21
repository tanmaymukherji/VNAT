import os
import re
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException

# Load environment variables from .env file in parent directory
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    # Fallback to backend directory
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(env_path):
        load_dotenv(env_path)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import sqlite3
import json
from datetime import datetime

from ocr.engine import OCRProcessor
from docx_handler import DocxHandler
from translation.factory import TranslationFactory

app = FastAPI(title="Translation Tool API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(__file__), "projects.db")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            folder_path TEXT NOT NULL,
            docx_path TEXT NOT NULL,
            name TEXT NOT NULL,
            content TEXT DEFAULT '',
            paragraphs INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_opened TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

ocr_processor = OCRProcessor()
docx_handler = DocxHandler()
translation_factory = TranslationFactory()

class ImportRequest(BaseModel):
    folder_path: str

class TranslateRequest(BaseModel):
    text: str
    src_lang: str = "auto"
    tgt_lang: str = "bn"

class SaveRequest(BaseModel):
    docx_path: str
    content: str

class SaveTranslationRequest(BaseModel):
    docx_path: str
    content: str
    target_lang: str

class InternetCheckResponse(BaseModel):
    online: bool

# Utility: Detect if text is Sanskrit
SANSKRIT_PATTERN = re.compile(r'[\u0900-\u097F]{3,}')

def is_sanskrit_text(text: str) -> bool:
    devanagari_chars = len(SANSKRIT_PATTERN.findall(text))
    total_chars = len(text.strip())
    if total_chars == 0:
        return False
    return devanagari_chars / total_chars > 0.3

def detect_language(text: str) -> str:
    devanagari = len(re.findall(r'[\u0900-\u097F]', text))
    latin = len(re.findall(r'[a-zA-Z]', text))
    total = devanagari + latin
    if total == 0:
        return "unknown"
    if latin / total > 0.6:
        return "eng_Latn"
    return "hin_Deva"

@app.get("/api/health")
def health_check():
    return {"status": "ok"}

@app.get("/api/check-internet")
def check_internet():
    import socket
    try:
        socket.create_connection(("8.8.8.8", 53), timeout=3)
        return {"online": True}
    except OSError:
        return {"online": False}

@app.get("/api/projects")
def list_projects():
    conn = get_db()
    rows = conn.execute("SELECT * FROM projects ORDER BY last_opened DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/import")
def import_folder(req: ImportRequest):
    folder = req.folder_path
    if not os.path.isdir(folder):
        raise HTTPException(status_code=400, detail="Folder does not exist")

    # Check for existing project
    conn = get_db()
    existing = conn.execute(
        "SELECT * FROM projects WHERE folder_path = ?", (folder,)
    ).fetchone()
    if existing:
        conn.close()
        return dict(existing)

    # Process images
    image_extensions = ('.png', '.jpg', '.jpeg', '.tiff', '.tif')
    image_files = sorted([
        f for f in os.listdir(folder)
        if f.lower().endswith(image_extensions)
    ])

    if not image_files:
        raise HTTPException(
            status_code=400,
            detail="No PNG, JPG, or TIFF images found in the folder"
        )

    # OCR each image
    all_paragraphs = []
    for img_file in image_files:
        img_path = os.path.join(folder, img_file)
        try:
            result = ocr_processor.process_image(img_path)
            for para in result.get("paragraphs", []):
                para_text = para.strip()
                if para_text:
                    all_paragraphs.append(para_text)
        except Exception as e:
            print(f"OCR failed for {img_file}: {e}")
            continue

    if not all_paragraphs:
        raise HTTPException(status_code=400, detail="No text could be extracted from images")

    # Generate DOCX
    docx_filename = f"{os.path.basename(folder)}_original.docx"
    docx_path = os.path.join(folder, docx_filename)

    # Build HTML content
    html_paragraphs = []
    for para in all_paragraphs:
        lang = detect_language(para)
        data_attrs = f'data-lang="{lang}"'
        if is_sanskrit_text(para):
            data_attrs += ' data-sanskrit="true"'
        html_paragraphs.append(f'<p {data_attrs}>{para}</p>')

    content_html = "\n".join(html_paragraphs)

    # Save DOCX
    docx_handler.create_docx(all_paragraphs, docx_path)

    # Save to DB
    project_name = os.path.basename(folder)
    conn.execute(
        "INSERT INTO projects (folder_path, docx_path, name, content, paragraphs, last_opened) VALUES (?, ?, ?, ?, ?, ?)",
        (folder, docx_path, project_name, content_html, len(all_paragraphs), datetime.now().isoformat())
    )
    conn.commit()
    project_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    project = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()

    return dict(project)

@app.post("/api/translate/hf")
def translate_huggingface(req: TranslateRequest):
    if is_sanskrit_text(req.text):
        return {"translation": req.text, "note": "Sanskrit text kept as-is"}

    src = req.src_lang
    if src == "auto":
        src = detect_language(req.text)

    try:
        result = translation_factory.translate("huggingface", req.text, src, req.tgt_lang)
        return {"translation": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/translate/bhashini")
def translate_bhashini(req: TranslateRequest):
    if is_sanskrit_text(req.text):
        return {"translation": req.text, "note": "Sanskrit text kept as-is"}

    src = req.src_lang
    if src == "auto":
        src = detect_language(req.text)

    try:
        result = translation_factory.translate("bhashini", req.text, src, req.tgt_lang)
        return {"translation": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save")
def save_document(req: SaveRequest):
    # Update DOCX with edited content
    try:
        docx_handler.update_docx(req.docx_path, req.content)
        # Update DB
        conn = get_db()
        conn.execute(
            "UPDATE projects SET content = ?, last_opened = ? WHERE docx_path = ?",
            (req.content, datetime.now().isoformat(), req.docx_path)
        )
        conn.commit()
        conn.close()
        return {"success": True, "docx_path": req.docx_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save-translation")
def save_translation(req: SaveTranslationRequest):
    original_path = req.docx_path
    folder = os.path.dirname(original_path)
    base_name = os.path.basename(original_path).replace("_original.docx", "")

    # Build the translated filename
    translated_filename = f"{base_name}_{req.target_lang if req.target_lang != 'original' else 'original'}.docx"
    translated_path = os.path.join(folder, translated_filename)

    try:
        docx_handler.create_docx_from_html(req.content, translated_path)
        return {"success": True, "docx_path": translated_path, "filename": translated_filename}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
