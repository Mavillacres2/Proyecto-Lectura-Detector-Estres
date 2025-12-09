from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from app.database.mongo import mongo_db
# ⚡ OPTIMIZACIÓN: Quitamos imports de SQL para no usarlo aquí
# from app.database.connection import SessionLocal
# from app.models.emotion_session import EmotionSession

router = APIRouter()

class EmotionPayload(BaseModel):
    user_id: int
    session_id: str
    emotions: dict
    timestamp: float

@router.post("/emotions")
async def save_emotion(payload: EmotionPayload):

    # 1. Guardar SOLO en MongoDB (Esto es rápido y no bloquea)
    mongo_db["emotions"].insert_one({
        "user_id": payload.user_id,
        "session_id": payload.session_id,
        "emotions": payload.emotions,
        "timestamp": payload.timestamp,
        "created_at": datetime.utcnow()
    })

    # ⚡ OPTIMIZACIÓN: Eliminada la escritura a SQL por cada frame.
    # SQL solo se usará al final del test (en pss.py) para el resumen.
    
    return {"status": "ok"}