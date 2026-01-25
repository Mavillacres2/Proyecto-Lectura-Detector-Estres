import { useEffect, useState } from "react";
import { LogOut, ChevronRight, Users, Activity, PieChart as PieIcon } from "lucide-react";
import axios from "axios";
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    ComposedChart, Line, Bar, CartesianGrid, XAxis, YAxis
} from "recharts";
import { useNavigate } from "react-router-dom";

// Configura tu URL base
const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Colores del semáforo para el estrés
const COLORS = {
    "Bajo": "#4caf50",  // Verde
    "Medio": "#ff9800", // Naranja
    "Alto": "#f44336"   // Rojo
};

export const AdminDashboard = () => {
    const navigate = useNavigate();
    const [view, setView] = useState<"global" | "detail">("global");

    // Datos
    const [globalStats, setGlobalStats] = useState<any>(null);
    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [studentHistory, setStudentHistory] = useState<any[]>([]);

    useEffect(() => {
        // Verificar si hay token
        const token = localStorage.getItem("token");
        if (!token) {
            navigate("/login");
            return;
        }
        fetchGlobalData(token);
        fetchStudents(token);
    }, []);

    // Helper para headers
    const getAuthHeaders = (token: string) => ({
        headers: { Authorization: `Bearer ${token}` }
    });

    const fetchGlobalData = async (token: string) => {
        try {
            // Enviamos el token para que el backend sepa de qué NRC somos
            const res = await axios.get(`${API_URL}/admin/global-stats`, getAuthHeaders(token));
            
            const dataWithColors = {
                ...res.data,
                distribution: res.data.distribution.map((d: any) => ({
                    ...d,
                    fill: COLORS[d.name as keyof typeof COLORS] || "#888"
                }))
            };
            setGlobalStats(dataWithColors);
        } catch (e: any) { 
            console.error(e);
            if(e.response?.status === 401) handleLogout();
        }
    };

    const fetchStudents = async (token: string) => {
        try {
            const res = await axios.get(`${API_URL}/admin/students`, getAuthHeaders(token));
            setStudents(res.data);
        } catch (e) { console.error(e); }
    };

    const handleStudentClick = async (student: any) => {
        setSelectedStudent(student);
        const token = localStorage.getItem("token") || "";
        try {
            const res = await axios.get(`${API_URL}/admin/student-history/${student.id}`, getAuthHeaders(token));
            setStudentHistory(res.data);
            setView("detail");
        } catch (e) { console.error(e); }
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate("/login");
    };

    // Tooltip personalizado para la Dona
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const total = globalStats?.total_evaluations || 1;
            const percent = ((data.value / total) * 100).toFixed(1);
            
            return (
                <div style={{ background: "white", padding: "12px", border: "1px solid #eee", borderRadius: "8px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
                    <p style={{ margin: 0, fontWeight: "bold", color: data.fill, fontSize: "1rem" }}>{data.name}</p>
                    <p style={{ margin: "5px 0 0 0", color: "#333" }}>Alumnos: <strong>{data.value}</strong></p>
                    <p style={{ margin: 0, color: "#666", fontSize: "0.9rem" }}>Representan el {percent}%</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div style={{ minHeight: "100vh", background: "#f0f2f5", padding: "20px", fontFamily: "'Segoe UI', Roboto, sans-serif" }}>

            {/* Header */}
            <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", background: "white", padding: "15px 30px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ padding: "8px", background: "#e3f2fd", borderRadius: "8px" }}>
                        <Activity color="#1976d2" size={24} />
                    </div>
                    <h1 style={{ margin: 0, color: "#1e293b", fontSize: "1.4rem", fontWeight: "700" }}>Panel de Docente</h1>
                </div>
                
                {/* Indicador de Curso (Opcional, para ver que funcionó) */}
                {globalStats?.nrc_filter && (
                    <div style={{ background: "#e0f2f1", color: "#00695c", padding: "5px 15px", borderRadius: "20px", fontSize: "0.9rem", fontWeight: "bold" }}>
                        Curso NRC: {globalStats.nrc_filter}
                    </div>
                )}

                <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: "8px", border: "none", background: "#fee2e2", color: "#ef4444", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", transition: "0.2s" }}>
                    <LogOut size={18} /> Salir
                </button>
            </header>

            {/* VISTA GLOBAL */}
            {view === "global" && (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "25px" }}>

                    {/* Tarjeta 1: Gráfico de DONA (Distribución) */}
                    <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}>
                        <div style={{ display: 'flex', justifyContent: "space-between", alignItems: "start" }}>
                            <div>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: "0 0 5px 0", color: "#334155" }}>
                                    <PieIcon size={20} className="text-gray-500" /> Distribución de Estrés
                                </h3>
                                <p style={{ color: "#64748b", fontSize: "0.9rem", margin: 0 }}>Panorama general del curso</p>
                            </div>
                        </div>

                        <div style={{ flex: 1, minHeight: "350px", marginTop: "20px", position: "relative" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={globalStats?.distribution || []}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={90}
                                        outerRadius={130}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {(globalStats?.distribution || []).map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} stroke="none" />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend 
                                        verticalAlign="middle" 
                                        align="right" 
                                        layout="vertical"
                                        iconSize={15}
                                        formatter={(value, entry: any) => {
                                            const val = entry.payload.value;
                                            const total = globalStats?.total_evaluations || 1;
                                            const percent = ((val / total) * 100).toFixed(0);
                                            return <span style={{ color: "#334155", fontWeight: "500", marginLeft: "10px", fontSize: "1rem" }}>{value} ({percent}%)</span>;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            
                            {/* Texto Central Gigante */}
                            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                                <div style={{ fontSize: "3rem", fontWeight: "bold", color: "#0f172a", lineHeight: "1" }}>
                                    {globalStats?.total_evaluations || 0}
                                </div>
                                <div style={{ fontSize: "0.9rem", color: "#94a3b8", fontWeight: "600", marginTop: "5px" }}>ESTUDIANTES</div>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta 2: Lista de Estudiantes */}
                    <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", maxHeight: "550px" }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: "0 0 20px 0", color: "#334155" }}>
                            <Users size={20} /> Lista de Estudiantes (NRC: {globalStats?.nrc_filter || "..."})
                        </h3>
                        
                        <div style={{ overflowY: "auto", paddingRight: "5px", flex: 1 }}>
                            {students.length === 0 ? (
                                <p style={{color: "#999", textAlign: "center", marginTop: "20px"}}>No hay estudiantes registrados en este curso.</p>
                            ) : (
                                students.map((s) => (
                                    <div
                                        key={s.id}
                                        onClick={() => handleStudentClick(s)}
                                        style={{
                                            padding: "16px", marginBottom: "10px", borderRadius: "8px",
                                            border: "1px solid #f1f5f9", cursor: "pointer",
                                            display: "flex", justifyContent: "space-between", alignItems: "center",
                                            transition: "all 0.2s ease"
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = "#f8fafc";
                                            e.currentTarget.style.borderColor = "#cbd5e1";
                                            e.currentTarget.style.transform = "translateX(5px)";
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = "transparent";
                                            e.currentTarget.style.borderColor = "#f1f5f9";
                                            e.currentTarget.style.transform = "translateX(0)";
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                            <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#64748b", fontSize: "1.1rem" }}>
                                                {s.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: "600", color: "#334155" }}>{s.name}</div>
                                                <div style={{ fontSize: "0.85rem", color: "#94a3b8" }}>{s.email}</div>
                                            </div>
                                        </div>
                                        <ChevronRight size={20} color="#cbd5e1" />
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* VISTA DETALLE ESTUDIANTE */}
            {view === "detail" && (
                <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
                    <button 
                        onClick={() => setView("global")} 
                        style={{ marginBottom: "20px", cursor: "pointer", border: "none", background: "white", padding: "10px 20px", borderRadius: "8px", color: "#334155", fontWeight: "600", boxShadow: "0 2px 5px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "8px" }}
                    >
                        ← Volver al Panel
                    </button>

                    <div style={{ background: "white", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                        <div style={{ marginBottom: "30px", borderBottom: "1px solid #f1f5f9", paddingBottom: "20px" }}>
                            <h2 style={{ margin: 0, color: "#1e293b" }}>Evolución de: <span style={{ color: "#2563eb" }}>{selectedStudent?.name}</span></h2>
                        </div>

                        {studentHistory.length === 0 ? (
                            <div style={{ textAlign: "center", padding: "50px", color: "#94a3b8" }}>
                                <Activity size={48} style={{ marginBottom: "15px", opacity: 0.5 }} />
                                <p>Este estudiante aún no ha realizado ninguna prueba.</p>
                            </div>
                        ) : (
                            <div style={{ height: "450px" }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={studentHistory} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                                        <XAxis 
                                            dataKey="date" 
                                            scale="point" 
                                            padding={{ left: 50, right: 50 }} 
                                            tick={{ fill: '#64748b' }}
                                            axisLine={{ stroke: '#e2e8f0' }}
                                        />
                                        <YAxis 
                                            domain={[0, 'auto']} 
                                            tick={{ fill: '#64748b' }}
                                            axisLine={false}
                                            label={{ value: 'Nivel / Puntaje', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8' } }} 
                                        />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: "20px" }} />

                                        <Bar dataKey="pss_score" name="Nivel PSS (Barra)" barSize={40} fill="#e2e8f0" radius={[4, 4, 0, 0]} />

                                        <Line 
                                            type="monotone" 
                                            dataKey="pss_score" 
                                            stroke="#6366f1" 
                                            name="Puntaje Test (PSS)" 
                                            strokeWidth={3} 
                                            dot={{ r: 5, fill: "#6366f1", strokeWidth: 2, stroke: "white" }} 
                                            activeDot={{ r: 8 }} 
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="negative_ratio" 
                                            stroke="#10b981" 
                                            name="% Negatividad Facial" 
                                            strokeWidth={3} 
                                            dot={{ r: 5, fill: "#10b981", strokeWidth: 2, stroke: "white" }} 
                                            activeDot={{ r: 8 }} 
                                        />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                        
                        {studentHistory.length > 0 && (
                            
                           

                            <div style={{ marginTop: "20px", background: "#f8fafc", padding: "15px", borderRadius: "8px", display: "flex", gap: "10px", alignItems: "center", color: "#475569", fontSize: "0.9rem" }}>
                                <span>💡</span>
                                 <p style={{ textAlign: "center", fontSize: "0.9rem", color: "#555", marginTop: "15px", background: "#eef", padding: "10px", borderRadius: "5px" }}>
                                    ℹ️ <strong>Ayuda visual:</strong> Los puntos representan cada sesión. Si solo ves un punto, significa que el estudiante solo ha realizado una prueba hasta ahora.
                                </p>
                                <span>💡</span>
                                <div>
                                    <strong>Nota Visual:</strong> Si solo ves un punto, es porque el estudiante solo ha hecho una prueba.
                                    La línea verde indica qué tan negativa fue su expresión facial durante el test.
                                </div>
                            </div>

                        )}
                    </div>
                </div>
            )}
        </div>
    );
};