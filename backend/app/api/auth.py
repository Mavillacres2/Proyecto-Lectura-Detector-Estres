# app/api/auth.py
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.models.user import User
from app.services.auth_utils import hash_password, verify_password, create_token

router = APIRouter(prefix="/auth", tags=["auth"])  # <--- OJO

# Dependencia para obtener la sesión de BD
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class RegisterPayload(BaseModel):
    full_name: str
    email: str
    password: str
    age: int
    gender: str


class LoginPayload(BaseModel):
    email: str
    password: str


@router.post("/register")
async def register(data: RegisterPayload, db: Session = Depends(get_db)):
    # verificar si email ya existe
    exists = db.query(User).filter(User.email == data.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="El usuario ya existe")

    # crear usuario con contraseña hasheada
    new_user = User(
    full_name=data.full_name,
    email=data.email,
    password=hash_password(data.password),
    age=data.age,
    gender=data.gender,
)


    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "Usuario registrado correctamente"}


@router.post("/login")
async def login(data: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")

    token = create_token({"user_id": user.id})

    # Devolvemos lo que espera el front
    return {
        "message": "Login exitoso",
        "user_id": user.id,
        "full_name": user.full_name,
        "token": token,
        "role": user.role,
    }
