import "../../styles/glass.css";
import { useState } from "react";
import { loginUser } from "../../services/authService";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<any>({});

  const handleChange = (e: any) => {
    setErrors({ ...errors, [e.target.name]: "" });
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const validate = () => {
    const newErrors: any = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!form.email) {
        newErrors.email = "El email es requerido.";
    } else if (!emailRegex.test(form.email)) {
        newErrors.email = "Formato de email inválido.";
    }

    if (!form.password) newErrors.password = "La contraseña es requerida.";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    try {
      const res = await loginUser(form);
      localStorage.setItem("user_id", res.data.user_id);
      alert("Login exitoso");
      nav("/detector");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Error al iniciar sesión");
    }
  };

  const inputStyle = {
    color: "#333",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
    border: "1px solid rgba(255, 255, 255, 0.5)"
  };

  const errorStyle = {
    color: "#ff4d4d", // Rojo brillante para el error
    fontSize: "0.85rem",
    marginTop: "-10px",
    marginBottom: "10px",
    textAlign: "left" as const,
    fontWeight: "bold"
  };

  return (
    <div className="page-center">
      <div className="glass-box">
        <h2>Login</h2>

        <input
          className="glass-input"
          name="email"
          placeholder="Usuario (Email)"
          onChange={handleChange}
          style={inputStyle}
        />
        {errors.email && <span style={errorStyle}>{errors.email}</span>}

        <input
          className="glass-input"
          type="password"
          name="password"
          placeholder="Contraseña"
          onChange={handleChange}
          style={inputStyle}
        />
        {errors.password && <span style={errorStyle}>{errors.password}</span>}

        <button className="glass-btn" onClick={handleSubmit}>
          Ingresar
        </button>

        <p>
          ¿No tienes una cuenta? <a href="/register">Regístrate</a>
        </p>
      </div>
    </div>
  );
}