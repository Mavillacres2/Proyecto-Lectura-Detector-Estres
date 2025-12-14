import "../../styles/glass.css";
import { useState } from "react";
import { registerUser } from "../../services/authService";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const nav = useNavigate();

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
    age: "",
    gender: "M",
  });

  const [errors, setErrors] = useState<any>({});

  const handleChange = (e: any) => {
    setErrors({ ...errors, [e.target.name]: "" });
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const validate = () => {
    const newErrors: any = {};
    if (!form.full_name.trim()) newErrors.full_name = "El nombre es obligatorio.";
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) newErrors.email = "Ingresa un correo válido.";
    if (form.password.length < 6) newErrors.password = "Mínimo 6 caracteres.";
    if (form.password !== form.confirm) newErrors.confirm = "Las contraseñas no coinciden.";
    if (!form.age) {
        newErrors.age = "La edad es obligatoria.";
    } else if (Number(form.age) < 18) {
        newErrors.age = "Debes ser mayor de 18.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await registerUser({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        age: Number(form.age),
        gender: form.gender,
      });
      alert("Usuario registrado exitosamente");
      nav("/login");
    } catch (err: any) {
      alert(err.response?.data?.detail || "Error al registrar usuario");
    }
  };

  // Estilos inline para ajuste rápido
  const containerStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "15px", // Espacio uniforme entre elementos
    padding: "20px",
    width: "100%",
    maxWidth: "400px"
  };

  const inputStyle = {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    color: "#333",
    fontSize: "1rem",
    width: "100%",
    boxSizing: "border-box" as const
  };

  const errorStyle = {
    color: "#e74c3c", // Rojo más legible
    fontSize: "0.8rem",
    fontWeight: "bold",
    textAlign: "left" as const,
    marginTop: "-10px", // Pegadito al input pero abajo
    paddingLeft: "5px"
  };

  return (
    <div className="page-center">
      <div className="glass-box" style={containerStyle}>
        <h2 style={{ marginBottom: "10px", color: "#fff" }}>Registro</h2>

        {/* Nombre */}
        <div>
            <input 
              name="full_name" 
              placeholder="Nombre Completo" 
              onChange={handleChange} 
              style={inputStyle} 
            />
            {errors.full_name && <div style={errorStyle}>{errors.full_name}</div>}
        </div>

        {/* Email */}
        <div>
            <input 
              name="email" 
              placeholder="Correo Electrónico" 
              onChange={handleChange} 
              style={inputStyle} 
            />
            {errors.email && <div style={errorStyle}>{errors.email}</div>}
        </div>

        {/* Password */}
        <div>
            <input 
              type="password" 
              name="password" 
              placeholder="Contraseña" 
              onChange={handleChange} 
              style={inputStyle} 
            />
            {errors.password && <div style={errorStyle}>{errors.password}</div>}
        </div>

        {/* Confirm */}
        <div>
            <input 
              type="password" 
              name="confirm" 
              placeholder="Confirmar Contraseña" 
              onChange={handleChange} 
              style={inputStyle} 
            />
            {errors.confirm && <div style={errorStyle}>{errors.confirm}</div>}
        </div>

        {/* Edad y Género en fila (Opcional, para ahorrar espacio) */}
        <div style={{ display: "flex", gap: "10px" }}>
            <div style={{ flex: 1 }}>
                <input
                  name="age"
                  placeholder="Edad"
                  type="number"
                  onChange={handleChange}
                  style={inputStyle}
                />
                {errors.age && <div style={errorStyle}>{errors.age}</div>}
            </div>
            <div style={{ flex: 1 }}>
                <select
                  name="gender"
                  value={form.gender}
                  onChange={handleChange}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="O">Otro</option>
                </select>
            </div>
        </div>

        <button className="glass-btn" onClick={handleSubmit} style={{ marginTop: "10px" }}>
            Crear Cuenta
        </button>

        <p style={{ fontSize: "0.9rem", color: "#fff" }}>
            ¿Ya tienes cuenta? <Link to="/login" style={{ color: "#ffd700", fontWeight: "bold" }}>Inicia Sesión</Link>
        </p>
      </div>
    </div>
  );
}