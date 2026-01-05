import "../../styles/glass.css";
import { useState } from "react";
import { registerUser } from "../../services/authService";
import { useNavigate, Link } from "react-router-dom";

export default function Register() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);

  // 1. Cambiamos 'age' por 'birth_year'
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
    birth_year: "", // Nuevo campo
    gender: "",
  });

  const [errors, setErrors] = useState<any>({});

  // ============================
  // 🔤 Manejo de cambios
  // ============================
  const handleChange = (e: any) => {
    const { name, value } = e.target;

    // ❌ Bloquear números y símbolos en nombre
    if (name === "full_name") {
      const cleanValue = value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñ\s]/g, "");
      setForm({ ...form, full_name: cleanValue });
      setErrors({ ...errors, full_name: "" });
      return;
    }

    setErrors({ ...errors, [name]: "" });
    setForm({ ...form, [name]: value });
  };

  // ============================
  // ✅ Validaciones
  // ============================
  const validate = () => {
    const newErrors: any = {};

    // --- NOMBRE ---
    if (!form.full_name.trim()) {
      newErrors.full_name = "El nombre y apellido son obligatorios.";
    } else if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(form.full_name)) {
      newErrors.full_name = "Solo se permiten letras y espacios.";
    }

    // --- EMAIL ---
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email)) {
      newErrors.email = "Ingresa un correo válido.";
    }

    // --- PASSWORD SEGURA ---
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{6,}$/;
    if (!passwordRegex.test(form.password)) {
      newErrors.password =
        "Mínimo 6 caracteres, incluir un número y un símbolo.";
    }

    if (form.password !== form.confirm) {
      newErrors.confirm = "Las contraseñas no coinciden.";
    }

    // --- AÑO DE NACIMIENTO (Validación de Edad implícita) ---
    const currentYear = new Date().getFullYear();
    const birthYear = Number(form.birth_year);
    const calculatedAge = currentYear - birthYear;

    if (!form.birth_year) {
      newErrors.birth_year = "El año de nacimiento es obligatorio.";
    } else if (isNaN(birthYear) || form.birth_year.length !== 4) {
      newErrors.birth_year = "Ingresa un año válido (Ej: 2000).";
    } else if (calculatedAge < 18) {
      newErrors.birth_year = "Debes tener al menos 18 años.";
    } else if (calculatedAge > 45) {
      newErrors.birth_year = "Edad no válida para este sistema (Máx 45 años).";
    }

    // --- GÉNERO ---
    if (!form.gender) {
      newErrors.gender = "Selecciona un género.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ============================
  // 📤 Envío
  // ============================
  const handleSubmit = async () => {
    if (!validate()) return;

    setLoading(true);

    // Calculamos la edad exacta antes de enviar
    const currentYear = new Date().getFullYear();
    const calculatedAge = currentYear - Number(form.birth_year);

    try {
      await registerUser({
        full_name: form.full_name.trim(),
        email: form.email,
        password: form.password,
        age: calculatedAge, // Enviamos 'age' al backend como siempre
        gender: form.gender,
      });

      alert("Usuario registrado exitosamente");
      nav("/login");
    } catch (err: any) {
      console.error(err);
      alert(
        err.response?.data?.detail ||
          "Error al registrar. Intenta nuevamente en unos segundos."
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================
  // 🎨 Estilos
  // ============================
  const containerStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "15px",
    padding: "30px",
    width: "100%",
    maxWidth: "450px",
  };

  const fieldGroupStyle = {
    display: "flex",
    flexDirection: "column" as const,
    width: "100%",
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
    outline: "none",
  };

  const errorStyle = {
    color: "#ff0000",
    fontSize: "0.85rem",
    fontWeight: "bold",
    textAlign: "left" as const,
    marginTop: "5px",
    paddingLeft: "5px",
  };

  // ============================
  // 🧩 UI
  // ============================
  return (
    <div className="page-center">
      <div className="glass-box" style={containerStyle}>
        <h2 style={{ marginBottom: "20px", color: "#fff" }}>Registro</h2>

        {/* Nombre */}
        <div style={fieldGroupStyle}>
          <input
            name="full_name"
            placeholder="Nombre y Apellido"
            value={form.full_name}
            onChange={handleChange}
            style={inputStyle}
            disabled={loading}
          />
          {errors.full_name && <div style={errorStyle}>{errors.full_name}</div>}
        </div>

        {/* Email */}
        <div style={fieldGroupStyle}>
          <input
            name="email"
            placeholder="Correo Electrónico"
            value={form.email}
            onChange={handleChange}
            style={inputStyle}
            disabled={loading}
          />
          {errors.email && <div style={errorStyle}>{errors.email}</div>}
        </div>

        {/* Password */}
        <div style={fieldGroupStyle}>
          <input
            type="password"
            name="password"
            placeholder="Contraseña (mínimo 6 caracteres, número y símbolo)"
            value={form.password}
            onChange={handleChange}
            style={inputStyle}
            disabled={loading}
          />
          {errors.password && <div style={errorStyle}>{errors.password}</div>}
        </div>

        {/* Confirm */}
        <div style={fieldGroupStyle}>
          <input
            type="password"
            name="confirm"
            placeholder="Confirmar Contraseña"
            value={form.confirm}
            onChange={handleChange}
            style={inputStyle}
            disabled={loading}
          />
          {errors.confirm && <div style={errorStyle}>{errors.confirm}</div>}
        </div>

        {/* Año de Nacimiento y Género */}
        <div style={{ display: "flex", gap: "15px" }}>
          {/* CAMBIO: Input de Año de Nacimiento */}
          <div style={{ flex: 1, ...fieldGroupStyle }}>
            <input
              name="birth_year"
              type="number"
              placeholder="Año Nacimiento"
              value={form.birth_year}
              min="1950"
              max={new Date().getFullYear()}
              onChange={handleChange}
              style={inputStyle}
              disabled={loading}
            />
            {errors.birth_year && <div style={errorStyle}>{errors.birth_year}</div>}
          </div>

          <div style={{ flex: 1, ...fieldGroupStyle }}>
            <select
              name="gender"
              value={form.gender}
              onChange={handleChange}
              disabled={loading}
              style={inputStyle}
            >
              <option value="" disabled hidden>
                Género
              </option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
              <option value="O">Otro</option>
            </select>
            {errors.gender && <div style={errorStyle}>{errors.gender}</div>}
          </div>
        </div>

        <button
          className="glass-btn"
          onClick={handleSubmit}
          disabled={loading}
          style={{ marginTop: "15px", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Creando cuenta..." : "Crear Cuenta"}
        </button>

        <p style={{ fontSize: "0.95rem", color: "#fff", marginTop: "15px" }}>
          ¿Ya tienes cuenta?{" "}
          <Link
            to="/login"
            style={{ color: "#ffd700", fontWeight: "bold", textDecoration: "none" }}
          >
            Inicia Sesión
          </Link>
        </p>
      </div>
    </div>
  );
}