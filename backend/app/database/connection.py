from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


# Cargar variables del .env
load_dotenv()

# Leer la URL desde el .env
DATABASE_URL = os.getenv("DATABASE_URL")

# Crear engine de SQLAlchemy
engine = create_engine(DATABASE_URL)

# Crear sesión local para consultas
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Dependencia para obtener sesión en endpoints
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

