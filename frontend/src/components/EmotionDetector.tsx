// src/components/EmotionDetector.tsx
import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { sendEmotionHTTP } from "../services/emotionService";
import { sendWS } from "../services/wsService";
import { submitPSS } from "../services/pssService";
import { useNavigate } from "react-router-dom";
import "../styles/EmotionDetector.css";

const MODEL_URL = "/models";
const QUESTION_TIME = 25; // ⏱️ Tiempo mínimo por pregunta en segundos

// Definimos los pasos del flujo
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
  // Refs para video y detección
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);

  // 🔥 NUEVO: Ref para controlar cuándo guardar datos
  // Usamos ref en lugar de state porque necesitamos acceder al valor actualizado dentro del setInterval
  const isRecordingRef = useRef(false);

  // Estados de IA y Cámara
  const [loaded, setLoaded] = useState(false);
  const [smoothBuffer, setSmoothBuffer] = useState<any[]>([]);
  const [smoothedEmotion, setSmoothedEmotion] = useState<any>(null);
  const [fps, setFps] = useState(0);
  const [fpsBuffer, setFpsBuffer] = useState<number[]>([]);
  const [resolution, setResolution] = useState({ width: 0, height: 0 });

  // Estados de Flujo y Usuario
  const [step, setStep] = useState<Step>("intro");
  const [sessionId] = useState(() => crypto.randomUUID());
  const [userId, setUserId] = useState<number | null>(null);

  // Estados del Cuestionario
  const [currentIndex, setCurrentIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [answers, setAnswers] = useState<number[]>(Array(QUESTIONS.length).fill(-1));
  const [resultsData, setResultsData] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const navigate = useNavigate();

  // Cargar ID de usuario al montar
  useEffect(() => {
    const stored = localStorage.getItem("user_id");
    if (stored) setUserId(Number(stored));
  }, []);

  // 🔥 NUEVO: Sincronizar el ref de grabación con el paso actual
  useEffect(() => {
    // Solo permitimos enviar datos si estamos en la fase del cuestionario
    if (step === "questionnaire") {
      isRecordingRef.current = true;
      console.log("🔴 GRABACIÓN DE DATOS INICIADA (Dataset activo)");
    } else {
      isRecordingRef.current = false;
      console.log("⏸️ GRABACIÓN PAUSADA (Modo prueba de cámara)");
    }
  }, [step]);

  /** 1. Cargar modelos de FaceAPI */
  const loadModels = async () => {
    try {
      await Promise.all([
        // CAMBIO IMPORTANTE: Usamos el modelo Tiny
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL), // Ojo: a veces se necesita el "tiny" landmark también, pero prueba con este primero
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),

        /*faceapi.loadSsdMobilenetv1Model(MODEL_URL),
        faceapi.loadFaceLandmarkModel(MODEL_URL),
        faceapi.loadFaceExpressionModel(MODEL_URL),*/

      ]);
      setLoaded(true);
      console.log("✅ Modelos cargados (Tiny Version)");
    } catch (err) {
      console.error("Error cargando modelos:", err);
    }
  };

  /** 2. Iniciar cámara */
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },       // 🔹 antes 640
          height: { ideal: 240 },      // 🔹 antes 480
          facingMode: "user",
          frameRate: { ideal: 15, max: 20 }, // 🔹 limitamos FPS de la cámara
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;

      video.onloadedmetadata = () => {
        setResolution({
          width: video.videoWidth,
          height: video.videoHeight,
        });

        video
          .play()
          .then(() => console.log("▶️ Video reproduciéndose"))
          .catch((e) => console.error("Error al reproducir video:", e));
      };
    } catch (err) {
      console.error("Error iniciando cámara:", err);
    }
  };


  /** ⏱️ Lógica del Timer */
  useEffect(() => {
    if (step !== "questionnaire") return;

    setSeconds(0);
    const intervalId = window.setInterval(() => {
      setSeconds((prev) => {
        if (prev >= QUESTION_TIME) return prev;
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [currentIndex, step]);

  /** Lógica de FPS */
  useEffect(() => {
    if (!loaded) return;
    let lastFrameTime = performance.now();
    let frameCount = 0;
    let animationId: number;

    const updateFPS = () => {
      frameCount++;
      animationId = requestAnimationFrame(updateFPS);
    };
    updateFPS();

    const intervalId = window.setInterval(() => {
      const now = performance.now();
      const delta = now - lastFrameTime;
      const rawFps = delta > 0 ? Math.round((frameCount / delta) * 1000) : 0;
      frameCount = 0;
      lastFrameTime = now;
      setFpsBuffer((prev) => {
        const updated = [...prev, rawFps];
        if (updated.length > 10) updated.shift();
        return updated;
      });
    }, 1000);

    return () => {
      window.cancelAnimationFrame(animationId);
      clearInterval(intervalId);
    };
  }, [loaded]);

  useEffect(() => {
    if (fpsBuffer.length === 0) return;
    const avg = fpsBuffer.reduce((sum, value) => sum + value, 0) / fpsBuffer.length;
    setFps(Math.round(avg));
  }, [fpsBuffer]);

  const computeSmoothEmotion = (expressions: any) => {
    setSmoothBuffer((prev) => {
      const updated = [...prev, expressions];
      if (updated.length > 5) updated.shift();
      return updated;
    });
  };

  useEffect(() => {
    if (smoothBuffer.length === 0) return;
    const keys = Object.keys(smoothBuffer[0]);
    const avg: any = {};
    keys.forEach((k) => {
      avg[k] = smoothBuffer.reduce((sum, e) => sum + e[k], 0) / smoothBuffer.length;
    });
    setSmoothedEmotion(avg);
  }, [smoothBuffer]);

  /** Loop de detección de Rostros */
  /* const runDetectionLoop = () => {
     const intervalId = window.setInterval(async () => {
       if (!videoRef.current || !loaded) return;
 
       // Opciones para mejorar rendimiento si es necesario (minConfidence)
       const detections = await faceapi
         .detectSingleFace(videoRef.current, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
         .withFaceLandmarks()
         .withFaceExpressions();
 
       const canvas = canvasRef.current;
       const video = videoRef.current;
       if (!canvas || !video) return;
 
       canvas.width = video.videoWidth;
       canvas.height = video.videoHeight;
       const displaySize = { width: video.videoWidth, height: video.videoHeight };
       faceapi.matchDimensions(canvas, displaySize);
       const ctx = canvas.getContext("2d");
       if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
 
       if (!detections) return;
       const resized = faceapi.resizeResults(detections, displaySize);
       faceapi.draw.drawDetections(canvas, resized);
       faceapi.draw.drawFaceLandmarks(canvas, resized);
 
       if (resized.expressions) {
         // Siempre calculamos el promedio para mostrarlo en pantalla (Feedback visual)
         computeSmoothEmotion(resized.expressions);
         
         // 🔥 LÓGICA CONDICIONAL DE ENVÍO
         // Solo enviamos al backend si el Ref indica que estamos grabando (Cuestionario activo)
         if (isRecordingRef.current) {
             const payload = {
               user_id: Number(userId) || 0,
               session_id: sessionId,
               emotions: resized.expressions,
               timestamp: Date.now() / 1000,
             };
             
             // Enviamos datos al backend y WS
             sendEmotionHTTP(payload);
             sendWS(payload);
         }
       }
     }, 150); // Loop cada 150ms
 
     detectionIntervalRef.current = intervalId;
   };*/

  /** Loop de detección OPTIMIZADO */
  /** Loop de detección OPTIMIZADO Y ALINEADO */
  const runDetectionLoop = () => {
    // Usamos este ref solo como flag de “sigo vivo”
    detectionIntervalRef.current = 1;

    let lastDetection = 0;

    const detect = async () => {
      if (!videoRef.current || !canvasRef.current || !loaded || !detectionIntervalRef.current) {
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Asegurarnos de que el video tenga datos
      if (video.readyState < 2 || video.videoWidth === 0) {
        requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();

      // Limitar frecuencia de detección (~8 fps)
      if (now - lastDetection < 120) {
        requestAnimationFrame(detect);
        return;
      }
      lastDetection = now;

      // --- 1) Ajustar tamaño interno del canvas al del video ---
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        requestAnimationFrame(detect);
        return;
      }

      // --- 2) Dibujar el frame de la cámara en el canvas ---
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // --- 3) Detectar directamente SOBRE el canvas ---
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.5,
      });

      try {
        const result = await faceapi
          .detectSingleFace(canvas, options)      // 👈 aquí ahora usamos canvas
          .withFaceLandmarks()
          .withFaceExpressions();

        // Limpiamos SOLO overlays (no el frame que acabamos de dibujar)
        // Opcional: si quieres limpiar antes de dibujar cajas:
        // ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (result) {
          // Como la detección se hizo en el mismo canvas,
          // NO hace falta matchDimensions ni resizeResults
          faceapi.draw.drawDetections(canvas, result);
          faceapi.draw.drawFaceLandmarks(canvas, result);

          if (result.expressions) {
            computeSmoothEmotion(result.expressions);

            if (isRecordingRef.current) {
              const payload = {
                user_id: Number(userId) || 0,
                session_id: sessionId,
                emotions: result.expressions,
                timestamp: Date.now() / 1000,
              };
              sendEmotionHTTP(payload);
              sendWS(payload);
            }
          }
        }
      } catch (e) {
        console.error("Error en loop de detección:", e);
      }

      requestAnimationFrame(detect);
    };

    detect();
  };



  // Carga inicial
  useEffect(() => { loadModels(); }, []);

  // Reinicio de cámara al cambiar de paso o cargar modelos
  useEffect(() => {
    if (!loaded) return;

    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }

    startCamera();
    runDetectionLoop();

    // Cleanup
    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [loaded, step]);

  /** ======= LÓGICA DE RESPUESTAS Y ENVÍO ======= */

  const handleAnswerChange = (value: number) => {
    setAnswers((prev) => {
      const updated = [...prev];
      updated[currentIndex] = value;
      return updated;
    });
  };

  const calculatePSSScore = () => {
    return answers.reduce((sum, val, idx) => {
      if (val < 0) return sum;
      if (QUESTIONS[idx].reverse) {
        return sum + (4 - val);
      }
      return sum + val;
    }, 0);
  };

  const handleNextOrFinish = async () => {
    const isLastQuestion = currentIndex === QUESTIONS.length - 1;

    if (!isLastQuestion) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    if (!userId) {
      alert("No se encontró el usuario. Inicia sesión nuevamente.");
      return;
    }

    setSubmitting(true);
    // Dejamos de grabar inmediatamente al terminar
    isRecordingRef.current = false;

    const pss_score = calculatePSSScore();

    try {
      const res = await submitPSS({
        user_id: userId,
        session_id: sessionId,
        pss_score,
      });

      setResultsData(res.data);
      setStep("completed");
    } catch (err) {
      console.error(err);
      alert("Error al enviar el cuestionario. Inténtalo de nuevo.");
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
        <video ref={videoRef} className="emotion-video" muted playsInline />
        <canvas ref={canvasRef} className="emotion-canvas" />
        {!loaded && <div className="video-placeholder">Cargando modelos...</div>}
      </div>
      <div className="camera-stats">
        <span>FPS: {fps}</span>
        <span>Res: {resolution.width} x {resolution.height}</span>
        {step === "questionnaire" && <span style={{ color: "red", fontWeight: "bold" }}>🔴 REC</span>}
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
            Este sistema te permite evaluar tu nivel de estrés de forma rápida y
            sencilla mediante el análisis de tus expresiones faciales y un breve
            cuestionario. Utiliza técnicas de Machine Learning para ofrecerte un
            resultado claro y personalizado, ayudándote a conocer tu estado
            emocional y brindando apoyo al bienestar universitario.
          </p>

          <div className="emotion-features">
            <div className="feature-card">
              <div className="feature-icon">😊</div>
              <h3>Análisis de emociones</h3>
              <p>
                Analiza tus expresiones faciales para reconocer tus emociones en
                tiempo real.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📋</div>
              <h3>Cuestionario sobre estrés</h3>
              <p>
                Responde a las preguntas para evaluar tus niveles de estrés
                percibidos.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Resultados del estudiante</h3>
              <p>
                Consulta los resultados de tu evaluación de estrés y el
                historial de tus mediciones.
              </p>
            </div>
          </div>
        </section>

        <section className="emotion-main">
          {renderCameraPanel()}
          <div className="emotion-panel">
            <h3>Emociones detectadas (Prueba)</h3>
            <div className="emotion-json">
              {smoothedEmotion ? (
                <pre>{JSON.stringify(smoothedEmotion, null, 2)}</pre>
              ) : (
                <p>Detectando...</p>
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
          <h1>Instrucciones del Test</h1>
        </header>

        <div className="questionnaire-grid">
          <section className="card card-pss">
            <h3>Sobre la Escala de Estrés Percibido (PSS-10)</h3>

            <div style={{ fontSize: "1rem", lineHeight: "1.6", color: "#444", textAlign: "left" }}>
              <p>
                A continuación, encontrarás 10 preguntas sobre tus sentimientos y pensamientos
                durante el <strong>último mes</strong>.
              </p>

              <ul style={{ margin: "20px 0", paddingLeft: "20px" }}>
                <li style={{ marginBottom: "10px" }}>
                  <strong>Objetivo:</strong> Evaluar cuán impredecible, incontrolable y sobrecargada
                  sientes tu vida actualmente.
                </li>
                <li style={{ marginBottom: "10px" }}>
                  <strong>Cómo responder:</strong> No intentes contar el número exacto de veces que te has sentido de una manera particular.
                  Marca la alternativa que mejor represente tu estimación general.
                </li>
              </ul>

              <div className="alert-info" style={{ backgroundColor: "#e3f2fd", padding: "15px", borderRadius: "8px", marginTop: "20px", borderLeft: "5px solid #2196f3" }}>
                ℹ️ <strong>Atención:</strong> Para garantizar una lectura emocional precisa,
                cada pregunta tendrá un <strong>temporizador de 25 segundos</strong> antes de poder avanzar a la siguiente.
                <br />
                <strong>Tus datos faciales comenzarán a grabarse al iniciar el test.</strong>
              </div>
            </div>

            <div style={{ marginTop: "30px" }}>
              <button
                className="btn-finish"
                onClick={() => setStep("questionnaire")}
                style={{ width: "100%", cursor: "pointer" }}
              >
                Entendido, Iniciar Test
              </button>
            </div>
          </section>

          <section className="card card-camera">
            <h3>Monitor de Emociones</h3>
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
    const hasAnswered = currentAnswer !== -1;
    const timeCompleted = seconds >= QUESTION_TIME;
    const canContinue = hasAnswered && timeCompleted;
    const isLastQuestion = currentIndex === QUESTIONS.length - 1;

    return (
      <div className="questionnaire-page">
        <header className="questionnaire-header">
          <h1>Evaluación de Estrés</h1>
        </header>

        <div className="questionnaire-grid">
          <section className="card card-pss">
            <h3>Pregunta {currentIndex + 1} de {QUESTIONS.length}</h3>

            <div className="pss-question-row">
              <p className="pss-question-text" style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "20px 0" }}>
                {currentQuestion.text}
              </p>

              <div className="pss-options" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {scaleOptions.map((opt) => (
                  <label key={opt.value} className="pss-option" style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", backgroundColor: currentAnswer === opt.value ? "#e0f7fa" : "white" }}>
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
              <div style={{ width: "100%", height: "10px", background: "#eee", borderRadius: "5px", overflow: "hidden" }}>
                <div style={{ width: `${(seconds / QUESTION_TIME) * 100}%`, height: "100%", background: canContinue ? "#4caf50" : "#ff9800", transition: "width 1s linear" }}></div>
              </div>
            </div>

            {!hasAnswered && <p style={{ color: "orange", fontSize: "0.9rem", marginTop: "10px" }}>⚠️ Selecciona una respuesta.</p>}
            {hasAnswered && !timeCompleted && <p style={{ color: "#2196f3", fontSize: "0.9rem", marginTop: "10px" }}>⏳ Analizando emociones... espera el temporizador.</p>}

            <div style={{ marginTop: "20px" }}>
              <button
                className="btn-finish"
                disabled={!canContinue || submitting}
                onClick={handleNextOrFinish}
                style={{
                  opacity: canContinue ? 1 : 0.5,
                  cursor: canContinue ? "pointer" : "not-allowed",
                  width: "100%"
                }}
              >
                {submitting ? "Enviando..." : (isLastQuestion ? "Finalizar Cuestionario" : "Siguiente Pregunta")}
              </button>
            </div>
          </section>

          <section className="card card-camera">
            <h3>Monitor de Emociones (GRABANDO)</h3>
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
        <p>Gracias por completar la evaluación. Tus respuestas han sido registradas y procesadas.</p>
        <button className="btn-view-results" onClick={handleViewResults}>
          Ver Resultados
        </button>
      </div>
    </div>
  );
};

