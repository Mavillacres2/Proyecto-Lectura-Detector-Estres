import "../../styles/glass.css";
import { useState } from "react";
import { registerUser } from "../../services/authService";
import { useNavigate } from "react-router-dom";

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

  // Estado para guardar los errores de validación
  const [errors, setErrors] = useState<any>({});

  const handleChange = (e: any) => {
    // Limpiamos el error del campo que se está escribiendo para mejorar la UX
    setErrors({ ...errors, [e.target.name]: "" });
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Función de validación
  const validate = () => {
    const newErrors: any = {};

    if (!form.full_name.trim()) newErrors.full_name = "El nombre es obligatorio.";
    
    // Regex simple para validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) newErrors.email = "Ingresa un correo válido.";

    if (form.password.length < 6) newErrors.password = "La contraseña debe tener al menos 6 caracteres.";
    
    if (form.password !== form.confirm) newErrors.confirm = "Las contraseñas no coinciden.";

    // 🔞 VALIDACIÓN DE EDAD (Límite 18)
    if (!form.age) {
        newErrors.age = "La edad es obligatoria.";
    } else if (Number(form.age) < 18) {
        newErrors.age = "Debes tener al menos 18 años para registrarte.";
    }

    setErrors(newErrors);
    // Retorna true si no hay errores
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    // 1. Ejecutamos validación antes de enviar
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
      console.log(err.response);
      alert(err.response?.data?.detail || "Error al registrar usuario");
    }
  };

  // Estilos
  const inputStyle = {
    color: "#333",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    fontWeight: "500",
    border: "1px solid rgba(255, 255, 255, 0.5)"
  };

  const errorStyle = {
    color: "#ff4d4d",
    fontSize: "0.85rem",
    marginTop: "-10px",
    marginBottom: "10px",
    textAlign: "left" as const,
    display: "block",
    fontWeight: "bold",
    textShadow: "0px 0px 2px rgba(0,0,0,0.2)"
  };

  return (
    <div className="page-center">
      <div className="glass-box">
        <h2>Registro</h2>

        {/* Nombre */}
        <input 
            className="glass-input" 
            name="full_name" 
            placeholder="Nombre Completo" 
            onChange={handleChange} 
            style={inputStyle} 
        />
        {errors.full_name && <span style={errorStyle}>{errors.full_name}</span>}

        {/* Email */}
        <input 
            className="glass-input" 
            name="email" 
            placeholder="Email" 
            onChange={handleChange} 
            style={inputStyle} 
        />
        {errors.email && <span style={errorStyle}>{errors.email}</span>}

        {/* Password */}
        <input 
            className="glass-input" 
            type="password" 
            name="password" 
            placeholder="Contraseña" 
            onChange={handleChange} 
            style={inputStyle} 
        />
        {errors.password && <span style={errorStyle}>{errors.password}</span>}

        {/* Confirm Password */}
        <input 
            className="glass-input" 
            type="password" 
            name="confirm" 
            placeholder="Confirmar Contraseña" 
            onChange={handleChange} 
            style={inputStyle} 
        />
        {errors.confirm && <span style={errorStyle}>{errors.confirm}</span>}

        {/* Edad */}
        <input
          className="glass-input"
          name="age"
          placeholder="Edad"
          type="number"
          onChange={handleChange}
          style={inputStyle}
        />
        {errors.age && <span style={errorStyle}>{errors.age}</span>}

        {/* Género */}
        <select
          className="glass-input"
          name="gender"
          value={form.gender}
          onChange={handleChange}
          style={inputStyle}
        >
          <option value="M">Masculino</option>
          <option value="F">Femenino</option>
          <option value="O">Otro</option>
          <option value="ND">No deseo decirlo</option>
        </select>

        <button className="glass-btn" onClick={handleSubmit}>Crear Cuenta</button>

        <p>¿Ya tienes una cuenta? <a href="/login">Login</a></p>
      </div>
    </div>
  );
}