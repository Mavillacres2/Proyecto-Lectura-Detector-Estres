import pandas as pd
import numpy as np
from pymongo import MongoClient

# ==========================================
# 1. CONFIGURACIÓN Y CONEXIÓN
# ==========================================
# ⚠️ REEMPLAZA ESTO CON TUS DATOS REALES SI ES NECESARIO
MONGO_URI = "mongodb+srv://mavillacres_db_user:1234@cluster0.k2jdk0q.mongodb.net/?appName=Cluster0" 
DB_NAME = "stress_detector"
COLLECTION_NAME = "stress_evaluations"  # Donde guardas los resultados del test

def conectar_mongo():
    try:
        client = MongoClient(MONGO_URI)
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        print("✅ Conexión a MongoDB exitosa.")
        return collection
    except Exception as e:
        print(f"❌ Error al conectar a MongoDB: {e}")
        return None

# ==========================================
# 2. LÓGICA DE GENERACIÓN SINTÉTICA
# ==========================================

def crear_bajo_estres(row):
    """
    Toma un registro real (Medio) y lo 'relaja' para crear un caso de Estrés Bajo.
    """
    new_row = row.copy()
    
    # Lógica: Reducir lo negativo, aumentar felicidad/neutralidad
    new_row['sadness_avg'] = max(0, row['sadness_avg'] * 0.1)  # Reducimos tristeza al 10%
    new_row['anger_avg'] = max(0, row['anger_avg'] * 0.1)      # Reducimos ira
    new_row['fear_avg'] = max(0, row['fear_avg'] * 0.1)
    new_row['disgust_avg'] = max(0, row['disgust_avg'] * 0.1)
    
    # Aumentar felicidad (entre 20% y 50% más)
    new_row['happiness_avg'] = min(1.0, row['happiness_avg'] + np.random.uniform(0.2, 0.5))
    
    # La neutralidad suele ser alta en bajo estrés
    new_row['neutral_avg'] = np.random.uniform(0.5, 0.9)
    
    # El ratio negativo debe ser casi nulo
    new_row['negative_ratio'] = np.random.uniform(0.0, 0.05) 
    
    # ETIQUETAS OBJETIVO
    new_row['pss_level'] = 'bajo'
    new_row['pss_score'] = np.random.randint(0, 14) # Rango oficial PSS Bajo (0-13)
    
    return new_row

def crear_alto_estres(row):
    """
    Toma un registro real (Medio) y lo 'intensifica' para crear un caso de Estrés Alto.
    """
    new_row = row.copy()
    
    # Factor de amplificación para emociones negativas (3x a 6x)
    factor = np.random.uniform(3.0, 6.0)
    
    # Lógica: Disparar lo negativo, eliminar felicidad
    new_row['sadness_avg'] = min(1.0, row['sadness_avg'] * factor)
    
    # A veces el estrés se manifiesta como ira o miedo, forzamos un poco si está muy bajo
    new_row['anger_avg'] = min(1.0, max(0.15, row['anger_avg'] * factor)) 
    new_row['fear_avg'] = min(1.0, max(0.05, row['fear_avg'] * factor))
    
    new_row['happiness_avg'] = 0.01 # Casi nula
    
    # La neutralidad baja drásticamente porque la cara está tensa
    new_row['neutral_avg'] = max(0.1, row['neutral_avg'] - 0.4)
    
    # El ratio negativo sube (simulamos > 20% para que el modelo aprenda)
    # No usamos >75% forzosamente para ser realistas con el entorno académico
    new_row['negative_ratio'] = min(1.0, np.random.uniform(0.25, 0.60))
    
    # ETIQUETAS OBJETIVO
    new_row['pss_level'] = 'alto'
    new_row['pss_score'] = np.random.randint(27, 40) # Rango oficial PSS Alto (27-40)
    
    return new_row

# ==========================================
# 3. FLUJO PRINCIPAL
# ==========================================

def main():
    collection = conectar_mongo()
    
    # 🔴 CORRECCIÓN AQUÍ: Usamos 'is None' en lugar de 'not collection'
    if collection is None: 
        return

    # 1. Obtener datos reales
    # Excluimos _id para evitar duplicados al crear nuevos registros
    try:
        cursor = collection.find({}, {"_id": 0})
        data = list(cursor)
    except Exception as e:
        print(f"❌ Error al leer datos: {e}")
        return
    
    if not data:
        print("⚠️ No hay datos en la base de datos para usar como semilla.")
        return

    df_real = pd.DataFrame(data)
    print(f"--> Registros originales descargados: {len(df_real)}")

    # Filtramos solo los registros 'medio' para usarlos de base (semilla)
    # Si tienes algunos 'bajo' o 'alto' reales, también los usaremos en el final
    df_semilla = df_real[df_real['pss_level'] == 'medio']
    
    if len(df_semilla) == 0:
        print("⚠️ No encontré registros con nivel 'medio' para usar de base. Usando todos.")
        df_semilla = df_real

    print(f"--> Usando {len(df_semilla)} registros como base para generar sintéticos.")

    # 2. Generar datos sintéticos
    # Aplicamos las funciones a cada fila de nuestros datos semilla
    print("--> Generando datos de clase 'bajo'...")
    df_bajo = df_semilla.apply(crear_bajo_estres, axis=1)
    
    print("--> Generando datos de clase 'alto'...")
    df_alto = df_semilla.apply(crear_alto_estres, axis=1)

    # 3. Unir todo (Real + Sintético Bajo + Sintético Alto)
    # Esto triplica tu dataset y lo deja perfectamente balanceado
    df_final = pd.concat([df_real, df_bajo, df_alto], ignore_index=True)

    # 4. Limpieza final (Asegurar que no haya valores negativos o > 1 por error matemático)
    columnas_numericas = ['anger_avg', 'fear_avg', 'sadness_avg', 'happiness_avg', 
                          'disgust_avg', 'surprise_avg', 'neutral_avg', 'negative_ratio']
    
    for col in columnas_numericas:
        if col in df_final.columns:
            df_final[col] = df_final[col].clip(0, 1) # Fuerza valores entre 0 y 1

    # 5. Guardar
    nombre_archivo = "dataset_entrenamiento_balanceado.csv"
    df_final.to_csv(nombre_archivo, index=False)
    
    print("\n========================================")
    print(f"✅ ¡ÉXITO! Dataset generado: {nombre_archivo}")
    print(f"📊 Total de registros para entrenar: {len(df_final)}")
    if 'pss_level' in df_final.columns:
        print("Distribución de clases:")
        print(df_final['pss_level'].value_counts())
    print("========================================")

if __name__ == "__main__":
    main()