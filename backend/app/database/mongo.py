from pymongo import MongoClient
from dotenv import load_dotenv
import os

# Cargar las variables de entorno desde el archivo .env
load_dotenv()

# Obtener la URI de MongoDB desde las variables de entorno
MONGO_URI = os.getenv("MONGO_URI")

# Crear una instancia del cliente de MongoDB
client = MongoClient(MONGO_URI)
mongo_db = client["stress"]
