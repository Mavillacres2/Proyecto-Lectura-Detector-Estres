import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, accuracy_score
import joblib
import os

# ==========================================
# CONFIGURACIÓN
# ==========================================
ARCHIVO_DATOS = "dataset_entrenamiento_balanceado.csv"
ARCHIVO_MODELO = "stress_model.pkl"

def main():
    print("🚀 INICIANDO ENTRENAMIENTO DEL MODELO DE ESTRÉS...\n")

    # 1. CARGAR DATOS
    if not os.path.exists(ARCHIVO_DATOS):
        print(f"❌ ERROR: No encuentro el archivo '{ARCHIVO_DATOS}'")
        return

    df = pd.read_csv(ARCHIVO_DATOS)
    print(f"✅ Datos cargados. Total registros brutos: {len(df)}")

    # 2. DEFINIR COLUMNAS (FEATURES Y TARGET)
    # Estas son las variables que el modelo usará para "ver" la cara
    features = [
        'neutral_avg', 
        'happiness_avg', 
        'sadness_avg', 
        'anger_avg', 
        'fear_avg', 
        'disgust_avg', 
        'surprise_avg',
        'negative_ratio' 
    ]
    
    # Esta es la respuesta que el modelo debe aprender a predecir
    target = 'pss_level' 

    # 3. LIMPIEZA FINAL DE SEGURIDAD
    # Eliminamos filas donde falten datos
    df = df.dropna(subset=features + [target])
    
    # Eliminamos filas donde TODAS las emociones sean 0 (Error de cámara)
    # Sumamos las columnas de emociones, si da 0, la borramos.
    cols_emociones = ['neutral_avg', 'happiness_avg', 'sadness_avg', 'anger_avg', 
                      'fear_avg', 'disgust_avg', 'surprise_avg']
    df = df[df[cols_emociones].sum(axis=1) > 0]

    print(f"✅ Datos limpios para entrenar: {len(df)} registros.")

    # 4. PREPARAR MATRICES X e y
    X = df[features]
    y = df[target]

    # 5. DIVIDIR DATOS (Train/Test Split)
    # 80% para entrenar (aprender), 20% para testear (examen final)
    # stratify=y asegura que haya la misma proporción de alto/medio/bajo en ambos grupos
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"📊 Entrenando con {len(X_train)} ejemplos...")
    print(f"📊 Probando con {len(X_test)} ejemplos...\n")

    # 6. ENTRENAR EL MODELO (Random Forest)
    # Creamos un 'Bosque' de 100 árboles de decisión
    print("⏳ Entrenando cerebro digital (Random Forest)...")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    print("✅ ¡Entrenamiento completado!")

    # 7. EVALUAR EL MODELO
    # Hacemos que el modelo prediga los datos de prueba que NUNCA ha visto
    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    print("\n================ RESULTADOS ================")
    print(f"🎯 Precisión Global (Accuracy): {accuracy * 100:.2f}%")
    print("--------------------------------------------")
    print("Detalle por nivel de estrés:")
    print(classification_report(y_test, y_pred))
    print("============================================\n")

    # 8. GUARDAR EL MODELO (.pkl)
    joblib.dump(model, ARCHIVO_MODELO)
    print(f"💾 IA GUARDADA: Se generó el archivo '{ARCHIVO_MODELO}'")
    print("👉 Mueve este archivo a tu carpeta 'backend/app/models' (o donde cargues la IA).")

if __name__ == "__main__":
    main()