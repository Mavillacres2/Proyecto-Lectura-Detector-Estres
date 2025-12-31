import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "././pages/Home";
import Login from "././pages/auth/Login";
import Register from "././pages/auth/Register";
import { EmotionDetector } from "./components/EmotionDetector";
import ResultsPage from "./pages/ResultsPage";
import { AdminDashboard } from "././pages/admin/AdminDashboard";


function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Página inicial */}
        <Route path="/" element={<Home />} />

        {/* Login y Register */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Detector SOLO después de login */}
        <Route path="/detector" element={<EmotionDetector />} />

        <Route path="/results" element={<ResultsPage />} />
        // ...
        <Route path="/admin" element={<AdminDashboard />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
