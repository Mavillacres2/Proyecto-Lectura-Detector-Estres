from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from app.database.mongo import mongo_db
from app.database.connection import SessionLocal
from app.models.emotion_session import EmotionSession

router = APIRouter()

class EmotionPayload(BaseModel):
    user_id: int
    session_id: str      # 👈 importante
    emotions: dict
    timestamp: float

@router.post("/emotions")
async def save_emotion(payload: EmotionPayload):

    mongo_db["emotions"].insert_one({
        "user_id": payload.user_id,
        "session_id": payload.session_id,   # 👈 aquí también
        "emotions": payload.emotions,
        "timestamp": payload.timestamp,
        "created_at": datetime.utcnow()
    })

    db = SessionLocal()
    session = EmotionSession(
        user_id=str(payload.user_id),
        timestamp=datetime.utcfromtimestamp(payload.timestamp)
    )
    db.add(session)
    db.commit()
    db.close()

    return {"status": "ok"}
