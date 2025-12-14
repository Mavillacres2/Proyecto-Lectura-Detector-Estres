import { useEffect, useRef } from "react";

export function Camera() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 320 },
            height: { ideal: 240 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error) {
        console.error("Error al activar la cámara:", error);
      }
    }

    startCamera();
  }, []);

  return (
    <div style={{ textAlign: "center" }}>
      <h2>Cámara en tiempo real</h2>
      <video
        ref={videoRef}
        width={450}
        height={330}
        style={{
          border: "3px solid #00aaff",
          borderRadius: "10px",
          backgroundColor: "#000",
        }}
      />
    </div>
  );
}
