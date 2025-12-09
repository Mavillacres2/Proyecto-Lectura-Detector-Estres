// src/components/EmotionDetector.tsx
import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { sendEmotionHTTP } from "../services/emotionService";
import { sendWS } from "../services/wsService";
import { submitPSS } from "../services/pssService";
import { useNavigate } from "react-router-dom";
import "../styles/EmotionDetector.css";

const MODEL_URL = "/models";
const QUESTION_TIME = 25;

type Step = "intro" | "instructions" | "questionnaire" | "completed";

// 🔹 Preguntas PSS-10
const QUESTIONS = [
  { id: 1, text: "1. ¿Con qué frecuencia ha estado afectado por algo que ha ocurrido inesperadamente?", reverse: false },
  { id: 2, text: "2. ¿Con qué frecuencia se ha sentido incapaz de controlar las cosas importantes en su vida?", reverse: false },
  { id: 3, text: "3. ¿Con qué frecuencia se ha sentido nervioso o estresado?", reverse: false },
  { id: 4, text: "4. ¿Con qué frecuencia ha estado seguro sobre su capacidad para manejar sus problemas personales?", reverse: true },
  { id: 5, text: "5. ¿Con qué frecuencia ha sentido que las cosas le van bien?", reverse: true },
  { id: 6, text: "6. ¿Con qué frecuencia ha sentido que no podía afrontar todas las cosas que tenía que hacer?", reverse: false },
  { id: 7, text: "7. ¿Con qué frecuencia ha podido controlar las dificultades de su vida?", reverse: true },
  { id: 8, text: "8. ¿Con qué frecuencia ha sentido que tenía todo bajo control?", reverse: true },
  { id: 9, text: "9. ¿Con qué frecuencia ha estado enfadado porque las cosas que le han ocurrido estaban fuera de su control?", reverse: false },
  { id: 10, text: "10. ¿Con qué frecuencia ha sentido que las dificultades se acumulan tanto que no puede superarlas?", reverse: false },
];

const scaleOptions = [
  { label: "Nunca", value: 0 },
  { label: "Casi nunca", value: 1 },
  { label: "De vez en cuando", value: 2 },
  { label: "A menudo", value: 3 },
  { label: "Muy a menudo", value: 4 },
];

