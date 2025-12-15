# app/api/pss.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, conint
from sqlalchemy.orm import Session
from typing import Dict, Any
from datetime import datetime
import pandas as pd
import joblib
import os
import numpy as np

from app.database.connection import SessionLocal
from app.database.mongo import mongo_db
from app.models.user import User

router = APIRouter(prefix="/pss", tags=["pss"])

# --- 1. CARGA DEL MODELO DE IA ---
# Buscamos el archivo .pkl en la carpeta superior 'models' o donde lo hayas puesto
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # Sube un nivel a 'app'
MODEL_PATH = os.path.join(BASE_DIR, "models", "stress_model.pkl") 

# Variable global para el modelo
stress_model = None

try:
    stress_model = joblib.load(MODEL_PATH)
    print(f"✅ Cerebro Digital (IA) cargado desde: {MODEL_PATH}")
except Exception as e:
    print(f"⚠️ ADVERTENCIA: No se pudo cargar el modelo de IA. Ruta buscada: {MODEL_PATH}")
    print(f"   Error: {e}")
    # El sistema funcionará, pero solo con el cuestionario (modo fallback)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class PSSSubmitPayload(BaseModel):
    user_id: int
    session_id: str
    pss_score: conint(ge=0, le=40)

# --- 2. FUNCIONES AUXILIARES ---

def categorize_pss(score: int) -> str:
    """Clasificación estándar del PSS-10"""
    if score <= 13: return "bajo"
    elif score <= 26: return "medio"
    else: return "alto"

def compute_emotion_stats(session_id: str):
    """Calcula promedios de las emociones guardadas en Mongo para esta sesión"""
    docs = list(mongo_db["emotions"].find({"session_id": session_id}))

    if not docs:
        return None, 0.0

    # Crear DataFrame para facilitar cálculos
    # Extraemos solo la parte de 'emotions' de cada documento
    emotions_list = [d["emotions"] for d in docs]
    df = pd.DataFrame(emotions_list)
    
    # Calcular promedios
    averages = df.mean().to_dict()
    
    # Renombrar claves para que coincidan con lo que espera el modelo (si es necesario)
    # Tu modelo espera: neutral_avg, happiness_avg...
    # Tus datos en mongo vienen como: neutral, happy, sad...
    mapping = {
        'neutral': 'neutral_avg', 'happy': 'happiness_avg', 'sad': 'sadness_avg',
        'angry': 'anger_avg', 'fearful': 'fear_avg', 'disgusted': 'disgust_avg',
        'surprised': 'surprise_avg'
    }
    
    final_features = {}
    for k_mongo, k_model in mapping.items():
        final_features[k_model] = averages.get(k_mongo, 0.0)

    # Calcular Negative Ratio (Suma de emociones negativas > umbral)
    # Emociones negativas: angry, fearful, sad, disgusted
    neg_cols = [c for c in ['angry', 'fearful', 'sad', 'disgusted'] if c in df.columns]
    
    # Suma de negativas por fila
    if neg_cols:
        neg_sum = df[neg_cols].sum(axis=1)
        # Si la suma de negativas es > 0.1, se considera un "frame negativo"
        negative_count = (neg_sum > 0.1).sum()
        negative_ratio = negative_count / len(df)
    else:
        negative_ratio = 0.0
        
    final_features['negative_ratio'] = negative_ratio
    
    return final_features, negative_ratio

def fusion_algoritmo(nivel_pss_txt: str, nivel_facial_txt: str) -> str:
    """Algoritmo de Fusión 60/40 (Test vs Cara)"""
    mapa_valor = {"bajo": 1, "medio": 2, "alto": 3}
    mapa_texto = {1: "Bajo", 2: "Medio", 3: "Alto"}
    
    val_pss = mapa_valor.get(nivel_pss_txt, 1)
    # Si la IA falló o dio error, asumimos neutro (1) o seguimos al PSS
    val_face = mapa_valor.get(nivel_facial_txt, val_pss) 
    
    # FÓRMULA MATEMÁTICA
    # 60% PSS (Validado científicamente) + 40% IA (Experimental)
    score_final = (val_pss * 0.6) + (val_face * 0.4)
    
    # Redondeo simple (1.6 -> 2, 1.4 -> 1)
    resultado_num = int(round(score_final))
    
    return mapa_texto.get(resultado_num, "Medio")

