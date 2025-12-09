// src/services/pssService.ts
import axios from "axios";

// URL base (detecta si es local o prod)
const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const API_URL = `${BASE_URL}/api/pss`;

// Función con reintentos automáticos
const postWithRetry = async (url: string, data: any, retries = 3, delay = 1000) => {
  try {
    return await axios.post(url, data);
  } catch (error) {
    if (retries > 0) {
      console.warn(`Fallo el envío, reintentando en ${delay}ms... Quedan ${retries} intentos.`);
      // Esperar X tiempo
      await new Promise(res => setTimeout(res, delay));
      // Llamada recursiva (vuelve a intentar)
      return postWithRetry(url, data, retries - 1, delay * 2); // delay * 2 espera más cada vez (1s, 2s, 4s)
    }
    throw error; // Si se acaban los intentos, lanza el error real
  }
};

export const submitPSS = (data: {
  user_id: number;
  session_id: string;
  pss_score: number;
}) => {
  // Usamos la función inteligente
  return postWithRetry(`${API_URL}/submit`, data);
};