# app/services/auth_utils.py
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "SECRET_LOCAL_TEST")
ALGORITHM = "HS256"

# ⬇⬇⬇ CAMBIO IMPORTANTE AQUÍ
# Antes: schemes=["bcrypt"]
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
# ⬆⬆⬆

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)

def create_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(hours=3)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
