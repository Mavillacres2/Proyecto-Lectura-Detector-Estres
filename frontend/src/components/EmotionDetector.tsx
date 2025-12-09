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
  
  // 🔥 Control de grabación
  const isRecordingRef = useRef(false);
  const isMountedRef = useRef(true); // Para evitar memory leaks al desmontar

  const [loaded, setLoaded] = useState(false);
  // Eliminamos smoothBuffer del estado para evitar re-renders masivos
  // Usamos ref para cálculos internos
  const smoothBufferRef = useRef<any[]>([]); 
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

  useEffect(() => {
    isMountedRef.current = true;
    const stored = localStorage.getItem("user_id");
    if (stored) setUserId(Number(stored));
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (step === "questionnaire") {
        isRecordingRef.current = true;
        console.log("🔴 REC: Dataset activo");
    } else {
        isRecordingRef.current = false;
    }
  }, [step]);

  /** 1. Cargar modelos optimizados (Tiny) */
  const loadModels = async () => {
    try {
      await Promise.all([
        // Usamos TinyFaceDetector que es mucho más rápido
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      if (isMountedRef.current) setLoaded(true);
      console.log("✅ Modelos cargados");
    } catch (err) {
      console.error("Error cargando modelos:", err);
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
          frameRate: { ideal: 15, max: 24 } // Limitamos FPS desde la cámara
        },
      });

      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      
      videoRef.current.onloadedmetadata = () => {
        if (!videoRef.current) return;
        setResolution({ 
            width: videoRef.current.videoWidth, 
            height: videoRef.current.videoHeight 
        });
        videoRef.current.play();
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

  /** 🔄 LOOP DE DETECCIÓN INTELIGENTE */
  useEffect(() => {
    if (!loaded) return;

    let isActive = true;
    let lastDetection = 0;
    let lastSend = 0;
    let lastUiUpdate = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const processVideo = async () => {
      if (!isActive || !videoRef.current || !canvasRef.current) return;

      const now = performance.now();

      // 1. LIMITADOR DE FPS DE DETECCIÓN (Máx 10 veces por segundo = 100ms)
      if (now - lastDetection < 100) {
        requestAnimationFrame(processVideo);
        return;
      }
      lastDetection = now;

      // Calcular FPS reales
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }

      const video = videoRef.current;
      
      // Asegurarse de que el video esté reproduciéndose y tenga dimensiones
      if (video.paused || video.ended || video.videoWidth === 0) {
          requestAnimationFrame(processVideo);
          return;
      }

      // 2. DETECCIÓN LIGERA
      // inputSize: 160 es muy rápido. Si quieres más precisión usa 224.
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.4 });
      
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

        faceapi.matchDimensions(canvas, displaySize);
        const ctx = canvas.getContext("2d");
        
        if (ctx) {
            // Limpiar menos agresivamente o solo dibujar si hay detección
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (detection) {
                const resized = faceapi.resizeResults(detection, displaySize);
                faceapi.draw.drawDetections(canvas, resized);
                // Ocultamos landmarks para ganar rendimiento, descomenta si los necesitas visualmente
                // faceapi.draw.drawFaceLandmarks(canvas, resized); 
                
                const expressions = resized.expressions;

                // 3. ACTUALIZAR UI (JSON) SOLO 2 VECES POR SEGUNDO
                // Esto evita que React se trabe re-renderizando texto a 60fps
                if (now - lastUiUpdate > 500) {
                   setSmoothedEmotion(expressions);
                   lastUiUpdate = now;
                }

                // 4. ENVIAR A SERVIDOR SOLO SI ESTAMOS GRABANDO Y HA PASADO EL TIEMPO (500ms)
                if (isRecordingRef.current && (now - lastSend > 500)) {
                    const payload = {
                        user_id: Number(userId) || 0,
                        session_id: sessionId,
                        emotions: expressions,
                        timestamp: Date.now() / 1000,
                    };
                    // Enviamos sin 'await' para no bloquear el loop
                    sendEmotionHTTP(payload).catch(console.error);
                    sendWS(payload);
                    lastSend = now;
                }
            }
        }
      } catch (error) {
          console.error("Error en ciclo de detección:", error);
      }

      // Siguiente frame
      requestAnimationFrame(processVideo);
    };

    startCamera().then(() => {
        processVideo();
    });

    return () => {
      isActive = false;
      // Detener video
      if (videoRef.current && videoRef.current.srcObject) {
         (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, [loaded]);

  // Carga inicial
  useEffect(() => { loadModels(); }, []);


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
      const res = await submitPSS({ user_id: userId, session_id: sessionId, pss_score: calculatePSSScore() });
      setResultsData(res.data);
      setStep("completed");
    } catch (err) {
      console.error(err);
      alert("Error al enviar.");
    } finally {
      setSubmitting(false);
    }
  };

  const renderCameraPanel = () => (
    <div className="video-card">
      <div className="video-wrapper">
        <video ref={videoRef} className="emotion-video" muted playsInline />
        <canvas ref={canvasRef} className="emotion-canvas" />
        {!loaded && <div className="video-placeholder">Cargando IA...</div>}
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
        </section>
        <section className="emotion-main">
          {renderCameraPanel()}
          <div className="emotion-panel">
            <h3>Vista Previa</h3>
            <div className="emotion-json">
              {smoothedEmotion ? <pre>{JSON.stringify(smoothedEmotion, null, 2)}</pre> : <p>Cargando cara...</p>}
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
            <h3>Sobre PSS-10</h3>
            <div style={{fontSize: "1rem", color: "#444"}}>
              <p>Responde pensando en el último mes.</p>
              <div className="alert-info" style={{background: "#e3f2fd", padding: "10px", borderRadius: "8px", marginTop: "10px"}}>
                ℹ️ Temporizador de 25s por pregunta.
              </div>
            </div>
            <button className="btn-finish" onClick={() => setStep("questionnaire")}>Iniciar Test</button>
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
            <h3>Pregunta {currentIndex + 1}</h3>
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
        <h2>¡Completado!</h2>
        <button className="btn-view-results" onClick={() => resultsData && navigate("/results", { state: resultsData })}>Ver Resultados</button>
      </div>
    </div>
  );
};