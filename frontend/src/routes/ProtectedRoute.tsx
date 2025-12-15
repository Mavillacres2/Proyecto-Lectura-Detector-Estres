import React from "react";
import { Navigate, Outlet } from "react-router-dom";

type Props = {
  redirectTo?: string;
};

export const ProtectedRoute: React.FC<Props> = ({ redirectTo = "/login" }) => {
  const userId = localStorage.getItem("user_id");
  const token = localStorage.getItem("token");

  const isAuthed = Boolean(userId && token);

  if (!isAuthed) return <Navigate to={redirectTo} replace />;

  return <Outlet />;
};
