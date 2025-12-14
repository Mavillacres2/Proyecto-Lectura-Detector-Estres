import "../../styles/glass.css";
import { useState } from "react";
import { registerUser } from "../../services/authService";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const nav = useNavigate();

  // 1. Estado de carga para evitar doble envío y avisar al usuario
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
    age: "",
    gender: "",
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

    // 🔞 VALIDACIÓN DE EDAD
    if (!form.age) {
      newErrors.age = "La edad es obligatoria.";
    } else if (Number(form.age) < 18) {
      newErrors.age = "Debes tener al menos 18 años.";
    } else if (Number(form.age) > 45) { 
      newErrors.age = "Edad no válida para este sistema.";
    }

    // --- VALIDACIÓN DE GÉNERO ---
    if (!form.gender) {
      alert("Por favor selecciona un género");
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    // 2. Iniciamos carga
    setLoading(true);

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
      console.error(err);
      // Mensaje mejorado por si es un timeout
      alert(err.response?.data?.detail || "Error al registrar. Si el servidor estaba dormido, intenta de nuevo en unos segundos.");
    } finally {
      // 3. Terminamos carga pase lo que pase
      setLoading(false);
    }
  };

  // --- ESTILOS ---
  const containerStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "15px",
    padding: "30px",
    width: "100%",
    maxWidth: "450px"
  };

  const fieldGroupStyle = {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%"
  };

  const inputStyle = {
    padding: "12px 15px",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.5)",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    color: "#333",
    fontSize: "1rem",
    width: "100%",
    boxSizing: "border-box" as const,
    outline: "none"
  };

  const errorStyle = {
    color: "#ff0000",
    fontSize: "0.85rem",
    fontWeight: "bold",
    textAlign: "left" as const,
    marginTop: "5px",
    paddingLeft: "5px",
    textShadow: "0px 0px 1px rgba(255,255,255,0.8)"
  };

  return (
    <div className="page-center">
      <div className="glass-box" style={containerStyle}>
        <h2 style={{ marginBottom: "20px", color: "#fff", textShadow: "0 2px 4px rgba(0,0,0,0.2)" }}>
          Registro
        </h2>

        {/* Nombre */}
        <div style={fieldGroupStyle}>
          <input
            name="full_name"
            placeholder="Nombre y Apellido"
            onChange={handleChange}
            style={inputStyle}
            disabled={loading} // Bloqueado si carga
          />
          {errors.full_name && <div style={errorStyle}>{errors.full_name}</div>}
        </div>

        {/* Email */}
        <div style={fieldGroupStyle}>
          <input
            name="email"
            placeholder="Correo Electrónico"
            onChange={handleChange}
            style={inputStyle}
            disabled={loading} // Bloqueado si carga
          />
          {errors.email && <div style={errorStyle}>{errors.email}</div>}
        </div>

        {/* Password */}
        <div style={fieldGroupStyle}>
          <input
            type="password"
            name="password"
            placeholder="Contraseña (mínimo 6 caracteres)"
            onChange={handleChange}
            style={inputStyle}
            disabled={loading} // Bloqueado si carga
          />
          {errors.password && <div style={errorStyle}>{errors.password}</div>}
        </div>

        {/* Confirm */}
        <div style={fieldGroupStyle}>
          <input
            type="password"
            name="confirm"
            placeholder="Confirmar Contraseña"
            onChange={handleChange}
            style={inputStyle}
            disabled={loading} // Bloqueado si carga
          />
          {errors.confirm && <div style={errorStyle}>{errors.confirm}</div>}
        </div>

        {/* Edad y Género */}
        <div style={{ display: "flex", gap: "15px", width: "100%" }}>

          {/* Edad */}
          <div style={{ flex: 1, ...fieldGroupStyle }}>
            <input
              name="age"
              placeholder="Edad"
              type="number"
              onChange={(e) => {
                if (e.target.value.length > 2) return;
                handleChange(e);
              }}
              value={form.age}
              style={inputStyle}
              min="1"
              max="99"
              disabled={loading} // Bloqueado si carga
            />
            {errors.age && <div style={errorStyle}>{errors.age}</div>}
          </div>

          <div style={{ flex: 1, ...fieldGroupStyle }}>
            <select
              name="gender"
              value={form.gender}
              onChange={handleChange}
              disabled={loading} // Bloqueado si carga
              style={{
                ...inputStyle,
                cursor: loading ? "wait" : "pointer",
                color: form.gender === "" ? "#757575" : "#333"
              }}
            >
              <option value="" disabled hidden>Género</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="O">Otro</option>
            </select>
          </div>
        </div>

        <button 
            className="glass-btn" 
            onClick={handleSubmit} 
            disabled={loading} // Deshabilita click múltiple
            style={{ 
                marginTop: "15px", 
                padding: "12px",
                opacity: loading ? 0.7 : 1, // Feedback visual
                cursor: loading ? "wait" : "pointer" 
            }}
        >
          {loading ? "Creando cuenta..." : "Crear Cuenta"}
        </button>

        <p style={{ fontSize: "0.95rem", color: "#fff", marginTop: "15px" }}>
          ¿Ya tienes cuenta? <Link to="/login" style={{ color: "#ffd700", fontWeight: "bold", textDecoration: "none" }}>Inicia Sesión</Link>
        </p>
      </div>
    </div>
  );
}