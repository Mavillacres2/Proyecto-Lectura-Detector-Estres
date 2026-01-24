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

# 1. Dashboard Global: MODO TOTAL (Cuenta todo lo que existe en la base de datos)
@router.get("/global-stats")
def get_global_stats():
    collection = mongo_db["stress_evaluations"]
    
    # Lógica Directa: Agrupar por nivel de estrés y contar TODO lo que hay.
    # No filtramos por usuario único. Si hay 58 registros, contará 58.
    pipeline = [
        {"$group": {
            "_id": "$final_stress_level", # Agrupa por Bajo, Medio, Alto
            "count": {"$sum": 1}          # Suma 1 por cada documento encontrado
        }}
    ]
    
    # Ejecutar la consulta en Mongo
    results = list(collection.aggregate(pipeline))
    
    # Inicializar contadores en 0 (por si nadie tiene estrés "Bajo", por ejemplo)
    counts = {"Bajo": 0, "Medio": 0, "Alto": 0}
    
    # Pasar los resultados de la base de datos a nuestro formato
    for r in results:
        # r["_id"] es el nivel (ej: "Alto") y r["count"] es la cantidad
        if r["_id"] in counts:
            counts[r["_id"]] = r["count"]
            
    # Calcular el total sumando las tres categorías
    total_records = sum(counts.values())
    
    return {
        "total_evaluations": total_records, # Aquí saldrá 58 si tienes 58 registros
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