# --- 3. ENDPOINT PRINCIPAL ---

@router.post("/submit")
def submit_pss(payload: PSSSubmitPayload, db: Session = Depends(get_db)):
    print(f"📥 Recibiendo PSS para sesión: {payload.session_id}")

    # A. Validar Usuario
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    # B. Calcular Nivel PSS (Cuestionario)
    pss_level = categorize_pss(payload.pss_score)
    
    # C. Obtener Datos de la Cámara y Usar IA
    features_ia, negative_ratio = compute_emotion_stats(payload.session_id)
    
    emotion_level_ia = "desconocido"
    
    if features_ia and stress_model:
        try:
            # Crear DataFrame con una sola fila para predecir
            # Importante: El orden de columnas debe ser IGUAL al entrenamiento
            cols_modelo = [
                'neutral_avg', 'happiness_avg', 'sadness_avg', 'anger_avg', 
                'fear_avg', 'disgust_avg', 'surprise_avg', 'negative_ratio' 
            ]
            df_input = pd.DataFrame([features_ia])
            # Reordenar y asegurar que estén todas las columnas (rellenar con 0 si falta)
            for col in cols_modelo:
                if col not in df_input.columns:
                    df_input[col] = 0.0
            df_input = df_input[cols_modelo]
            
            # PREDICCIÓN
            prediccion = stress_model.predict(df_input)[0] # Devuelve "bajo", "medio" o "alto"
            emotion_level_ia = prediccion
            print(f"🤖 IA Predice: {emotion_level_ia}")
            
        except Exception as e:
            print(f"❌ Error en predicción IA: {e}")
            emotion_level_ia = "error"
    else:
        print("⚠️ No hay datos de cámara o modelo no cargado.")
        # Fallback simple si no hay IA
        if negative_ratio > 0.4: emotion_level_ia = "alto"
        elif negative_ratio > 0.15: emotion_level_ia = "medio"
        else: emotion_level_ia = "bajo"

    # D. Fusión de Datos
    nivel_final_fusionado = fusion_algoritmo(pss_level, emotion_level_ia)

    # E. Guardar en MongoDB
    # Convertimos los keys de vuelta a formato simple para guardar limpio
    # (Opcional, pero ordenado)
    avg_to_save = {}
    if features_ia:
        # mapeo inverso simple para visualización
        inv_map = {'neutral_avg': 'neutral', 'happiness_avg': 'happy', 'sadness_avg': 'sad', 
                   'anger_avg': 'angry', 'fear_avg': 'fearful', 'disgust_avg': 'disgusted', 'surprise_avg': 'surprised'}
        for k_ia, v in features_ia.items():
            if k_ia in inv_map:
                avg_to_save[inv_map[k_ia]] = v

    evaluation_doc = {
        "user_id": user.id,
        "session_id": payload.session_id,
        "age": user.age,
        "gender": user.gender,
        "pss_score": payload.pss_score,
        
        # Resultados
        "pss_level": pss_level,                # Resultado del Test
        "facial_level": emotion_level_ia,      # Resultado de la IA
        "final_stress_level": nivel_final_fusionado, # Resultado FUSIONADO
        
        # Métricas crudas
        "negative_ratio": negative_ratio,
        "emotion_averages": avg_to_save,
        
        "created_at": datetime.utcnow()
    }

    mongo_db["stress_evaluations"].insert_one(evaluation_doc)

    # F. Retornar al Frontend
    # Esto es lo que recibe EmotionDetector.tsx -> res.data
    return {
        "pss_score": payload.pss_score,
        "pss_level": pss_level,           # Texto: "medio"
        "emotion_level": emotion_level_ia, # Texto: "bajo" (lo que dijo la IA)
        "nivel_final": nivel_final_fusionado, # Texto: "Medio" (la fusión)
        
        # Para gráficos
        "negative_ratio": negative_ratio,
        "emotion_averages": avg_to_save,
    }