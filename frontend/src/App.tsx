import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "././pages/Home";
import Login from "././pages/auth/Login";
import Register from "././pages/auth/Register";
import { EmotionDetector } from "./components/EmotionDetector";
import ResultsPage from "./pages/ResultsPage";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { PublicRoute } from "./routes/PublicRoute";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Página inicial */}
        <Route path="/" element={<Home />} />

        {/* Rutas públicas: si ya estás logueado, te manda a /detector */}
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        {/* Rutas protegidas: requiere user_id (o token) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/detector" element={<EmotionDetector />} />
          <Route path="/results" element={<ResultsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
