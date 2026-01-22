
import { useEffect, useState } from "react";


import { LogOut, ChevronRight, Users, Activity } from "lucide-react";

import axios from "axios";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line
} from "recharts";
import { useNavigate } from "react-router-dom";

// Configura tu URL base
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export const AdminDashboard = () => {
    const navigate = useNavigate();
    const [view, setView] = useState<"global" | "detail">("global");

    // Datos
    const [globalStats, setGlobalStats] = useState<any>(null);
    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [studentHistory, setStudentHistory] = useState<any[]>([]);

    // 1. Cargar datos globales al iniciar
    useEffect(() => {
        fetchGlobalData();
        fetchStudents();
    }, []);

    const fetchGlobalData = async () => {
        try {
            const res = await axios.get(`${API_URL}/admin/global-stats`);
            setGlobalStats(res.data);
        } catch (e) { console.error(e); }
    };

    const fetchStudents = async () => {
        try {
            const res = await axios.get(`${API_URL}/admin/students`);
            setStudents(res.data);
        } catch (e) { console.error(e); }
    };

    const handleStudentClick = async (student: any) => {
        setSelectedStudent(student);
        try {
            const res = await axios.get(`${API_URL}/admin/student-history/${student.id}`);
            setStudentHistory(res.data);
            setView("detail");
        } catch (e) { console.error(e); }
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate("/login");
    };

    return (
        <div style={{ minHeight: "100vh", background: "#f8f9fa", padding: "20px", fontFamily: "Arial, sans-serif" }}>

            {/* Header */}
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", background: "white", padding: "15px 25px", borderRadius: "10px", boxShadow: "0 2px 5px rgba(0,0,0,0.05)" }}>
                <h1 style={{ margin: 0, color: "#2c3e50", fontSize: "1.5rem" }}>🛡️ Panel de Docente</h1>
                <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: "8px", border: "none", background: "transparent", color: "#e74c3c", cursor: "pointer", fontWeight: "bold" }}>
                    <LogOut size={18} /> Salir
                </button>
            </header>

            {/* VISTA GLOBAL */}
            {view === "global" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>

                    {/* Tarjeta 1: Gráfico Global */}
                    <div style={{ background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Activity size={20} /> Distribución Global de Estrés
                        </h3>
                        <p style={{ color: "#666", fontSize: "0.9rem" }}>Total de evaluaciones realizadas: <strong>{globalStats?.total_evaluations || 0}</strong></p>

                        <div style={{ height: "300px", marginTop: "20px" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={globalStats?.distribution || []}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" />
                                    <YAxis />
                                    <Tooltip />
                                    <Bar dataKey="value" name="Cantidad de Alumnos" radius={[5, 5, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Tarjeta 2: Lista de Estudiantes */}
                    <div style={{ background: "white", padding: "20px", borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Users size={20} /> Lista de Estudiantes
                        </h3>
                        <p style={{ color: "#666", fontSize: "0.9rem" }}>Selecciona uno para ver su evolución.</p>

                        <div style={{ marginTop: "15px", maxHeight: "400px", overflowY: "auto" }}>
                            {students.map((s) => (
                                <div
                                    key={s.id}
                                    onClick={() => handleStudentClick(s)}
                                    style={{
                                        padding: "12px", borderBottom: "1px solid #eee", cursor: "pointer",
                                        display: "flex", justifyContent: "space-between", alignItems: "center",
                                        transition: "background 0.2s"
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = "#f0f7ff"}
                                    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                                >
                                    <div>
                                        <div style={{ fontWeight: "bold", color: "#333" }}>{s.name}</div>
                                        <div style={{ fontSize: "0.8rem", color: "#888" }}>{s.email}</div>
                                    </div>
                                    <ChevronRight size={18} color="#ccc" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* VISTA DETALLE ESTUDIANTE */}
            {view === "detail" && (
                <div>
                    <button onClick={() => setView("global")} style={{ marginBottom: "20px", cursor: "pointer", border: "none", background: "#ffffff", padding: "8px 15px", borderRadius: "5px", color: "#114f81" }}>
                        ← Volver al Global
                    </button>

                    <div style={{ background: "white", padding: "25px", borderRadius: "10px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)" }}>
                        <h2>📈 Evolución de: <span style={{ color: "#2196f3" }}>{selectedStudent?.name}</span></h2>

                        {studentHistory.length === 0 ? (
                            <p>Este estudiante aún no ha realizado pruebas.</p>
                        ) : (
                            <div style={{ height: "400px", marginTop: "30px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={studentHistory}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="date" />
                                        <YAxis label={{ value: 'Puntaje PSS', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip />
                                        <Legend />
                                        {/* Línea de PSS */}
                                        <Line type="monotone" dataKey="pss_score" stroke="#8884d8" name="Puntaje Test (PSS)" strokeWidth={3} />
                                        {/* Línea de % Negativo (Cámara) */}
                                        <Line type="monotone" dataKey="negative_ratio" stroke="#82ca9d" name="% Negatividad Facial" strokeWidth={3} />
                                    </LineChart>
                                </ResponsiveContainer>
                                <p style={{ textAlign: "center", fontSize: "0.8rem", color: "#666", marginTop: "10px" }}>
                                    Comparativa del puntaje del cuestionario vs. el porcentaje de emociones negativas detectadas por la cámara.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};