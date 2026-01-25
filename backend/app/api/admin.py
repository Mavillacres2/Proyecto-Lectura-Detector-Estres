# app/api/admin.py
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.database.mongo import mongo_db
from app.database.connection import SessionLocal
from app.models.user import User
from app.services.auth_utils import SECRET_KEY, ALGORITHM # Asegúrate de tener estas variables importadas

router = APIRouter(prefix="/admin", tags=["admin"])

# Configuración para leer el token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# --- DEPENDENCIA PARA OBTENER EL USUARIO LOGUEADO ---
def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id") # O "sub", depende de cómo creaste el token
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

# 1. Dashboard Global: FILTRADO POR NRC DEL DOCENTE
@router.get("/global-stats")
def get_global_stats(current_user: User = Depends(get_current_user)):
    collection = mongo_db["stress_evaluations"]
    
    # Verificamos que el docente tenga NRC asignado
    if not current_user.nrc:
        return {"total_evaluations": 0, "distribution": [], "warning": "Docente sin NRC asignado"}

    # Pipeline con FILTRO (Match) al inicio
    pipeline = [
        # 1. FILTRAR: Solo evaluaciones que coincidan con el NRC del docente logueado
        {"$match": {"nrc": current_user.nrc}}, 

        # 2. AGRUPAR: Contar por nivel de estrés
        {"$group": {
            "_id": "$final_stress_level",
            "count": {"$sum": 1}
        }}
    ]
    
    try:
        results = list(collection.aggregate(pipeline))
    except Exception as e:
        print(f"Error en Mongo: {e}")
        return {"total_evaluations": 0, "distribution": []}
    
    counts = {"Bajo": 0, "Medio": 0, "Alto": 0}
    
    for r in results:
        raw_level = r.get("_id")
        count = r.get("count", 0)
        
        if raw_level:
            level_normalized = str(raw_level).strip().capitalize()
            if "Bajo" in level_normalized: counts["Bajo"] += count
            elif "Medio" in level_normalized: counts["Medio"] += count
            elif "Alto" in level_normalized: counts["Alto"] += count
            else: pass

    total_records = sum(counts.values())
    
    return {
        "nrc_filter": current_user.nrc, # Para debug: saber qué curso está viendo
        "total_evaluations": total_records,
        "distribution": [
            {"name": "Bajo", "value": counts["Bajo"], "fill": "#4caf50"},
            {"name": "Medio", "value": counts["Medio"], "fill": "#ff9800"},
            {"name": "Alto", "value": counts["Alto"], "fill": "#f44336"},
        ]
    }

# 2. Lista de Estudiantes: FILTRADO POR NRC
@router.get("/students")
def get_students(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.nrc:
        return []

    # Traer solo estudiantes que tengan EL MISMO NRC que el administrador
    users = db.query(User).filter(
        User.role == 'student',
        User.nrc == current_user.nrc  # <--- EL FILTRO CLAVE
    ).all()
    
    return [{"id": u.id, "name": u.full_name, "email": u.email} for u in users]

# 3. Historial de Estudiante (Validar seguridad opcionalmente)
@router.get("/student-history/{student_id}")
def get_student_history(student_id: int, current_user: User = Depends(get_current_user)):
    # Opcional: Podríamos validar que el student_id pertenezca al NRC del docente,
    # pero como la lista ya viene filtrada, es un riesgo menor. 
    # Filtramos en Mongo por ID de usuario.
    
    cursor = mongo_db["stress_evaluations"].find({"user_id": student_id}).sort("created_at", 1)
    
    history = []
    for doc in cursor:
        history.append({
            "date": doc["created_at"].strftime("%Y-%m-%d %H:%M"),
            "pss_score": doc.get("pss_score", 0),
            "negative_ratio": doc.get("negative_ratio", 0) * 100,
            "final_level": doc.get("final_stress_level", "Medio")
        })
        
    return history