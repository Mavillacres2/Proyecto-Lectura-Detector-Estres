// src/components/EmotionDetector.tsx
import React, { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { sendEmotionHTTP } from "../services/emotionService";
//import { sendWS } from "../services/wsService";
import { submitPSS } from "../services/pssService";
import { useNavigate } from "react-router-dom";
import "../styles/EmotionDetector.css";

const MODEL_URL = "/models";
const QUESTION_TIME = 20; // ⏱️ Tiempo mínimo por pregunta en segundos

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

// 🔁 CAMBIO 1: constantes de rendimiento para el loop optimizado
const DETECTION_INTERVAL_MS = 120; // máx ~8 detecciones por segundo
const TINY_INPUT_SIZE = 160;       // resolución interna pequeña para TinyFaceDetector

export const EmotionDetector: React.FC = () => {
  // Refs para video y detección
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectionIntervalRef = useRef<number | null>(null); // usamos como FLAG de "loop activo"

  // Ref para controlar cuándo guardar datos
  const isRecordingRef = useRef(false);

  // Estados de IA y Cámara
  const [loaded, setLoaded] = useState(false);
  const [smoothBuffer, setSmoothBuffer] = useState<any[]>([]);
  const [smoothedEmotion, setSmoothedEmotion] = useState<any>(null);
  const [fps, setFps] = useState(0);          // 🔁 CAMBIO 2: solo un estado de FPS (sin buffer)
  const [resolution, setResolution] = useState({ width: 0, height: 0 });

  // 🛡️ NUEVOS ESTADOS PARA CONTROL DE CÁMARA
  const [cameraReady, setCameraReady] = useState(false); // ¿Tenemos video?
  const [cameraError, setCameraError] = useState<string | null>(null); // ¿Permiso denegado?
  const [faceDetected, setFaceDetected] = useState(false); // ¿La IA ve una cara?


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

  // Sincronizar el ref de grabación con el paso actual
  useEffect(() => {
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
        // 🔁 CAMBIO 3: usamos TinyFaceDetector + expresiones (sin SSD MobileNet pesado)
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL),
        // (podrías añadir landmarks si los necesitaras, pero los quitamos para ahorrar CPU)
      ]);
      setLoaded(true);
      console.log("✅ Modelos cargados (Tiny Version)");
    } catch (err) {
      console.error("Error cargando modelos:", err);
    }
  };

  /** 2. Iniciar cámara (baja resolución para rendimiento) */
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 320 },        // 🔁 CAMBIO 4: menor resolución
          height: { ideal: 240 },
          facingMode: "user",
          frameRate: { ideal: 15, max: 20 }, // limitamos FPS de la cámara
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
          .then(() => {
            console.log("▶️ Video reproduciéndose");
            setCameraReady(true); // ✅ ¡CÁMARA LISTA!
          })
          .catch((e) => console.error("Error al reproducir video:", e));
      };
    } catch (err: any) {
      console.error("Error iniciando cámara:", err);
      setCameraReady(false);

      // Detectar si fue permiso denegado
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setCameraError("🔒 Acceso a la cámara denegado. Por favor, permite el acceso en tu navegador para continuar.");
      } else {
        setCameraError("❌ No se pudo acceder a la cámara. Verifica que esté conectada.");
      }
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

  /** 🔁 CAMBIO 5: suavizado de emociones con buffer pequeño (menos lag) */
  const computeSmoothEmotion = (expressions: any) => {
    setSmoothBuffer((prev) => {
      const updated = [...prev, expressions];
      if (updated.length > 3) updated.shift(); // antes 5
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

  /** 🔁 CAMBIO 6: Loop de detección OPTIMIZADO (sin setInterval ni landmarks) */
  const runDetectionLoop = () => {
    // Marcamos como activo (flag)
    detectionIntervalRef.current = 1;

    let lastDetection = 0;
    let lastSend = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const detect = async () => {
      // Si desmontaron el componente o apagamos el loop, salimos
      if (!videoRef.current || !canvasRef.current || !loaded || !detectionIntervalRef.current) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!canvas || !video) {
        requestAnimationFrame(detect);
        return;
      }

      // ⚠️ SOLO procesamos detección durante el cuestionario
      if (step !== "questionnaire") {
        requestAnimationFrame(detect);
        return;
      }

      // Asegurarse de que el video tenga datos
      if (video.readyState < 2 || video.videoWidth === 0) {
        requestAnimationFrame(detect);
        return;
      }

      const now = performance.now();

      // Limitamos la frecuencia de detección
      if (now - lastDetection < DETECTION_INTERVAL_MS) {
        requestAnimationFrame(detect);
        return;
      }
      lastDetection = now;

      // FPS basado en detecciones
      frameCount++;
      if (now - lastFpsTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)));
        frameCount = 0;
        lastFpsTime = now;
      }

      // Ajustar canvas al tamaño del video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        requestAnimationFrame(detect);
        return;
      }

      // Dibujar frame de la cámara en el canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // TinyFaceDetector ligero
      const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: TINY_INPUT_SIZE,
        scoreThreshold: 0.5,
      });

      try {
        const detection = await faceapi
          .detectSingleFace(canvas, options) // usamos el frame del canvas
          .withFaceExpressions();

        if (detection) {
          const box = detection.detection.box;

          // Dibujamos solo la caja (sin landmarks)
          const drawBox = new faceapi.draw.DrawBox(box, {
            label: detection.detection.score.toFixed(2),
          });
          drawBox.draw(canvas);

          const expressions = detection.expressions;
          computeSmoothEmotion(expressions);

          // 1. Esto se ejecuta MUY RÁPIDO (100ms) para que el cuadro azul se mueva bien
          const resized = faceapi.resizeResults(detection, { width: canvas.width, height: canvas.height });
          faceapi.draw.drawDetections(canvas, resized);

          setFaceDetected(true);

          // Enviar al backend como máximo cada 300ms
          // Esto asegura que solo envíes 1 dato por segundo, protegiendo tu servidor.
          // ... dentro de la función detect ...

          // Esto hace el JSON mucho más ligero para la red
          const cleanExpressions = {
            neutral: Number(expressions.neutral.toFixed(4)),
            happy: Number(expressions.happy.toFixed(4)),
            sad: Number(expressions.sad.toFixed(4)),
            angry: Number(expressions.angry.toFixed(4)),
            fearful: Number(expressions.fearful.toFixed(4)),
            disgusted: Number(expressions.disgusted.toFixed(4)),
            surprised: Number(expressions.surprised.toFixed(4))
          };

          // 🏆 LO MEJOR: 1000ms (1 segundo)
          // Esto equilibra tener buenos datos sin tumbar el servidor.
          if (isRecordingRef.current && now - lastSend > 1000) {
            const payload = {
              user_id: Number(userId) || 0,
              session_id: sessionId,
              emotions: cleanExpressions,
              timestamp: Date.now() / 1000,
            };

            // ✅ Enviamos SOLO por HTTP (Más seguro y estable)
            sendEmotionHTTP(payload).catch(() => { });

            // ❌ WebSockets DESACTIVADOS (Ahorra mucha CPU en el servidor)
            // sendWS(payload); 

            lastSend = now;
          }
        } else {
          // 🆕 CAMBIO 3: Avisamos que no hay rostro
          setFaceDetected(false);
          setSmoothedEmotion(null);
        }
      } catch (e) {
        console.error("Error en loop de detección:", e);
      }

      requestAnimationFrame(detect);
    };

    detect();
  };

  // Carga inicial de modelos
  useEffect(() => {
    loadModels();
  }, []);


  /** 🔁 CAMBIO 7: iniciamos cámara siempre, pero detección SOLO en questionnaire */
  useEffect(() => {
    if (!loaded) return;

    // siempre tenemos preview de cámara
    startCamera();

    // pero solo arrancamos el loop pesado cuando estamos en el cuestionario
    if (step === "questionnaire") {
      runDetectionLoop();
    }

    // Cleanup
    return () => {
      // apagar el loop
      detectionIntervalRef.current = null;

      // apagar cámara
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
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

    // 1. Si no es la última pregunta, solo avanzamos (Rápido)
    if (!isLastQuestion) {
      setCurrentIndex((prev) => prev + 1);
      return;
    }

    // 2. Validación de seguridad
    if (!userId) {
      alert("No se encontró el usuario. Inicia sesión nuevamente.");
      return;
    }

    // 🔥 CAMBIO CRÍTICO 1: Bloqueo Inmediato
    // Detenemos la grabación YA, para que no compita por internet.
    isRecordingRef.current = false;
    setSubmitting(true); // Deshabilitamos el botón visualmente

    // 🔥 CAMBIO CRÍTICO 2: "Cool-down" (Enfriamiento)
    // Esperamos 500ms (medio segundo) en silencio. 
    // Esto permite que cualquier petición de emoción "basura" que estaba saliendo 
    // termine de enviarse o cancelarse antes de mandar el resultado importante.
    await new Promise(resolve => setTimeout(resolve, 500));

    const pss_score = calculatePSSScore();

    try {
      // 3. Envío Seguro
      const res = await submitPSS({
        user_id: userId,
        session_id: sessionId,
        pss_score,
      });

      setResultsData(res.data);
      setStep("completed"); // ¡Éxito! Cambiamos de pantalla
    } catch (err) {
      console.error(err);
      // Si falla, permitimos intentar de nuevo
      setSubmitting(false);
      alert("La red está congestionada. Por favor, presiona 'Finalizar' nuevamente.");
    }
    // Nota: Quité el 'finally' para no reactivar el botón si ya pasamos a "completed"
  };


  const handleViewResults = () => {
    if (!resultsData) return;
    navigate("/results", { state: resultsData });
  };

  // Componente visual reutilizable para la cámara
  const renderCameraPanel = () => (
    <div className="video-card">
      <div className="video-wrapper">
        {/* Si hay error, mostramos una capa negra con el mensaje encima del video */}
        {cameraError && (
          <div style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', display: 'flex',
            flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
            zIndex: 10, padding: '20px', textAlign: 'center'
          }}>
            <span style={{ fontSize: '2rem' }}>🚫</span>
            <p>{cameraError}</p>
          </div>
        )}
        <video ref={videoRef} className="emotion-video" muted playsInline />
        <canvas ref={canvasRef} className="emotion-canvas" />
        {!loaded && <div className="video-placeholder">Cargando modelos...</div>}
      </div>

      <div className="camera-stats">
        <span>FPS: {fps}</span>
        <span>
          Res: {resolution.width} x {resolution.height}
        </span>
        {step === "questionnaire" && (
          <span style={{ color: "red", fontWeight: "bold" }}>🔴 REC</span>
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
            <h3>Estado del Sistema</h3>
            
            {/* 🆕 CAMBIO 6: Feedback visual intuitivo para el usuario */}
            <div className="emotion-json" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                {!loaded ? (
                     <p>⏳ Cargando modelos de IA...</p>
                ) : cameraError ? (
                     <p style={{color: '#ff4d4d', fontWeight: 'bold'}}>❌ Error de Cámara</p>
                ) : !cameraReady ? (
                     <p>📷 Iniciando cámara...</p>
                ) : faceDetected ? (
                    <>
                        {/* Si todo está bien y detecta cara, sale verde */}
                        <p style={{color: '#4caf50', fontWeight: 'bold', fontSize: '1.1rem'}}>✅ Rostro Detectado</p>
                        <p style={{fontSize: '0.9rem'}}>El sistema funciona correctamente.</p>
                    </>
                ) : (
                    <>
                         {/* Si la cámara prende pero no ve cara, sale naranja */}
                        <p style={{color: '#ff9800', fontWeight: 'bold'}}>⚠️ Cámara activa, pero no veo tu rostro</p>
                        <p style={{fontSize: '0.9rem'}}>Colócate frente a la cámara.</p>
                    </>
                )}
            </div>
          </div>
        </section>


        {/*}<section className="emotion-main">
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
        </section>{ 
        
         <div className="emotion-actions">
          <button
            className="btn-questionary"
            onClick={() => setStep("instructions")}
          >
            Continuar a Instrucciones
          </button>
        </div>
      </div>
        */}



       


          <div className="emotion-actions" style={{display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center'}}>
          
          {/* 🆕 CAMBIO 7: Mensaje de ayuda si hay error de permisos */}
          {cameraError && (
              <div style={{backgroundColor: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '5px'}}>
                  ⚠️ <strong>Atención:</strong> Debes dar permisos a la cámara en el navegador.
              </div>
          )}

          {/* 🆕 CAMBIO 8: BLOQUEO DEL BOTÓN.
              La propiedad `disabled` ahora depende de que:
              1. La cámara esté lista (cameraReady)
              2. Los modelos cargados (loaded)
              3. No haya errores (cameraError)
          */}
          <button
            className="btn-questionary"
            onClick={() => setStep("instructions")}
            disabled={!cameraReady || !loaded || !!cameraError} 
            style={{ 
                // Estilo visual para que parezca deshabilitado
                opacity: (!cameraReady || !loaded || !!cameraError) ? 0.5 : 1,
                cursor: (!cameraReady || !loaded || !!cameraError) ? 'not-allowed' : 'pointer',
                backgroundColor: cameraError ? '#666' : undefined
            }}
          >
            {/* Texto dinámico del botón según el estado */}
            {cameraError ? "Habilita la cámara para continuar" : 
             !loaded ? "Cargando IA..." : 
             !cameraReady ? "Esperando cámara..." : 
             "Continuar a Instrucciones"}
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

          <div
            style={{
              fontSize: "1rem",
              lineHeight: "1.6",
              color: "#444",
              textAlign: "left",
            }}
          >
            <p>
              A continuación, encontrarás 10 preguntas sobre tus sentimientos y
              pensamientos durante el <strong>último mes</strong>.
            </p>

            <ul style={{ margin: "20px 0", paddingLeft: "20px" }}>
              <li style={{ marginBottom: "10px" }}>
                <strong>Objetivo:</strong> Evaluar cuán impredecible,
                incontrolable y sobrecargada sientes tu vida actualmente.
              </li>
              <li style={{ marginBottom: "10px" }}>
                <strong>Cómo responder:</strong> No intentes contar el número
                exacto de veces que te has sentido de una manera particular.
                Marca la alternativa que mejor represente tu estimación
                general.
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
              ℹ️ <strong>Atención:</strong> Para garantizar una lectura
              emocional precisa, cada pregunta tendrá un{" "}
              <strong>temporizador de 25 segundos</strong> antes de poder
              avanzar a la siguiente.
              <br />
              <strong>
                Tus datos faciales comenzarán a grabarse al iniciar el test.
              </strong>
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
            <p
              className="pss-question-text"
              style={{
                fontSize: "1.2rem",
                fontWeight: "bold",
                margin: "20px 0",
              }}
            >
              {currentQuestion.text}
            </p>

            <div
              className="pss-options"
              style={{ display: "flex", flexDirection: "column", gap: "10px" }}
            >
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
                    backgroundColor:
                      currentAnswer === opt.value ? "#e0f7fa" : "white",
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
            <p>
              Siguiente habilitado en: {Math.max(0, QUESTION_TIME - seconds)}s
            </p>
            <div
              style={{
                width: "100%",
                height: "10px",
                background: "#eee",
                borderRadius: "5px",
                overflow: "hidden",
              }}
            >
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
            <p
              style={{
                color: "orange",
                fontSize: "0.9rem",
                marginTop: "10px",
              }}
            >
              ⚠️ Selecciona una respuesta.
            </p>
          )}
          {hasAnswered && !timeCompleted && (
            <p
              style={{
                color: "#2196f3",
                fontSize: "0.9rem",
                marginTop: "10px",
              }}
            >
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
              {submitting
                ? "Enviando..."
                : isLastQuestion
                  ? "Finalizar Cuestionario"
                  : "Siguiente Pregunta"}
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
      <p>
        Gracias por completar la evaluación. Tus respuestas han sido
        registradas y procesadas.
      </p>
      <button className="btn-view-results" onClick={handleViewResults}>
        Ver Resultados
      </button>
    </div>
  </div>
);
};
