# app/api/admin.py
from fastapi import APIRouter, HTTPException, Depends
from app.database.mongo import mongo_db
from app.database.connection import SessionLocal
from app.models.user import User
from sqlalchemy.orm import Session
from datetime import datetime

router = APIRouter(prefix="/admin", tags=["admin"])

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# 1. Dashboard Global: Conteo general
@router.get("/global-stats")
def get_global_stats():
    collection = mongo_db["stress_evaluations"]
    
    # Contar cuántos hay de cada nivel
    total = collection.count_documents({})
    bajos = collection.count_documents({"final_stress_level": "Bajo"})
    medios = collection.count_documents({"final_stress_level": "Medio"})
    altos = collection.count_documents({"final_stress_level": "Alto"})
    
    return {
        "total_evaluations": total,
        "distribution": [
            {"name": "Bajo", "value": bajos, "fill": "#4caf50"},
            {"name": "Medio", "value": medios, "fill": "#ff9800"},
            {"name": "Alto", "value": altos, "fill": "#f44336"},
        ]
    }

# 2. Lista de Estudiantes (Para seleccionarlos)
@router.get("/students")
def get_students(db: Session = Depends(get_db)):
    # Traer solo usuarios que sean estudiantes
    users = db.query(User).filter(User.role == 'student').all()
    return [{"id": u.id, "name": u.full_name, "email": u.email} for u in users]

# 3. Historial de un Estudiante Específico
@router.get("/student-history/{user_id}")
def get_student_history(user_id: int):
    # Buscar todas las evaluaciones de ese ID en Mongo
    cursor = mongo_db["stress_evaluations"].find({"user_id": user_id}).sort("created_at", 1)
    
    history = []
    for doc in cursor:
        history.append({
            "date": doc["created_at"].strftime("%Y-%m-%d %H:%M"),
            "pss_score": doc.get("pss_score", 0),
            "negative_ratio": doc.get("negative_ratio", 0) * 100, # Convertir a %
            "final_level": doc.get("final_stress_level", "Medio")
        })
        
    return history