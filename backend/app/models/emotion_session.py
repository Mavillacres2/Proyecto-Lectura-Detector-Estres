from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.database.connection import Base

class EmotionSession(Base):
    __tablename__ = "emotion_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow)