export const EmotionDetector: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 🔥 Control de grabación y estado del componente
  const isRecordingRef = useRef(false);
  const isMountedRef = useRef(true);

  // 🕒 Control de "Rostro Perdido"
  const lastFaceDetectedRef = useRef<number>(Date.now()); // Última vez que vimos una cara
  const [isFaceDetected, setIsFaceDetected] = useState(true); // Estado visual para la alerta

  const [loaded, setLoaded] = useState(false);
  const [smoothedEmotion, setSmoothedEmotion] = useState<any>(null); // Solo para visualización

  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState({ width: 0, height: 0 });

  const [step, setStep] = useState<Step>("intro");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [userId, setUserId] = useState<number | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(QUESTIONS.length).fill(-1));
  const [resultsData, setResultsData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);


  const navigate = useNavigate();

  // Control del ciclo de vida del componente
  useEffect(() => {
    isMountedRef.current = true;
    const stored = localStorage.getItem("user_id");
    if (stored) setUserId(Number(stored));
    return () => { isMountedRef.current = false; };
  }, []);

  // Sincronizar grabación con el paso actual
  useEffect(() => {
    if (step === "questionnaire") {
      isRecordingRef.current = true;
      console.log("🔴 REC: Dataset activo");
    } else {
      isRecordingRef.current = false;
    }
  }, [step]);

  useEffect(() => {
    const video = videoRef.current;
    const logInterval = setInterval(() => {
      if (video) {
        console.log("estado video:", {
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          paused: video.paused,
        });
      }
    }, 2000);

    return () => clearInterval(logInterval);
  }, []);


  /** 1. Cargar modelos con Fallback a CPU (Solución WebGL) */
  const loadModels = async () => {
    try {
      // Intentamos cargar modelos
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);

      if (isMountedRef.current) {
        setLoaded(true);
        console.log("✅ Modelos cargados");
      }
    } catch (err) {
      console.error("⚠️ Error WebGL/Carga, intentando modo CPU...", err);
      // Si falla, forzamos el uso de CPU (más lento pero compatible)
      await faceapi.tf.setBackend('cpu');
      await faceapi.tf.ready();

      // Reintentamos la carga
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);

      if (isMountedRef.current) setLoaded(true);
      console.log("✅ Modelos cargados (Modo CPU)");
    }
  };

  /** 2. Iniciar cámara con baja resolución (320x240) para velocidad */
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user",
          frameRate: { ideal: 15, max: 24 },
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;

      // 👉 MUY IMPORTANTE: enganchar el handler ANTES de que se disparen los metadatos
      video.onloadedmetadata = () => {
        console.log("📸 loadedmetadata:", video.videoWidth, video.videoHeight);

        setResolution({
          width: video.videoWidth,
          height: video.videoHeight,
        });

        // Intentar reproducir
        video
          .play()
          .then(() => console.log("▶️ Video reproduciéndose"))
          .catch((e) => console.error("Error al reproducir video:", e));
      };

    } catch (err) {
      console.error("Error iniciando cámara:", err);
    }
  };


  /** ⏱️ Timer del cuestionario */
  useEffect(() => {
    if (step !== "questionnaire") return;
    setSeconds(0);
    const intervalId = window.setInterval(() => {
      setSeconds((prev) => (prev >= QUESTION_TIME ? prev : prev + 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [currentIndex, step]);

  /** 🔄 LOOP DE DETECCIÓN INTELIGENTE (SIN setInterval) */
  useEffect(() => {
    if (!loaded) return;

    let isActive = true;
    let lastDetection = 0;
    let lastSend = 0;
    let lastUiUpdate = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const processVideo = async () => {
      // Si el componente se desmontó, paramos el loop
      if (!isActive || !isMountedRef.current) return;

      if (!videoRef.current || !canvasRef.current) {
        requestAnimationFrame(processVideo);
        return;
      }

      const now = performance.now();

      // 1. LIMITADOR DE FPS DE DETECCIÓN (Máx 10 veces por segundo = 100ms)
      // Esto evita que la CPU se queme intentando procesar 60 frames
      if (now - lastDetection < 100) {
        requestAnimationFrame(processVideo);
        return;
      }
      lastDetection = now;

      // Calcular FPS reales para mostrar en pantalla
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }

      const video = videoRef.current;

      // Asegurarse de que el video esté reproduciéndose y tenga dimensiones válidas
      if (video.ended || video.videoWidth === 0) {
        requestAnimationFrame(processVideo);
        return;
      }

      // Si está pausado → intenta reproducirlo
      if (video.paused) {
        video.play().catch(() => { });
      }


      // 2. DETECCIÓN LIGERA
      // inputSize: 160 es muy rápido. scoreThreshold: 0.4 filtra falsos positivos.
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 256,      // antes 160 → detecta mejor
        scoreThreshold: 0.25 // antes 0.4 → acepta más rostros
      });

      try {
        const detection = await faceapi
          .detectSingleFace(video, options)
          .withFaceLandmarks()
          .withFaceExpressions();

        // Dibujar en canvas
        const canvas = canvasRef.current;
        const displaySize = { width: video.videoWidth, height: video.videoHeight };

        if (canvas.width !== displaySize.width) canvas.width = displaySize.width;
        if (canvas.height !== displaySize.height) canvas.height = displaySize.height;

        const ctx = canvas.getContext("2d");

        if (ctx) {
          // 1️⃣ Dibujar el frame de la cámara en el canvas
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          if (detection) {
            lastFaceDetectedRef.current = Date.now();
            setIsFaceDetected(true);

            const resized = faceapi.resizeResults(detection, displaySize);

            // 2️⃣ Encima del frame, dibujar cajas y landmarks
            faceapi.draw.drawDetections(canvas, resized);
            // faceapi.draw.drawFaceLandmarks(canvas, resized);

            const expressions = resized.expressions;

            if (now - lastUiUpdate > 500) {
              setSmoothedEmotion(expressions);
              lastUiUpdate = now;
            }

            if (isRecordingRef.current && now - lastSend > 500) {
              const payload = {
                user_id: Number(userId) || 0,
                session_id: sessionId,
                emotions: expressions,
                timestamp: Date.now() / 1000,
              };
              sendEmotionHTTP(payload).catch(console.error);
              sendWS(payload);
              lastSend = now;
            }
          } else {
            if (Date.now() - lastFaceDetectedRef.current > 2000) {
              setIsFaceDetected(false);
            }
          }
        }

      } catch (error) {
        console.error("Error en ciclo de detección:", error);
      }

      // Solicitar el siguiente frame al navegador
      requestAnimationFrame(processVideo);
    };

    // Iniciar
    startCamera().then(() => {
      processVideo();
    });

    // Cleanup al desmontar
    return () => {
      isActive = false;
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [loaded]); // Solo reiniciar si 'loaded' cambia

  // Carga inicial de modelos
  useEffect(() => { loadModels(); }, []);


  /** ======= LÓGICA DE RESPUESTAS Y ENVÍO ======= */

  const handleAnswerChange = (value: number) => {
    setAnswers((prev) => { const u = [...prev]; u[currentIndex] = value; return u; });
  };

  const calculatePSSScore = () => {
    return answers.reduce((sum, val, idx) => {
      if (val < 0) return sum;
      return sum + (QUESTIONS[idx].reverse ? (4 - val) : val);
    }, 0);
  };

  const handleNextOrFinish = async () => {
    const isLastQuestion = currentIndex === QUESTIONS.length - 1;
    if (!isLastQuestion) { setCurrentIndex((prev) => prev + 1); return; }

    if (!userId) { alert("Usuario no identificado. Por favor inicia sesión."); return; }

    setSubmitting(true);
    isRecordingRef.current = false; // Detener grabación inmediatamente

    try {
      const res = await submitPSS({
        user_id: userId,
        session_id: sessionId,
        pss_score: calculatePSSScore()
      });
      setResultsData(res.data);
      setStep("completed");
    } catch (err) {
      console.error(err);
      alert("Error al enviar resultados. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewResults = () => {
    if (!resultsData) return;
    navigate("/results", { state: resultsData });
  };


  // Componente visual reutilizable para la cámara
  const renderCameraPanel = () => (
    <div className="video-card">
      <div className="video-wrapper">
        {/* 👇 Video sólo como fuente, oculto */}
        <video
          ref={videoRef}
          className="emotion-video"
          muted
          playsInline
          autoPlay
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            opacity: 0,
            pointerEvents: "none",
          }}
        />


        {/* 👇 Lo que se muestra al usuario */}
        <canvas ref={canvasRef} className="emotion-canvas" />

        {!loaded && (
          <div className="video-placeholder">Cargando Modelos IA...</div>
        )}

        {loaded && !isFaceDetected && (
          <div className="video-warning-overlay">
            <div className="warning-icon">⚠️</div>
            <div className="warning-text">Rostro no detectado</div>
            <div className="warning-subtext">
              Por favor, ubícate frente a la cámara y asegúrate de tener buena luz.
            </div>
          </div>
        )}
      </div>

      <div className="camera-stats">
        <span>FPS: {fps}</span>
        <span>
          Res: {resolution.width}x{resolution.height}
        </span>
        {step === "questionnaire" && (
          <span style={{ color: "red", fontWeight: "bold" }}>🔴 GRABANDO</span>
        )}
      </div>
    </div>
  );


  /** ========================================================
   * RENDERIZADO POR PASOS
   * ======================================================== */

  // 1. INTRO
  if (step === "intro") {
    return (
      <div className="emotion-page">
        <section className="emotion-header">
          <p className="emotion-description">
            Este sistema evalúa tu nivel de estrés analizando expresiones faciales y respuestas al cuestionario PSS-10.
            Por favor, asegúrate de tener buena iluminación.
          </p>
          <div className="emotion-features">
            <div className="feature-card">
              <div className="feature-icon">😊</div>
              <h3>Análisis Facial</h3>
              <p>Detecta emociones en tiempo real usando IA ligera.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📋</div>
              <h3>Test PSS-10</h3>
              <p>Evalúa tu percepción de estrés en el último mes.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Resultados</h3>
              <p>Recibe un reporte instantáneo de tu estado.</p>
            </div>
          </div>
        </section>

        <section className="emotion-main">
          {renderCameraPanel()}
          <div className="emotion-panel">
            <h3>Prueba de Detección</h3>
            <div className="emotion-json">
              {smoothedEmotion ? (
                <pre>{JSON.stringify(smoothedEmotion, null, 2)}</pre>
              ) : (
                <p>Esperando rostro...</p>
              )}
            </div>
          </div>
        </section>

        <div className="emotion-actions">
          <button className="btn-questionary" onClick={() => setStep("instructions")}>
            Continuar a Instrucciones
          </button>
        </div>
      </div>
    );
  }

  // 2. INSTRUCCIONES
  if (step === "instructions") {
    return (
      <div className="questionnaire-page">
        <header className="questionnaire-header">
          <h1>Instrucciones</h1>
        </header>

        <div className="questionnaire-grid">
          <section className="card card-pss">
            <h3>Escala de Estrés Percibido (PSS-10)</h3>
            <div style={{ fontSize: "1rem", lineHeight: "1.6", color: "#444" }}>
              <p>Responde pensando en tus sentimientos durante el <strong>último mes</strong>.</p>
              <div className="alert-info" style={{ backgroundColor: "#e3f2fd", padding: "15px", borderRadius: "8px", marginTop: "20px" }}>
                ℹ️ <strong>Atención:</strong> Cada pregunta tiene un temporizador de seguridad de 25 segundos.
                <br />
                <strong>La cámara comenzará a grabar tus micro-expresiones al iniciar el test.</strong>
              </div>
            </div>
            <div style={{ marginTop: "30px" }}>
              <button className="btn-finish" onClick={() => setStep("questionnaire")}>
                Comenzar Test
              </button>
            </div>
          </section>
          <section className="card card-camera">
            <h3>Monitor</h3>
            {renderCameraPanel()}
          </section>
        </div>
      </div>
    );
  }

  // 3. CUESTIONARIO
  if (step === "questionnaire") {
    const currentQuestion = QUESTIONS[currentIndex];
    const currentAnswer = answers[currentIndex];
    const canContinue = currentAnswer !== -1 && seconds >= QUESTION_TIME;

    return (
      <div className="questionnaire-page">
        <header className="questionnaire-header">
          <h1>Evaluación</h1>
        </header>

        <div className="questionnaire-grid">
          <section className="card card-pss">
            <h3>Pregunta {currentIndex + 1} de {QUESTIONS.length}</h3>

            <div className="pss-question-row">
              <p className="pss-question-text">{currentQuestion.text}</p>
              <div className="pss-options">
                {scaleOptions.map((opt) => (
                  <label key={opt.value} className="pss-option" style={{ backgroundColor: currentAnswer === opt.value ? "#e0f7fa" : "white" }}>
                    <input
                      type="radio"
                      name={`q${currentIndex}`}
                      value={opt.value}
                      checked={currentAnswer === opt.value}
                      onChange={() => handleAnswerChange(opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div style={{ marginTop: "20px", color: "#555" }}>
              <p>Siguiente habilitado en: {Math.max(0, QUESTION_TIME - seconds)}s</p>
              <div style={{ width: "100%", height: "8px", background: "#eee", borderRadius: "4px", overflow: "hidden" }}>
                <div style={{ width: `${(seconds / QUESTION_TIME) * 100}%`, height: "100%", background: canContinue ? "#4caf50" : "#ff9800", transition: "width 1s linear" }}></div>
              </div>
            </div>

            <div style={{ marginTop: "20px" }}>
              <button
                className="btn-finish"
                disabled={!canContinue || submitting}
                onClick={handleNextOrFinish}
                style={{
                  opacity: canContinue ? 1 : 0.5,
                  cursor: canContinue ? "pointer" : "not-allowed"
                }}
              >
                {submitting ? "Enviando..." : (currentIndex === QUESTIONS.length - 1 ? "Finalizar" : "Siguiente")}
              </button>
            </div>
          </section>

          <section className="card card-camera">
            <h3>Monitor (GRABANDO)</h3>
            {renderCameraPanel()}
          </section>
        </div>
      </div>
    );
  }

  // 4. COMPLETADO
  return (
    <div className="completed-page">
      <div className="completed-card">
        <h2>¡Cuestionario completado!</h2>
        <p>Gracias por completar la evaluación. Tus resultados están listos.</p>
        <button className="btn-view-results" onClick={handleViewResults}>
          Ver Resultados
        </button>
      </div>
    </div>
  );
};