// src/services/authService.ts
import axios from "axios";

const API_URL = "http://127.0.0.1:8000/api/auth"; // o localhost, pero que coincida con CORS

export const registerUser = (data: {
  full_name: string;
  email: string;
  password: string;
  age: number;
  gender: string;
}) => {
  return axios.post(`${API_URL}/register`, data);
};

export const loginUser = (data: { email: string; password: string }) => {
  return axios.post(`${API_URL}/login`, data);
};
