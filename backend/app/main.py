from fastapi import FastAPI

# Crear una instancia de la aplicación FastAPI
app = FastAPI()

# Definir una ruta raíz para verificar que la API está funcionando
@app.get("/")
def root():
    return {"message": "API funcionando"}




