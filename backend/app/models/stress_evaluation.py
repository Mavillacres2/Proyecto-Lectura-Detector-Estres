# app/models/stress_evaluation.py
from sqlalchemy import Column, Integer, String, Float, DateTime
from datetime import datetime
from app.database.connection import Base

class StressEvaluation(Base):
    __tablename__ = "stress_evaluations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True)
    session_id = Column(String, index=True)

    age = Column(Integer, nullable=True)
    gender = Column(String(10), nullable=True)

    anger_avg = Column(Float)
    fear_avg = Column(Float)
    sadness_avg = Column(Float)
    happiness_avg = Column(Float)
    disgust_avg = Column(Float)
    surprise_avg = Column(Float)
    neutral_avg = Column(Float)
    negative_ratio = Column(Float)

    pss_score = Column(Integer)
    pss_level = Column(String(20))
    emotion_level = Column(String(20))

    created_at = Column(DateTime, default=datetime.utcnow)
