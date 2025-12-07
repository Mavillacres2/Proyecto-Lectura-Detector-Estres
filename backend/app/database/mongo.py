# app/database/mongo.py
from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")

mongo_client = None
mongo_db = None

try:
    mongo_client = MongoClient(MONGO_URL, serverSelectionTimeoutMS=3000)
    # Hacemos un ping rápido; si falla, usamos None
    mongo_client.admin.command("ping")
    mongo_db = mongo_client["stress_detector"]
    print("✅ Conectado a MongoDB")
except Exception as e:
    print("⚠️ MongoDB NO disponible:", e)
    mongo_client = None
    mongo_db = None
