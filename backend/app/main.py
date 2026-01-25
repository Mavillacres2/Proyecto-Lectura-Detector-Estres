from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.emotions import router as emotions_router
from app.api.ws import ws_router
from app.database.connection import Base, engine

from app.api.pss import router as pss_router

from app.api.admin import router as admin_router

Base.metadata.create_all(bind=engine)

app = FastAPI()

origins = [
    "http://localhost:5173",
    "https://proyecto-lectura-detector-estres.vercel.app",
]

# CAMBIO IMPORTANTE: Permitir todo (*) para evitar errores en el primer deploy
app.add_middleware(
    CORSMiddleware,
      allow_origins=["*"],  
    # Esto permite: https://proyecto-lectura-detector-estres-CUALQUIERCOSA.vercel.app
    allow_origin_regex="https://proyecto-lectura-detector-estres.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Las rutas finales serán:
#   /api/auth/register
#   /api/auth/login
app.include_router(auth_router, prefix="/api")
app.include_router(emotions_router, prefix="/api")
app.include_router(pss_router, prefix="/api")
app.include_router(ws_router)



app.include_router(admin_router)

