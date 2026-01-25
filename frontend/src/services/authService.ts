// src/services/authService.ts
import axios from "axios";

// Si existe la variable de entorno (Vercel), la usa. Si no, usa localhost.
const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const API_URL = `${BASE_URL}/api/auth`;
//const API_URL = "http://127.0.0.1:8000/api/auth"; // o localhost, pero que coincida con CORS

export const registerUser = (data: {
  full_name: string;
  email: string;
  password: string;
  age: number;
  gender: string;
  nrc: string;
}) => {
  return axios.post(`${API_URL}/register`, data);
};

export const loginUser = (data: { email: string; password: string }) => {
  return axios.post(`${API_URL}/login`, data);
};
