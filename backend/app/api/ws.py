from fastapi import APIRouter, WebSocket
from app.database.mongo import mongo_db
from datetime import datetime

ws_router = APIRouter()

@ws_router.websocket("/ws/emotions")
async def ws_emotions(websocket: WebSocket):
    await websocket.accept()

    while True:
        data = await websocket.receive_json()

        mongo_db["emotions_stream"].insert_one({
            "user_id": data["user_id"],
            "emotions": data["emotions"],
            "timestamp": data["timestamp"],
            "created_at": datetime.utcnow()
        })

        await websocket.send_json({"status": "received"})
