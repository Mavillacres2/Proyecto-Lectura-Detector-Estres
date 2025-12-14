// src/components/EmotionDetector.tsx
import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { sendEmotionHTTP } from "../services/emotionService";
//import { sendWS } from "../services/wsService";
import { submitPSS } from "../services/pssService";
import { useNavigate } from "react-router-dom";
import "../styles/EmotionDetector.css";

const MODEL_URL = "/models";
const QUESTION_TIME = 20;

// Definimos los pasos del flujo
type Step = "intro" | "instructions" | "questionnaire" | "completed";

// ✅ CAMBIO PERMISOS: estados de cámara
type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "error";
const isNotAllowed = (err: any) =>
  err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";

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

const DETECTION_INTERVAL_MS = 120;
const TINY_INPUT_SIZE = 160;

export const EmotionDetector: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);

  const isRecordingRef = useRef(false);

  const [loaded, setLoaded] = useState(false);
  const [smoothBuffer, setSmoothBuffer] = useState<any[]>([]);
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

  // ✅ CAMBIO PERMISOS: estado de cámara + mensaje
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraMessage, setCameraMessage] = useState<string>(
    "Para continuar, debes permitir el acceso a la cámara."
  );
  const [cameraReady, setCameraReady] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("user_id");
    if (stored) setUserId(Number(stored));
  }, []);

  useEffect(() => {
    if (step === "questionnaire") {
      isRecordingRef.current = true;
      console.log("🔴 GRABACIÓN DE DATOS INICIADA (Dataset activo)");
    } else {
      isRecordingRef.current = false;
      console.log("⏸️ GRABACIÓN PAUSADA (Modo prueba de cámara)");
    }
  }, [step]);

  /** 1. Cargar modelos */
  const loadModels = async () => {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
      ]);
      setLoaded(true);
      console.log("✅ Modelos cargados (Tiny Version)");
    } catch (err) {
      console.error("Error cargando modelos:", err);
    }
  };

  // ✅ CAMBIO PERMISOS: helper para validar si el stream está vivo
  const isStreamLive = (video: HTMLVideoElement | null) => {
    const stream = video?.srcObject as MediaStream | null;
    if (!stream) return false;
    const tracks = stream.getVideoTracks();
    return tracks.length > 0 && tracks.some((t) => t.readyState === "live" && t.enabled);
  };

  /** 2. Iniciar cámara */
  const startCamera = async () => {
    try {
      setCameraStatus("requesting");
      setCameraReady(false);
      setCameraMessage("Solicitando permisos de cámara...");

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraStatus("error");
        setCameraMessage("Tu navegador no soporta acceso a cámara (getUserMedia).");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },
          height: { ideal: 240 },
          facingMode: "user",
          frameRate: { ideal: 15, max: 20 },
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) return;

      video.srcObject = stream;

      // ✅ CAMBIO PERMISOS: eventos para marcar cámara lista
      video.onloadedmetadata = () => {
        setResolution({ width: video.videoWidth, height: video.videoHeight });

        video
          .play()
          .then(() => {
            // Esperamos un tick para que readyState y tracks se estabilicen
            setTimeout(() => {
              const ok = video.readyState >= 2 && video.videoWidth > 0 && isStreamLive(video);
              setCameraReady(ok);
              if (ok) {
                setCameraStatus("ready");
                setCameraMessage("✅ Cámara funcionando correctamente. Ya puedes continuar.");
              } else {
                setCameraStatus("error");
                setCameraMessage("La cámara no está entregando video. Reintenta o revisa permisos.");
              }
            }, 200);
          })
          .catch((e) => {
            console.error("Error al reproducir video:", e);
            setCameraStatus("error");
            setCameraMessage("No se pudo reproducir el video. Revisa permisos o recarga la página.");
          });
      };
    } catch (err: any) {
      console.error("Error iniciando cámara:", err);

      if (isNotAllowed(err)) {
        setCameraStatus("denied");
        setCameraReady(false);
        setCameraMessage(
          "🚫 Permiso de cámara denegado. Actívalo en el navegador (icono de cámara en la barra de direcciones) y luego presiona “Reintentar”."
        );
      } else {
        setCameraStatus("error");
        setCameraReady(false);
        setCameraMessage(
          "⚠️ No se pudo acceder a la cámara. Asegúrate de que no esté siendo usada por otra app (Zoom/Meet) y reintenta."
        );
      }
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

  const computeSmoothEmotion = (expressions: any) => {
    setSmoothBuffer((prev) => {
      const updated = [...prev, expressions];
      if (updated.length > 3) updated.shift();
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

  /** Loop detección */
  const runDetectionLoop = () => {
    detectionIntervalRef.current = 1;

    let lastDetection = 0;
    let lastSend = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const detect = async () => {
      if (!videoRef.current || !canvasRef.current || !loaded || !detectionIntervalRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (step !== "questionnaire") {
        requestAnimationFrame(detect);
        return;
      }

      if (video.readyState < 2 || video.videoWidth === 0) {
        requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();
      if (now - lastDetection < DETECTION_INTERVAL_MS) {
        requestAnimationFrame(detect);
        return;
      }
      lastDetection = now;

      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        requestAnimationFrame(detect);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: TINY_INPUT_SIZE,
        scoreThreshold: 0.5,
      });

      try {
        const detection = await faceapi.detectSingleFace(canvas, options).withFaceExpressions();

        if (detection) {
          const box = detection.detection.box;

          const drawBox = new faceapi.draw.DrawBox(box, {
            label: detection.detection.score.toFixed(2),
          });
          drawBox.draw(canvas);

          const expressions = detection.expressions;
          computeSmoothEmotion(expressions);

          const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
          faceapi.draw.drawDetections(canvas, resized);

          const cleanExpressions = {
            neutral: Number(expressions.neutral.toFixed(4)),
            happy: Number(expressions.happy.toFixed(4)),
            sad: Number(expressions.sad.toFixed(4)),
            angry: Number(expressions.angry.toFixed(4)),
            fearful: Number(expressions.fearful.toFixed(4)),
            disgusted: Number(expressions.disgusted.toFixed(4)),
            surprised: Number(expressions.surprised.toFixed(4)),
          };

          if (isRecordingRef.current && now - lastSend > 1000) {
            const payload = {
              user_id: Number(userId) || 0,
              session_id: sessionId,
              emotions: cleanExpressions,
              timestamp: Date.now() / 1000,
            };
            sendEmotionHTTP(payload).catch(() => {});
            lastSend = now;
          }
        }
      } catch (e) {
        console.error("Error en loop de detección:", e);
      }

      requestAnimationFrame(detect);
    };

    detect();
  };

  useEffect(() => {
    loadModels();
  }, []);

  /** ✅ CAMBIO PERMISOS: arrancar cámara siempre que models estén cargados */
  useEffect(() => {
    if (!loaded) return;

    startCamera();

    if (step === "questionnaire") {
      runDetectionLoop();
    }

    return () => {
      detectionIntervalRef.current = null;

      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [loaded, step]);

  /** ======= RESPUESTAS ======= */
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
      if (QUESTIONS[idx].reverse) return sum + (4 - val);
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

    isRecordingRef.current = false;
    setSubmitting(true);

    await new Promise((resolve) => setTimeout(resolve, 500));

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
      setSubmitting(false);
      alert("La red está congestionada. Por favor, presiona 'Finalizar' nuevamente.");
    }
  };

  const handleViewResults = () => {
    if (!resultsData) return;
    navigate("/results", { state: resultsData });
  };

  /** Cámara Panel */
  const renderCameraPanel = () => (
    <div className="video-card">
      <div className="video-wrapper">
        <video ref={videoRef} className="emotion-video" muted playsInline />
        <canvas ref={canvasRef} className="emotion-canvas" />
        {!loaded && <div className="video-placeholder">Cargando modelos...</div>}

        {/* ✅ CAMBIO PERMISOS: overlay si no está lista */}
        {loaded && !cameraReady && (
          <div className="video-placeholder">
            {cameraStatus === "requesting" ? "Solicitando cámara..." : "Cámara no disponible"}
          </div>
        )}
      </div>

      <div className="camera-stats">
        <span>FPS: {fps}</span>
        <span>
          Res: {resolution.width} x {resolution.height}
        </span>
        {step === "questionnaire" && <span style={{ color: "red", fontWeight: "bold" }}>🔴 REC</span>}
      </div>
    </div>
  );

  /** ======================
   * RENDER POR PASOS
   * ====================== */

  // 1. INTRO
  if (step === "intro") {
    // ✅ CAMBIO PERMISOS: botón deshabilitado si la cámara no está lista
    const canGoNext = cameraReady && cameraStatus === "ready";

    // Texto rápido tipo “estado” para el panel derecho
    const statusBadge =
      cameraStatus === "ready"
        ? "✅ Cámara activa"
        : cameraStatus === "requesting"
        ? "⏳ Solicitando permisos..."
        : cameraStatus === "denied"
        ? "🚫 Permiso denegado"
        : cameraStatus === "error"
        ? "⚠️ Error de cámara"
        : "ℹ️ Sin iniciar";

    return (
      <div className="emotion-page">
        <section className="emotion-header">
          <p className="emotion-description">
            Este sistema te permite evaluar tu nivel de estrés de forma rápida y sencilla mediante el análisis de tus
            expresiones faciales y un breve cuestionario. Utiliza técnicas de Machine Learning para ofrecerte un resultado
            claro y personalizado.
          </p>

          <div className="emotion-features">
            <div className="feature-card">
              <div className="feature-icon">😊</div>
              <h3>Análisis de emociones</h3>
              <p>Analiza tus expresiones faciales para reconocer tus emociones en tiempo real.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📋</div>
              <h3>Cuestionario sobre estrés</h3>
              <p>Responde a las preguntas para evaluar tus niveles de estrés percibidos.</p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Resultados del estudiante</h3>
              <p>Consulta los resultados de tu evaluación de estrés y el historial de tus mediciones.</p>
            </div>
          </div>
        </section>

        <section className="emotion-main">
          {renderCameraPanel()}

          <div className="emotion-panel">
            <h3>Emociones detectadas (Prueba)</h3>

            {/* ✅ CAMBIO PERMISOS: aviso claro + botón reintentar */}
            <div
              style={{
                background: "#f6f7fb",
                border: "1px solid #e0e0e0",
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>{statusBadge}</div>
              <div style={{ color: "#444", lineHeight: 1.4 }}>{cameraMessage}</div>

              {(cameraStatus === "denied" || cameraStatus === "error") && (
                <button
                  onClick={startCamera}
                  style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    cursor: "pointer",
                    background: "white",
                    width: "100%",
                    fontWeight: 600,
                  }}
                >
                  Reintentar / Solicitar permisos
                </button>
              )}
            </div>

            <div className="emotion-json">
              {/* En intro solo mostramos “cámara ok” o instrucciones; emociones reales las muestras en questionnaire */}
              {cameraReady ? (
                <p style={{ margin: 0 }}>
                  ✅ Cámara funcionando. Cuando inicies el test comenzará el análisis de emociones y el envío de datos.
                </p>
              ) : (
                <p style={{ margin: 0 }}>
                  🔒 Para continuar, primero permite el acceso a la cámara en el navegador.
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="emotion-actions">
          <button
            className="btn-questionary"
            disabled={!canGoNext}
            onClick={() => setStep("instructions")}
            style={{
              opacity: canGoNext ? 1 : 0.5,
              cursor: canGoNext ? "pointer" : "not-allowed",
            }}
          >
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
                A continuación, encontrarás 10 preguntas sobre tus sentimientos y pensamientos durante el{" "}
                <strong>último mes</strong>.
              </p>

              <ul style={{ margin: "20px 0", paddingLeft: "20px" }}>
                <li style={{ marginBottom: "10px" }}>
                  <strong>Objetivo:</strong> Evaluar cuán impredecible, incontrolable y sobrecargada sientes tu vida actualmente.
                </li>
                <li style={{ marginBottom: "10px" }}>
                  <strong>Cómo responder:</strong> Marca la alternativa que mejor represente tu estimación general.
                </li>
              </ul>

              <div
                className="alert-info"
                style={{
                  backgroundColor: "#e3f2fd",
                  padding: "15px",
                  borderRadius: "8px",
                  marginTop: "20px",
                  borderLeft: "5px solid #2196f3",
                }}
              >
                ℹ️ <strong>Atención:</strong> Para garantizar una lectura emocional precisa, cada pregunta tendrá un{" "}
                <strong>temporizador de 25 segundos</strong> antes de poder avanzar.
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
            <h3>
              Pregunta {currentIndex + 1} de {QUESTIONS.length}
            </h3>

            <div className="pss-question-row">
              <p className="pss-question-text" style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "20px 0" }}>
                {currentQuestion.text}
              </p>

              <div className="pss-options" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {scaleOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className="pss-option"
                    style={{
                      padding: "10px",
                      border: "1px solid #ccc",
                      borderRadius: "8px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      backgroundColor: currentAnswer === opt.value ? "#e0f7fa" : "white",
                    }}
                  >
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
                <div
                  style={{
                    width: `${(seconds / QUESTION_TIME) * 100}%`,
                    height: "100%",
                    background: canContinue ? "#4caf50" : "#ff9800",
                    transition: "width 1s linear",
                  }}
                />
              </div>
            </div>

            {!hasAnswered && (
              <p style={{ color: "orange", fontSize: "0.9rem", marginTop: "10px" }}>⚠️ Selecciona una respuesta.</p>
            )}
            {hasAnswered && !timeCompleted && (
              <p style={{ color: "#2196f3", fontSize: "0.9rem", marginTop: "10px" }}>
                ⏳ Analizando emociones... espera el temporizador.
              </p>
            )}

            <div style={{ marginTop: "20px" }}>
              <button
                className="btn-finish"
                disabled={!canContinue || submitting}
                onClick={handleNextOrFinish}
                style={{
                  opacity: canContinue ? 1 : 0.5,
                  cursor: canContinue ? "pointer" : "not-allowed",
                  width: "100%",
                }}
              >
                {submitting ? "Enviando..." : isLastQuestion ? "Finalizar Cuestionario" : "Siguiente Pregunta"}
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
