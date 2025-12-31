from sqlalchemy import Column, Integer, String
from app.database.connection import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)   # ← actualizado
    email = Column(String(255), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    # Nuevos campos añadidos
    # edad y genero
    age = Column(Integer, nullable=True)
    gender = Column(String(10), nullable=True)
    role = Column(String(20), default="student")