# app/api/pss.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, conint
from sqlalchemy.orm import Session
from typing import Dict
from datetime import datetime

# Usamos Postgres solo para LEER el usuario (rápido), y Mongo para TODO lo demás
from app.database.connection import SessionLocal
from app.database.mongo import mongo_db
from app.models.user import User
# from app.models.stress_evaluation import StressEvaluation  <-- YA NO LO USAMOS

router = APIRouter(prefix="/pss", tags=["pss"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class PSSSubmitPayload(BaseModel):
    user_id: int
    session_id: str
    pss_score: conint(ge=0, le=40)

def categorize_pss(score: int) -> str:
    if score <= 13: return "bajo"
    elif score <= 26: return "medio"
    else: return "alto"

STRESS_EMOTIONS = {"angry", "disgusted", "fearful"}

def compute_emotion_stats(session_id: str):
    # 1. Buscamos las emociones crudas en Mongo
    docs = list(mongo_db["emotions"].find({"session_id": session_id}))

    if not docs:
        keys = ["angry", "disgusted", "fearful", "happy", "sad", "surprised", "neutral"]
        return {k: 0.0 for k in keys}, 0.0

    keys = list(docs[0]["emotions"].keys())
    totals: Dict[str, float] = {k: 0.0 for k in keys}
    total_frames = 0
    stress_frames = 0

    for doc in docs:
        emotions = doc["emotions"]
        total_frames += 1
        for k in keys:
            totals[k] += float(emotions.get(k, 0.0))
        dominant = max(emotions, key=emotions.get)
        if dominant in STRESS_EMOTIONS:
            stress_frames += 1

    averages = {k: totals[k] / total_frames for k in keys}
    negative_ratio = stress_frames / total_frames if total_frames > 0 else 0

    return averages, negative_ratio

def level_from_ratio(r: float) -> str:
    if r >= 0.75: return "alto"
    elif r >= 0.40: return "medio"
    else: return "bajo"

@router.post("/submit")
def submit_pss(payload: PSSSubmitPayload, db: Session = Depends(get_db)):

    # 1. Obtenemos datos demográficos del usuario (Postgres - Lectura Rápida)
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # 2. Cálculos matemáticos
    pss_level = categorize_pss(payload.pss_score)
    averages, negative_ratio = compute_emotion_stats(payload.session_id)
    emotion_level = level_from_ratio(negative_ratio)

    # 3. GUARDAR RESULTADO EN MONGODB (En lugar de Postgres)
    evaluation_doc = {
        "user_id": user.id,
        "session_id": payload.session_id,
        "age": user.age,
        "gender": user.gender,
        "anger_avg": averages.get("angry", 0.0),
        "fear_avg": averages.get("fearful", 0.0),
        "sadness_avg": averages.get("sad", 0.0),
        "happiness_avg": averages.get("happy", 0.0),
        "disgust_avg": averages.get("disgusted", 0.0),
        "surprise_avg": averages.get("surprised", 0.0),
        "neutral_avg": averages.get("neutral", 0.0),
        "negative_ratio": negative_ratio,
        "pss_score": payload.pss_score,
        "pss_level": pss_level,
        "emotion_level": emotion_level,
        "created_at": datetime.utcnow()
    }

    # Insertamos en la colección 'stress_evaluations'
    mongo_db["stress_evaluations"].insert_one(evaluation_doc)

    return {
        "pss_score": payload.pss_score,
        "pss_level": pss_level,
        "emotion_level": emotion_level,
        "negative_ratio": negative_ratio,
        "emotion_averages": averages,
    }