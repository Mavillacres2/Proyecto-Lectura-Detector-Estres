// src/pages/ResultsPage.tsx
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../styles/Results.css";

const ResultsPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Datos que vienen desde navigate("/results", { state: resultsData })
  const data = location.state as any;

  // Si entras directo a /results sin pasar por el cuestionario
  if (!data) {
    return (
      <div className="results-page">
        <header className="results-header">
          <h1>Panel de Resultados del Estudiante</h1>
        </header>

        <div className="results-empty">
          <p>No hay resultados para mostrar.</p>
          <button onClick={() => navigate("/detector")}>
            Ir al detector
          </button>
        </div>
      </div>
    );
  }

  const {
    pss_score,
    pss_level,
    emotion_level,
    emotion_averages,
  } = data;

  const stressPercent = Math.round((pss_score / 40) * 100);

  // Emociones promedio de la sesión
  const emotions: Record<string, number> = emotion_averages || {};

  // Orden típico de face-api.js
  const orderedLabels = [
    "happy", "neutral", "angry", "sad", "surprised", "disgusted", "fearful",
  ];

  // Filtrar claves existentes
  const emotionKeys = orderedLabels.filter((k) => k in emotions);
  
  // Si por alguna razón no hay claves ordenadas, usar las que vengan
  const finalKeys = emotionKeys.length > 0 ? emotionKeys : Object.keys(emotions);

  // 1. Encontrar el valor máximo para normalizar
  const maxVal = Math.max(...Object.values(emotions).map(v => Number(v) || 0)) || 1;

  return (
    <div className="results-page">
      <header className="results-header">
        <h1>Panel de Resultados del Estudiante</h1>
      </header>

      <div className="results-grid">
        {/* 1. Nivel de estrés facial */}
        <section className="card">
          <h3>Nivel de estrés facial</h3>
          <div className={`badge badge-${emotion_level || "desconocido"}`}>
            Estrés {emotion_level || "desconocido"}
          </div>
          <p className="card-note">
            Calculado a partir de la frecuencia de emociones negativas.
          </p>
        </section>

        {/* 2. Nivel estimado de estrés (PSS) */}
        <section className="card">
          <h3>Nivel estimado de estrés (PSS-10)</h3>
          <div className={`badge badge-${pss_level || "desconocido"}`}>
            Estrés {pss_level}
          </div>

          <p className="pss-label">
            Puntaje: <strong>{pss_score}</strong> / 40 —{" "}
            <strong>{pss_level}</strong>
          </p>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${stressPercent}%` }}
            />
          </div>
          <p className="progress-percent">{stressPercent}%</p>
        </section>

        {/* 3. Historial de emociones (Lista) */}
        <section className="card">
          <h3>Historial de emociones</h3>
          <ul className="emotion-list">
            {finalKeys.length === 0 && (
              <li>No se encontraron emociones registradas.</li>
            )}
            {finalKeys.map((k) => (
              <li key={k}>
                <span className="emotion-name" style={{ textTransform: "capitalize" }}>{k}</span>
                <span className="emotion-value">
                  {emotions[k].toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 4. Distribución de emociones (Gráfico Corregido) */}
        <section className="card">
          <h3>Distribución de emociones</h3>
          
          {/* Contenedor del gráfico con altura fija explícita para evitar colapso */}
          <div className="chart" style={{ 
              display: "flex", 
              alignItems: "flex-end", 
              justifyContent: "space-around",
              height: "200px",    // 👈 IMPORTANTE: Altura fija
              marginTop: "20px",
              paddingBottom: "20px" // Espacio para etiquetas
          }}>
            {finalKeys.length === 0 && <p>Sin datos</p>}

            {finalKeys.map((k) => {
              const val = emotions[k] || 0;
              
              // LÓGICA VISUAL:
              // "neutral" suele ser muy alto (0.9). Si usas escala lineal, el resto no se ve.
              // Usamos raíz cuadrada para suavizar la diferencia y que se vean las emociones pequeñas.
              
              // 1. Normalizar respecto al máximo (0 a 1)
              const ratio = val / maxVal; 
              
              // 2. Aplicar curva de visualización (raíz cúbica ayuda a ver valores bajos)
              // Si ratio es 0.01 -> visualmente será ~20% de altura
              let visualPercent = Math.pow(ratio, 1/3) * 100;
              
              // 3. Mínimo visual de 10% si hay algo de valor (>0.001), sino 0
              if (val > 0.001 && visualPercent < 10) visualPercent = 10;
              if (val <= 0.001) visualPercent = 2; // Una línea base mínima

              // Color dinámico según la emoción
              const isNegative = ["angry", "sad", "fearful", "disgusted"].includes(k);
              const barColor = isNegative ? "#ff6b6b" : (k === "neutral" ? "#ced4da" : "#51cf66");

              return (
                <div key={k} className="chart-bar" style={{ 
                    display: "flex", 
                    flexDirection: "column", 
                    alignItems: "center", 
                    height: "100%", 
                    width: "100%",
                    justifyContent: "flex-end"
                }}>
                  {/* Barra visual */}
                  <div
                    className="chart-bar-fill"
                    style={{ 
                        height: `${visualPercent}%`, 
                        width: "60%", 
                        backgroundColor: barColor,
                        borderRadius: "4px 4px 0 0",
                        transition: "height 0.5s ease"
                    }}
                    title={`${k}: ${val.toFixed(3)}`}
                  />
                  {/* Etiqueta */}
                  <span className="chart-bar-label" style={{ 
                      fontSize: "0.75rem", 
                      marginTop: "5px",
                      textTransform: "capitalize",
                      textAlign: "center"
                  }}>
                      {k.substring(0, 3)} {/* Solo las 3 primeras letras para que quepa */}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="card-note">
            * Escala visual ajustada para facilitar la lectura de micro-expresiones.
          </p>
        </section>
      </div>

      <div className="results-actions">
        <button onClick={() => navigate("/detector")}>
          Realizar nueva evaluación
        </button>
      </div>
    </div>
  );
};

export default ResultsPage;