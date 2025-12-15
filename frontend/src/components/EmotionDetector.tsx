// src/components/EmotionDetector.tsx
import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { sendEmotionHTTP } from "../services/emotionService";
import { submitPSS } from "../services/pssService";
import { useNavigate } from "react-router-dom";
import "../styles/EmotionDetector.css";

const MODEL_URL = "/models";
const QUESTION_TIME = 20;

type Step = "intro" | "instructions" | "questionnaire" | "completed";

type CameraStatus = "idle" | "requesting" | "ready" | "denied" | "error";

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

const isNotAllowed = (err: any) =>
  err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";

export const EmotionDetector: React.FC = () => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null);
  const isRecordingRef = useRef(false);

  // ✅ CLAVE: stream persiste aunque React recree el <video>
  const streamRef = useRef<MediaStream | null>(null);

  // Estados
  const [loaded, setLoaded] = useState(false);
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

  // 🔧 FIX: ref para evitar closure bug con `step`
  const stepRef = useRef<Step>("intro");

  // Cámara
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraMessage, setCameraMessage] = useState<string>(
    "Para continuar, debes permitir el acceso a la cámara."
  );

  const navigate = useNavigate();

  // ======== Helpers cámara ========
  const isStreamLive = (video: HTMLVideoElement | null) => {
    const stream = (video?.srcObject as MediaStream | null) ?? streamRef.current;
    if (!stream) return false;
    const tracks = stream.getVideoTracks();
    return tracks.length > 0 && tracks.some((t) => t.readyState === "live" && t.enabled);
  };

  const attachStreamToVideo = async () => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    // re-engancha el stream si el <video> fue recreado
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    try {
      await video.play();
    } catch (e) {
      // Con muted normalmente se puede; si falla, no es fatal.
      console.warn("No se pudo hacer play() automáticamente:", e);
    }

    // actualizar resolución si ya hay datos
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setResolution({ width: video.videoWidth, height: video.videoHeight });
    }

    const ok = video.readyState >= 2 && video.videoWidth > 0 && isStreamLive(video);
    setCameraReady(ok);

    if (ok) {
      setCameraStatus("ready");
      setCameraMessage("✅ Cámara funcionando correctamente. Ya puedes continuar.");
    }
  };

  // ======== Usuario ========
  useEffect(() => {
    const stored = localStorage.getItem("user_id");
    if (stored) setUserId(Number(stored));
  }, []);

  // ======== Grabación activa solo en questionnaire ========
  useEffect(() => {
    isRecordingRef.current = step === "questionnaire";
  }, [step]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);


  // ======== Modelos ========
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

  // ======== Cámara ========
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

      // Si ya existe stream, solo re-engancharlo
      if (streamRef.current) {
        await attachStreamToVideo();
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

      streamRef.current = stream;

      // enganchar al video actual
      await attachStreamToVideo();

      // por si metadata llega después
      const video = videoRef.current;
      if (video) {
        video.onloadedmetadata = async () => {
          setResolution({ width: video.videoWidth, height: video.videoHeight });
          await attachStreamToVideo();
        };
      }
    } catch (err: any) {
      console.error("Error iniciando cámara:", err);

      if (isNotAllowed(err)) {
        setCameraStatus("denied");
        setCameraReady(false);
        setCameraMessage(
          "🚫 Permiso de cámara denegado. Actívalo en el navegador (candado/ícono de cámara en la barra de direcciones) y luego presiona “Reintentar”."
        );
      } else {
        setCameraStatus("error");
        setCameraReady(false);
        setCameraMessage(
          "⚠️ No se pudo acceder a la cámara. Cierra apps que la usen (Zoom/Meet) y reintenta."
        );
      }
    }
  };

  // ✅ Cada cambio de step puede recrear el <video>, por eso re-attach
  useEffect(() => {
    if (streamRef.current) {
      attachStreamToVideo();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // ======== Timer ========
  useEffect(() => {
    if (step !== "questionnaire") return;

    setSeconds(0);
    const intervalId = window.setInterval(() => {
      setSeconds((prev) => (prev >= QUESTION_TIME ? prev : prev + 1));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [currentIndex, step]);

  // ======== Loop detección ========
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

      // ✅ FIX: usar stepRef para leer el step actual
      if (stepRef.current !== "questionnaire") {
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

      // FPS
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }

      // Canvas tamaño video
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

      try {
        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: TINY_INPUT_SIZE,
          scoreThreshold: 0.5,
        });

        const detection = await faceapi
          .detectSingleFace(canvas, options)
          .withFaceExpressions();

        if (detection) {
          const resized = faceapi.resizeResults(detection, {
            width: canvas.width,
            height: canvas.height,
          });
          faceapi.draw.drawDetections(canvas, resized);

          const expressions = detection.expressions;

          const cleanExpressions = {
            neutral: Number(expressions.neutral.toFixed(4)),
            happy: Number(expressions.happy.toFixed(4)),
            sad: Number(expressions.sad.toFixed(4)),
            angry: Number(expressions.angry.toFixed(4)),
            fearful: Number(expressions.fearful.toFixed(4)),
            disgusted: Number(expressions.disgusted.toFixed(4)),
            surprised: Number(expressions.surprised.toFixed(4)),
          };

          // Enviar 1 vez/seg mientras grabas
          if (isRecordingRef.current && now - lastSend > 1000) {
            const payload = {
              user_id: Number(userId) || 0,
              session_id: sessionId,
              emotions: cleanExpressions,
              timestamp: Date.now() / 1000,
            };
            sendEmotionHTTP(payload).catch(() => { });
            lastSend = now;
          }
        }
      } catch (e) {
        console.error("Error en detección:", e);
      }

      requestAnimationFrame(detect);
    };

    detect();
  };


  // ======== Init ========
  useEffect(() => {
    loadModels();
  }, []);

  // ✅ Iniciar cámara una sola vez cuando modelos estén listos
  useEffect(() => {
    if (!loaded) return;

    startCamera();
    runDetectionLoop(); // corre siempre, pero “trabaja” solo en questionnaire por el bloqueo

    return () => {
      detectionIntervalRef.current = null;

      // apagar cámara SOLO al desmontar componente
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // ======== Cuestionario ========
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

  // ======== UI ========
  const renderCameraPanel = () => (
    <div className="video-card">
      <div className="video-wrapper">
        <video ref={videoRef} className="emotion-video" muted playsInline autoPlay />
        <canvas ref={canvasRef} className="emotion-canvas" />
        {!loaded && <div className="video-placeholder">Cargando modelos...</div>}

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

  // ======== RENDER POR PASOS ========

  // 1) INTRO
  if (step === "intro") {
    const canGoNext = loaded && cameraReady && cameraStatus === "ready";

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
            Este sistema te permite evaluar tu nivel de estrés mediante un breve cuestionario (PSS-10) y el análisis de tu
            cámara. Para continuar, primero debes permitir el acceso a la cámara.
          </p>

          <div className="emotion-features">
            <div className="feature-card">
              <div className="feature-icon">😊</div>
              <h3>Análisis de emociones</h3>
              <p>Durante el test se analizan expresiones faciales para estimar estados emocionales.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📋</div>
              <h3>Cuestionario sobre estrés</h3>
              <p>Responde 10 preguntas sobre el último mes (PSS-10).</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Resultados del estudiante</h3>
              <p>Obtén el resultado final y el historial de mediciones.</p>
            </div>
          </div>
        </section>

        <section className="emotion-main">
          {renderCameraPanel()}

          <div className="emotion-panel">
            <h3>Emociones detectadas (Prueba)</h3>

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
              {cameraReady ? (
                <p style={{ margin: 0 }}>
                  ✅ Cámara funcionando. Al iniciar el test comenzará el análisis de emociones y el registro.
                </p>
              ) : (
                <p style={{ margin: 0 }}>🔒 Permite el acceso a la cámara para poder continuar.</p>
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

  // 2) INSTRUCCIONES
  if (step === "instructions") {
    return (
      <div className="questionnaire-page">
        <header className="questionnaire-header">
          <h1>Instrucciones del Test</h1>
        </header>

        <div className="questionnaire-grid">
          <section className="card card-pss">
            <h3>Sobre la Escala de Estrés Percibido (PSS-10)</h3>

            <div style={{ fontSize: "1rem", lineHeight: "1.7", color: "#444", textAlign: "left" }}>
              <p>
                A continuación encontrarás <strong>10 preguntas</strong> relacionadas con tus sentimientos y pensamientos
                durante el <strong>último mes</strong>.
              </p>

              <ul style={{ margin: "20px 0", paddingLeft: "20px" }}>
                <li style={{ marginBottom: "10px" }}>
                  <strong>Objetivo:</strong> Evaluar el nivel de estrés percibido, considerando cuán impredecible,
                  incontrolable o sobrecargada ha sido tu vida.
                </li>
                <li style={{ marginBottom: "10px" }}>
                  <strong>Cómo responder:</strong> Selecciona la opción que mejor represente tu experiencia general,
                  no existe una respuesta correcta o incorrecta.
                </li>
              </ul>

              {/* 🔹 NUEVO BLOQUE WOW */}
              <div
                className="alert-info"
                style={{
                  backgroundColor: "#f3f8ff",
                  padding: "16px",
                  borderRadius: "10px",
                  marginTop: "25px",
                  borderLeft: "5px solid #3f51b5",
                }}
              >
                👁️ <strong>Recomendaciones para una detección óptima:</strong>
                <ul style={{ marginTop: "10px", paddingLeft: "20px" }}>
                  <li>✔️ Mantén una <strong>mirada fija hacia la pantalla</strong> durante el test.</li>
                  <li>✔️ Procura una <strong>buena iluminación frontal</strong> (evita contraluz o sombras).</li>
                  <li>✔️ Mantén tu rostro <strong>completamente visible</strong> y centrado en la cámara.</li>
                  <li>✔️ Evita cubrir tu rostro con manos, gafas oscuras o accesorios.</li>
                  <li>✔️ Permanece en una <strong>posición estable</strong>, evitando movimientos bruscos.</li>
                </ul>

                <p style={{ marginTop: "10px", fontSize: "0.95rem" }}>
                  Estas recomendaciones permiten mejorar la precisión del sistema de
                  <strong> detección de emociones en tiempo real</strong>.
                </p>
              </div>

              {/* 🔹 BLOQUE DE ATENCIÓN */}
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
                ⏱️ <strong>Atención:</strong> Cada pregunta contará con un
                <strong> temporizador mínimo de 20 segundos</strong> antes de poder avanzar.
                <br />
                🎥 <strong>La captura de datos faciales comenzará automáticamente al iniciar el test.</strong>
              </div>
            </div>

            <div style={{ marginTop: "30px" }}>
              <button
                className="btn-finish"
                onClick={() => setStep("questionnaire")}
                style={{ width: "100%" }}
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


  // 3) CUESTIONARIO
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

            <p style={{ fontSize: "1.2rem", fontWeight: "bold", margin: "20px 0" }}>{currentQuestion.text}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {scaleOptions.map((opt) => (
                <label
                  key={opt.value}
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

            {!hasAnswered && <p style={{ color: "orange", fontSize: "0.9rem", marginTop: "10px" }}>⚠️ Selecciona una respuesta.</p>}
            {hasAnswered && !timeCompleted && (
              <p style={{ color: "#2196f3", fontSize: "0.9rem", marginTop: "10px" }}>⏳ Analizando emociones... espera el temporizador.</p>
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

  // 4) COMPLETADO
  return (
    <div className="completedWrap">
      <div className="completedCard">
        <div className="completedIcon" aria-hidden="true">✅</div>

        <h2 className="completedTitle">¡Cuestionario completado!</h2>
        <p className="completedText">
          Gracias por completar la evaluación. Tus respuestas han sido registradas y procesadas.
        </p>

        <div className="completedActions">
          <button className="completedBtn" onClick={handleViewResults}>
            Ver Resultados
          </button>
        </div>

        <p className="completedHint">
          Tip: si la cámara estaba oscura o con poca luz, los resultados pueden tener menor precisión.
        </p>
      </div>
    </div>
  );

};
