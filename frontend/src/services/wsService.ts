const ws = new WebSocket("ws://127.0.0.1:8000/ws/emotions");

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
};
