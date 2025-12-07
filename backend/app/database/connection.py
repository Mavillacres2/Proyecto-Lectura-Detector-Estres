
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv


# Cargar variables del .env
load_dotenv()

# Leer la URL desde el .env
DATABASE_URL = os.getenv("DATABASE_URL")

# Corrección para Neon: Si la URL empieza con "postgres://", cámbiala a "postgresql://"
if DATABASE_URL and DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Crear engine de SQLAlchemy
engine = create_engine(DATABASE_URL)

# Crear sesión local para consultas
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

