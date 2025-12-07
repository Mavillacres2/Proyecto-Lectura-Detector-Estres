import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const API_URL = `${BASE_URL}/api/emotions`;

//const API_URL = "http://127.0.0.1:8000/api/emotions";

export const sendEmotionHTTP = async (payload: any) => {
  try {
    await axios.post(API_URL, payload);
    console.log("Emoción enviada correctamente:", payload);
  } catch (err) {
    console.error("❌ Error enviando emoción:", err);
  }
};
