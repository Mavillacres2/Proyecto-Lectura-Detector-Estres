import "../../styles/glass.css";
import { useState } from "react";
import { loginUser } from "../../services/authService";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const nav = useNavigate();

  // 1. Nuevo estado para saber si está cargando
  const [loading, setLoading] = useState(false);
  
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

    // 2. Activamos el modo "Cargando"
    setLoading(true);

    try {
      const res = await loginUser(form);
      localStorage.setItem("user_id", res.data.user_id);
      
      // Opcional: Puedes quitar el alert si quieres que pase directo
      alert("Login exitoso"); 
      
      nav("/detector");
    } catch (err: any) {
      console.error(err); // Útil para ver errores en consola (F12)
      // Mensaje un poco más descriptivo por si es un timeout
      alert(err.response?.data?.detail || "Error al conectar. Si es la primera vez, el servidor puede estar despertando. Intenta de nuevo.");
    } finally {
      // 3. Importante: Pase lo que pase (éxito o error), desactivamos la carga
      setLoading(false);
    }
  };

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
          disabled={loading} // Bloquea input si carga
        />
        {errors.email && <span style={errorStyle}>{errors.email}</span>}

        <input
          className="glass-input"
          type="password"
          name="password"
          placeholder="Contraseña"
          onChange={handleChange}
          style={inputStyle}
          disabled={loading} // Bloquea input si carga
        />
        {errors.password && <span style={errorStyle}>{errors.password}</span>}

        {/* 4. Botón con estado de carga */}
        <button 
            className="glass-btn" 
            onClick={handleSubmit}
            disabled={loading} // Evita doble clic
            style={{
                cursor: loading ? "wait" : "pointer", // Cambia el cursor
                opacity: loading ? 0.7 : 1, // Se ve un poco transparente
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                gap: "10px"
            }}
        >
          {loading ? "Ingresando..." : "Ingresar"}
        </button>

        <p>
          ¿No tienes una cuenta? <Link to="/register">Regístrate aquí</Link>
        </p>
      </div>
    </div>
  );
}