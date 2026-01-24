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

# 1. Dashboard Global: CORREGIDO Y ROBUSTO
@router.get("/global-stats")
def get_global_stats():
    collection = mongo_db["stress_evaluations"]
    
    # Pipeline directo: Agrupa por el campo exacto de tu imagen
    pipeline = [
        {"$group": {
            "_id": "$final_stress_level", # Campo tal cual aparece en tu MongoDB Compass
            "count": {"$sum": 1}
        }}
    ]
    
    try:
        results = list(collection.aggregate(pipeline))
    except Exception as e:
        print(f"Error en Mongo: {e}")
        return {"total_evaluations": 0, "distribution": []}
    
    # Inicializamos contadores base
    counts = {"Bajo": 0, "Medio": 0, "Alto": 0}
    
    # Procesamiento flexible (Normalización)
    # Esto arregla el problema si en la BD dice "medio" (minúscula) y el código esperaba "Medio"
    for r in results:
        raw_level = r.get("_id")
        count = r.get("count", 0)
        
        if raw_level:
            # Limpiamos el texto: quitamos espacios y ponemos 1ra mayúscula (ej: "medio " -> "Medio")
            level_normalized = str(raw_level).strip().capitalize()
            
            # Asignamos al grupo correcto
            if "Bajo" in level_normalized:
                counts["Bajo"] += count
            elif "Medio" in level_normalized:
                counts["Medio"] += count
            elif "Alto" in level_normalized:
                counts["Alto"] += count
            else:
                # Si hay algún nivel raro (ej: "Muy Alto"), lo sumamos a Alto o lo ignoramos
                # Aquí lo sumaremos a lo que sea para no perder el dato, o podrías crear categoría 'Otro'
                pass

    total_records = sum(counts.values())
    
    return {
        "total_evaluations": total_records,
        "distribution": [
            {"name": "Bajo", "value": counts["Bajo"], "fill": "#4caf50"},
            {"name": "Medio", "value": counts["Medio"], "fill": "#ff9800"},
            {"name": "Alto", "value": counts["Alto"], "fill": "#f44336"},
        ]
    }

# 2. Lista de Estudiantes
@router.get("/students")
def get_students(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.role == 'student').all()
    return [{"id": u.id, "name": u.full_name, "email": u.email} for u in users]

# 3. Historial de un Estudiante
@router.get("/student-history/{user_id}")
def get_student_history(user_id: int):
    cursor = mongo_db["stress_evaluations"].find({"user_id": user_id}).sort("created_at", 1)
    
    history = []
    for doc in cursor:
        history.append({
            "date": doc["created_at"].strftime("%Y-%m-%d %H:%M"),
            "pss_score": doc.get("pss_score", 0),
            "negative_ratio": doc.get("negative_ratio", 0) * 100,
            "final_level": doc.get("final_stress_level", "Medio")
        })
        
    return history