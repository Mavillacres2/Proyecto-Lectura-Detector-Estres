// src/services/pssService.ts
import axios from "axios";

const API_URL = "http://127.0.0.1:8000/api/pss";

export const submitPSS = (data: {
  user_id: number;
  session_id: string;
  pss_score: number;
}) => axios.post(`${API_URL}/submit`, data);
