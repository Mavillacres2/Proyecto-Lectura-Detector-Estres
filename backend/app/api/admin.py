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

# 1. Dashboard Global: Conteo INTELIGENTE (Solo último estado por alumno)
@router.get("/global-stats")
def get_global_stats():
    collection = mongo_db["stress_evaluations"]
    
    # Pipeline de Agregación de MongoDB
    pipeline = [
        # 1. Ordenar por fecha descendente (el más reciente primero)
        {"$sort": {"created_at": -1}},
        
        # 2. Agrupar por ID de usuario y tomar solo el PRIMER resultado (el más reciente)
        {"$group": {
            "_id": "$user_id",
            "latest_level": {"$first": "$final_stress_level"}
        }},
        
        # 3. Contar cuántos hay de cada nivel en este grupo filtrado
        {"$group": {
            "_id": "$latest_level",
            "count": {"$sum": 1}
        }}
    ]
    
    # Ejecutar la consulta
    results = list(collection.aggregate(pipeline))
    
    # Inicializar contadores en 0 por si alguna categoría no tiene nadie
    counts = {"Bajo": 0, "Medio": 0, "Alto": 0}
    
    # Mapear los resultados de Mongo a nuestro diccionario
    for r in results:
        # r["_id"] es la categoría (ej: "Alto")
        if r["_id"] in counts:
            counts[r["_id"]] = r["count"]
            
    # Calcular el total real de alumnos únicos
    total_unique_students = sum(counts.values())
    
    return {
        "total_evaluations": total_unique_students,
        "distribution": [
            {"name": "Bajo", "value": counts["Bajo"], "fill": "#4caf50"},
            {"name": "Medio", "value": counts["Medio"], "fill": "#ff9800"},
            {"name": "Alto", "value": counts["Alto"], "fill": "#f44336"},
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