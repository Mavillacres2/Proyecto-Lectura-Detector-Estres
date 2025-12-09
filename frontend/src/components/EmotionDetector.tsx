// src/components/EmotionDetector.tsx
import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { sendEmotionHTTP } from "../services/emotionService";
// import { sendWS } from "../services/wsService"; // Desactivado para no saturar con 15 usuarios
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

// ⚡ CONFIGURACIÓN DE RENDIMIENTO
const VISUAL_DETECTION_MS = 100; // Detección visual rápida (10 FPS) para que se vea fluido
const NETWORK_SEND_MS = 1000;    // Enviar datos a Mongo cada 1 segundo (Para aguantar 15 usuarios)
const TINY_INPUT_SIZE = 160;     // Resolución ligera

export const EmotionDetector: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);

  const isRecordingRef = useRef(false);
  const isMountedRef = useRef(true);
  const lastFaceDetectedRef = useRef<number>(Date.now());
  
  const [isFaceDetected, setIsFaceDetected] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [smoothedEmotion, setSmoothedEmotion] = useState<any>(null);
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

  useEffect(() => {
    isMountedRef.current = true;
    const stored = localStorage.getItem("user_id");
    if (stored) setUserId(Number(stored));
    return () => { isMountedRef.current = false; };
  }, []);

  // Sincronizar estado de grabación
  useEffect(() => {
    if (step === "questionnaire") {
        isRecordingRef.current = true;
        console.log("🔴 REC: Dataset activo (Guardando en Mongo)");
    } else {
        isRecordingRef.current = false;
    }
  }, [step]);

  /** 1. Cargar modelos (Con protección WebGL/CPU) */
  const loadModels = async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), 
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      
      // Intentar WebGL, si falla usar CPU
      try {
        await faceapi.tf.setBackend('webgl');
        await faceapi.tf.ready();
      } catch (e) {
        console.warn("⚠️ WebGL falló, usando CPU");
        await faceapi.tf.setBackend('cpu');
      }

      if (isMountedRef.current) {
          setLoaded(true);
          console.log("✅ Modelos cargados");
      }
    } catch (err) {
      console.error("Error cargando modelos:", err);
    }
  };

  /** 2. Iniciar cámara (Con corrección de pantalla gris) */
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 }, 
          height: { ideal: 240 }, 
          facingMode: "user",
          frameRate: { ideal: 15, max: 24 } 
        },
        audio: false
      });

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      
      // 🔥 FORZAR PLAY (Vital para que no se quede congelado)
      await videoRef.current.play().catch(e => console.error("Error play:", e));

      videoRef.current.onloadedmetadata = () => {
        if (!videoRef.current) return;
        setResolution({ 
            width: videoRef.current.videoWidth, 
            height: videoRef.current.videoHeight 
        });
      };
    } catch (err) {
      console.error("Error cámara:", err);
    }
  };

  /** ⏱️ Timer */
  useEffect(() => {
    if (step !== "questionnaire") return;
    setSeconds(0);
    const intervalId = window.setInterval(() => {
      setSeconds((prev) => (prev >= QUESTION_TIME ? prev : prev + 1));
    }, 1000);
    return () => clearInterval(intervalId);
  }, [currentIndex, step]); 

  /** 🔄 LOOP DE DETECCIÓN (Fluidez Visual + Envío Seguro) */
  const runDetectionLoop = () => {
    detectionIntervalRef.current = 1;

    let lastDetection = 0;
    let lastSend = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const detect = async () => {
      // Validaciones de seguridad
      if (!videoRef.current || !canvasRef.current || !loaded || !detectionIntervalRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Pausa si no estamos en el cuestionario
      if (step !== "questionnaire") {
          requestAnimationFrame(detect);
          return;
      }

      if (video.paused || video.ended || video.videoWidth === 0) {
          requestAnimationFrame(detect);
          return;
      }

      const now = performance.now();

      // Freno VISUAL (100ms - Rápido para que se vea bien)
      if (now - lastDetection < VISUAL_DETECTION_MS) {
        requestAnimationFrame(detect);
        return;
      }
      lastDetection = now;

      // Calcular FPS
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }

      // Ajustar Canvas
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
          requestAnimationFrame(detect);
          return;
      }

      // 🔥 LIMPIAR CANVAS (No dibujar video, dejar que <video> se muestre solo)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const options = new faceapi.TinyFaceDetectorOptions({ 
          inputSize: TINY_INPUT_SIZE, 
          scoreThreshold: 0.4 
      });

      try {
        const detection = await faceapi
            .detectSingleFace(video, options) // Detectamos directo del video
            .withFaceLandmarks()
            .withFaceExpressions();

        if (detection) {
            // Rostro encontrado
            lastFaceDetectedRef.current = Date.now();
            setIsFaceDetected(true);

            const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
            
            // Dibujar cuadros (Visual)
            faceapi.draw.drawDetections(canvas, resized);
            
            const expressions = resized.expressions;
            setSmoothedEmotion(expressions);

            // ⚡ ENVÍO DE DATOS A MONGO (Cada 1 segundo para no bloquear)
            if (isRecordingRef.current && (now - lastSend > NETWORK_SEND_MS)) {
                const payload = {
                    user_id: Number(userId) || 0,
                    session_id: sessionId,
                    emotions: expressions,
                    timestamp: Date.now() / 1000,
                };
                // Enviamos SOLO por HTTP (tu backend ya está configurado para solo escribir en Mongo)
                sendEmotionHTTP(payload).catch(() => {});
                lastSend = now;
            }
        } else {
            // Alerta si no hay rostro
            if (Date.now() - lastFaceDetectedRef.current > 2000) {
                setIsFaceDetected(false);
            }
        }
      } catch (e) {
        // Silenciar errores
      }

      requestAnimationFrame(detect);
    };

    detect();
  };

  useEffect(() => { loadModels(); }, []);

  // Iniciar cámara y loop
  useEffect(() => {
    if (!loaded) return;
    
    startCamera();

    if (step === "questionnaire") {
        runDetectionLoop();
    }

    return () => {
        detectionIntervalRef.current = null;
        if (videoRef.current?.srcObject) {
            (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
        }
    };
  }, [loaded, step]);


  /** ======= LÓGICA DE RESPUESTAS ======= */

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

    if (!userId) { alert("Usuario no identificado."); return; }
    
    setSubmitting(true);
    isRecordingRef.current = false;
    
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
      alert("Error al enviar resultados.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewResults = () => {
    if (!resultsData) return;
    navigate("/results", { state: resultsData });
  };

  // Componente visual
  const renderCameraPanel = () => (
    <div className="video-card">
      <div className="video-wrapper">
        {/* 🔥 VIDEO VISIBLE Y CON AUTOPLAY */}
        <video 
          ref={videoRef} 
          className="emotion-video" 
          autoPlay 
          muted 
          playsInline 
          style={{ width: "100%", display: "block", objectFit: "cover" }}
        />
        <canvas ref={canvasRef} className="emotion-canvas" />
        
        {!loaded && <div className="video-placeholder">Cargando IA...</div>}

        {loaded && !isFaceDetected && (
            <div className="video-warning-overlay">
                <div className="warning-icon">⚠️</div>
                <div className="warning-text">Rostro no detectado</div>
                <div className="warning-subtext">Ubícate frente a la cámara con buena luz.</div>
            </div>
        )}
      </div>
      <div className="camera-stats">
        <span>FPS: {fps}</span>
        <span>Res: {resolution.width}x{resolution.height}</span>
        {step === "questionnaire" && <span style={{color: "red", fontWeight: "bold"}}>🔴 REC</span>}
      </div>
    </div>
  );

  // VISTAS
  if (step === "intro") {
    return (
      <div className="emotion-page">
        <section className="emotion-header">
          <p className="emotion-description">Sistema de evaluación de estrés.</p>
          <div className="emotion-features">
            <div className="feature-card"><h3>Análisis Facial</h3><p>Detecta emociones en tiempo real.</p></div>
            <div className="feature-card"><h3>Test PSS-10</h3><p>Evalúa tu estrés.</p></div>
            <div className="feature-card"><h3>Resultados</h3><p>Reporte inmediato.</p></div>
          </div>
        </section>
        <section className="emotion-main">
          {renderCameraPanel()}
          <div className="emotion-panel">
            <h3>Prueba de Detección</h3>
            <div className="emotion-json">
              {smoothedEmotion ? <pre>{JSON.stringify(smoothedEmotion, null, 2)}</pre> : <p>Esperando rostro...</p>}
            </div>
          </div>
        </section>
        <div className="emotion-actions">
          <button className="btn-questionary" onClick={() => setStep("instructions")}>Instrucciones</button>
        </div>
      </div>
    );
  }

  if (step === "instructions") {
    return (
      <div className="questionnaire-page">
        <header className="questionnaire-header"><h1>Instrucciones</h1></header>
        <div className="questionnaire-grid">
          <section className="card card-pss">
            <h3>Escala de Estrés Percibido (PSS-10)</h3>
            <p>Responde pensando en el último mes.</p>
            <div className="alert-info" style={{background: "#e3f2fd", padding: "10px", borderRadius: "8px", marginTop: "10px"}}>
               ℹ️ Temporizador de 25s por pregunta. La cámara grabará durante el test.
            </div>
            <button className="btn-finish" style={{marginTop: "20px"}} onClick={() => setStep("questionnaire")}>Comenzar Test</button>
          </section>
          <section className="card card-camera"><h3>Monitor</h3>{renderCameraPanel()}</section>
        </div>
      </div>
    );
  }

  if (step === "questionnaire") {
    const q = QUESTIONS[currentIndex];
    const ans = answers[currentIndex];
    const canContinue = ans !== -1 && seconds >= QUESTION_TIME;
    
    return (
      <div className="questionnaire-page">
        <header className="questionnaire-header"><h1>Evaluación</h1></header>
        <div className="questionnaire-grid">
          <section className="card card-pss">
            <h3>Pregunta {currentIndex + 1} de {QUESTIONS.length}</h3>
            <p className="pss-question-text">{q.text}</p>
            <div className="pss-options">
              {scaleOptions.map((opt) => (
                <label key={opt.value} className="pss-option" style={{background: ans === opt.value ? "#e0f7fa" : "white"}}>
                  <input type="radio" name={`q${currentIndex}`} value={opt.value} checked={ans === opt.value} onChange={() => handleAnswerChange(opt.value)} />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <div style={{marginTop: "20px", color: "#555"}}>
               <p>Siguiente en: {Math.max(0, QUESTION_TIME - seconds)}s</p>
               <div style={{width: "100%", height: "8px", background: "#eee", borderRadius: "4px"}}><div style={{width: `${(seconds/QUESTION_TIME)*100}%`, height: "100%", background: canContinue ? "#4caf50" : "#ff9800", transition: "width 1s linear"}}></div></div>
            </div>
            <button className="btn-finish" disabled={!canContinue || submitting} onClick={handleNextOrFinish} style={{opacity: canContinue ? 1 : 0.5, cursor: canContinue ? "pointer" : "not-allowed"}}>
               {submitting ? "Enviando..." : (currentIndex === QUESTIONS.length - 1 ? "Finalizar" : "Siguiente")}
            </button>
          </section>
          <section className="card card-camera"><h3>Monitor (GRABANDO)</h3>{renderCameraPanel()}</section>
        </div>
      </div>
    );
  }

  return (
    <div className="completed-page">
      <div className="completed-card">
        <h2>¡Cuestionario completado!</h2>
        <button className="btn-view-results" onClick={handleViewResults}>Ver Resultados</button>
      </div>
    </div>
  );
};