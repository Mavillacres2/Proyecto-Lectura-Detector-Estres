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

// Colores profesionales para el gráfico
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
        fetchGlobalData();
        fetchStudents();
    }, []);

    const fetchGlobalData = async () => {
        try {
            const res = await axios.get(`${API_URL}/admin/global-stats`);
            // Aseguramos que los colores vengan bien desde el front si el back no los manda
            const dataWithColors = {
                ...res.data,
                distribution: res.data.distribution.map((d: any) => ({
                    ...d,
                    fill: COLORS[d.name as keyof typeof COLORS] || "#888"
                }))
            };
            setGlobalStats(dataWithColors);
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

    // Renderizado personalizado para el Tooltip del PieChart
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const percent = globalStats?.total_evaluations 
                ? ((data.value / globalStats.total_evaluations) * 100).toFixed(1) 
                : 0;
            
            return (
                <div style={{ background: "white", padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}>
                    <p style={{ margin: 0, fontWeight: "bold", color: data.fill }}>{data.name}</p>
                    <p style={{ margin: 0 }}>Alumnos: {data.value}</p>
                    <p style={{ margin: 0 }}>Porcentaje: {percent}%</p>
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
                <button onClick={handleLogout} style={{ display: "flex", alignItems: "center", gap: "8px", border: "none", background: "#fee2e2", color: "#ef4444", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "600", transition: "0.2s" }}>
                    <LogOut size={18} /> Salir
                </button>
            </header>

            {/* VISTA GLOBAL */}
            {view === "global" && (
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "25px" }}>

                    {/* Tarjeta 1: Gráfico de Distribución (DONA) */}
                    <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column" }}>
                        <div style={{ display: 'flex', justifyContent: "space-between", alignItems: "start" }}>
                            <div>
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: "0 0 5px 0", color: "#334155" }}>
                                    <PieIcon size={20} className="text-gray-500" /> Distribución de Estrés
                                </h3>
                                <p style={{ color: "#64748b", fontSize: "0.9rem", margin: 0 }}>Panorama general del aula</p>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                <span style={{ fontSize: "2rem", fontWeight: "bold", color: "#0f172a" }}>
                                    {globalStats?.total_evaluations || 0}
                                </span>
                                <div style={{ fontSize: "0.8rem", color: "#94a3b8", fontWeight: "600" }}>ALUMNOS TOTALES</div>
                            </div>
                        </div>

                        <div style={{ flex: 1, minHeight: "300px", marginTop: "20px", position: "relative" }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={globalStats?.distribution || []}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={80} // Esto lo hace "Dona"
                                        outerRadius={110}
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
                                        formatter={(value, entry: any) => {
                                            const val = entry.payload.value;
                                            const total = globalStats?.total_evaluations || 1;
                                            const percent = ((val / total) * 100).toFixed(0);
                                            return <span style={{ color: "#334155", fontWeight: "500", marginLeft: "10px" }}>{value} ({percent}%)</span>;
                                        }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            {/* Texto central en la dona */}
                            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", textAlign: "center", pointerEvents: "none" }}>
                                <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>Estado</div>
                                <div style={{ fontWeight: "bold", color: "#334155" }}>General</div>
                            </div>
                        </div>
                    </div>

                    {/* Tarjeta 2: Lista de Estudiantes */}
                    <div style={{ background: "white", padding: "25px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", maxHeight: "500px" }}>
                        <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: "0 0 20px 0", color: "#334155" }}>
                            <Users size={20} /> Lista de Estudiantes
                        </h3>
                        
                        <div style={{ overflowY: "auto", paddingRight: "5px", flex: 1 }}>
                            {students.map((s) => (
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
                                        <div style={{ width: "35px", height: "35px", borderRadius: "50%", background: "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", color: "#64748b" }}>
                                            {s.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: "600", color: "#334155" }}>{s.name}</div>
                                            <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{s.email}</div>
                                        </div>
                                    </div>
                                    <ChevronRight size={18} color="#cbd5e1" />
                                </div>
                            ))}
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
                            <p style={{ margin: "5px 0 0 0", color: "#64748b" }}>Historial completo de evaluaciones psicométricas y biométricas.</p>
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
                                            label={{ value: 'Nivel de Estrés / Puntaje', angle: -90, position: 'insideLeft', style: { fill: '#94a3b8' } }} 
                                        />
                                        <Tooltip 
                                            contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                                        />
                                        <Legend wrapperStyle={{ paddingTop: "20px" }} />

                                        {/* Barra de fondo sutil */}
                                        <Bar dataKey="pss_score" name="Nivel PSS (Referencia)" barSize={40} fill="#e2e8f0" radius={[4, 4, 0, 0]} />

                                        {/* Líneas principales */}
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
                                <div>
                                    <strong>¿Cómo leer esto?</strong> Las barras grises muestran la magnitud general. 
                                    La <span style={{ color: "#6366f1", fontWeight: "bold" }}>Línea Morada</span> es lo que el estudiante respondió en el test. 
                                    La <span style={{ color: "#10b981", fontWeight: "bold" }}>Línea Verde</span> es lo que su rostro expresó. 
                                    Grandes diferencias entre ambas pueden indicar estrés oculto.
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};