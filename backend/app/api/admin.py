from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.database.mongo import mongo_db
from app.database.connection import SessionLocal
from app.models.user import User
from app.services.auth_utils import SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/admin", tags=["admin"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudieron validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    return user

# --- 1. DASHBOARD GLOBAL: FOTO ACTUAL DEL AULA ---
@router.get("/global-stats")
def get_global_stats(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    # Si el docente no tiene NRC, retornamos vacío
    if not current_user.nrc:
        return {
            "total_evaluated": 0, 
            "total_enrolled": 0, 
            "distribution": [], 
            "warning": "Docente sin NRC"
        }

    # A. TOTAL INSCRITOS (SQL): ¿Cuántos alumnos hay en la lista oficial?
    # Esto cuenta a todos (los que hicieron test y los que no)
    total_enrolled = db.query(User).filter(
        User.role == 'student',
        User.nrc == current_user.nrc
    ).count()

    # B. TOTAL EVALUADOS ÚNICOS (MongoDB): ¿Cuál es el estado actual de los que participaron?
    pipeline = [
        # 1. Filtramos: Solo exámenes de este curso (NRC)
        {"$match": {"nrc": current_user.nrc}},
        
        # 2. Ordenamos: Del más reciente al más antiguo
        {"$sort": {"created_at": -1}},
        
        # 3. Agrupamos por ALUMNO: Nos quedamos solo con su PRIMER registro (el más reciente)
        # Esto elimina las repeticiones. Si Juan hizo 5 tests, solo cuenta el último.
        {"$group": {
            "_id": "$user_id",
            "latest_level": {"$first": "$final_stress_level"} # Ej: "Alto"
        }},
        
        # 4. Contamos: ¿Cuántos alumnos quedaron en cada nivel?
        {"$group": {
            "_id": "$latest_level",
            "count": {"$sum": 1}
        }}
    ]
    
    try:
        results = list(mongo_db["stress_evaluations"].aggregate(pipeline))
    except Exception as e:
        print(f"Error en Mongo: {e}")
        return {"total_evaluated": 0, "total_enrolled": total_enrolled, "distribution": []}
    
    # Procesamos los resultados para que el Frontend los entienda fácil
    counts = {"Bajo": 0, "Medio": 0, "Alto": 0}
    
    for r in results:
        raw_level = r.get("_id") # Ej: "Medio"
        count = r.get("count", 0) # Ej: 5
        
        if raw_level:
            # Normalizamos texto (por si guardaste "medio" minúscula alguna vez)
            level_norm = str(raw_level).strip().capitalize()
            
            if "Bajo" in level_norm: counts["Bajo"] += count
            elif "Medio" in level_norm: counts["Medio"] += count
            elif "Alto" in level_norm: counts["Alto"] += count

    # El total de EVALUADOS es la suma de los niveles (NO la lista de inscritos)
    total_evaluated = sum(counts.values())
    
    return {
        "nrc_filter": current_user.nrc,
        "total_evaluated": total_evaluated,  # Ej: 3 alumnos han dado la prueba
        "total_enrolled": total_enrolled,    # Ej: 5 alumnos existen en total
        "distribution": [
            {"name": "Bajo", "value": counts["Bajo"], "fill": "#4caf50"},
            {"name": "Medio", "value": counts["Medio"], "fill": "#ff9800"},
            {"name": "Alto", "value": counts["Alto"], "fill": "#f44336"},
        ]
    }

# 2. Lista de Estudiantes
@router.get("/students")
def get_students(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not current_user.nrc: return []
    users = db.query(User).filter(User.role == 'student', User.nrc == current_user.nrc).all()
    return [{"id": u.id, "name": u.full_name, "email": u.email} for u in users]

# 3. Historial de Estudiante
@router.get("/student-history/{student_id}")
def get_student_history(student_id: int, current_user: User = Depends(get_current_user)):
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