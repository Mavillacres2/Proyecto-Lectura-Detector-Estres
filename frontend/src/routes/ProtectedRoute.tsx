import React from "react";
import { Navigate, Outlet } from "react-router-dom";

type Props = {
  redirectTo?: string;
};

export const ProtectedRoute: React.FC<Props> = ({ redirectTo = "/login" }) => {
  // Ajusta el key si usas otro
  const userId = localStorage.getItem("user_id");
  const token = localStorage.getItem("token"); // opcional

  // Si tu login guarda solo user_id, deja solo userId
  const isAuthed = Boolean(userId); // o Boolean(userId && token)

  if (!isAuthed) return <Navigate to={redirectTo} replace />;

  return <Outlet />;
};
