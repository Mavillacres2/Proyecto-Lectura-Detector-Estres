import { Link, useNavigate } from "react-router-dom";
import "../styles/Home.css";

const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="home-container">

      {/* Barra superior */}
      <header className="navbar">
        <div className="logo">StressRadar</div>

        <nav className="nav-links">
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
        </nav>
      </header>

      {/* Contenido principal */}
      <div className="content">
        <h2>¡Bienvenido al sistema de detección de estrés!</h2>
        <h1>DETECTA TU NIVEL DE ESTRÉS</h1>

        <button className="btn-start" onClick={() => navigate("/login")}>
          Iniciar
        </button>
      </div>

    </div>
  );
};

export default Home;
