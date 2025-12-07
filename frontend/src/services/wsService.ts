/*const ws = new WebSocket("ws://127.0.0.1:8000/ws/emotions");

let ws: WebSocket;

export const sendWS = (data: any) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
};

ws.onopen = () => {
  console.log("WebSocket conectado");
};

ws.onmessage = (msg) => {
  console.log("Respuesta WS:", msg.data);
};*/


// 1. Obtenemos la URL base (ej: https://mi-backend.onrender.com o http://127.0.0.1:8000)
const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// 2. Convertimos HTTP a WS automáticamente
// Si es 'https', se vuelve 'wss'. Si es 'http', se vuelve 'ws'.
const WS_BASE = BASE_URL.replace(/^http/, 'ws'); 
const WS_URL = `${WS_BASE}/ws/emotions`;

let ws: WebSocket;

export const connectWS = () => {
    // Evitar reconectar si ya existe y está abierto o conectando
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return; 
    }

    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log("🟢 WebSocket conectado a:", WS_URL);
    };

    ws.onclose = () => {
        console.log("🔴 WebSocket desconectado");
    };

    ws.onerror = (error) => {
        console.error("⚠️ Error en WS:", error);
    };
};

// Iniciamos conexión al cargar el archivo
connectWS();

export const sendWS = (data: any) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  } else {
    // Opcional: reintentar conexión si se cayó
    // connectWS();
  }
};