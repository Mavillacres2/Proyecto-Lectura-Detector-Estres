import React from "react";
import { Navigate, Outlet } from "react-router-dom";

type Props = {
  redirectTo?: string;
};

export const PublicRoute: React.FC<Props> = ({ redirectTo = "/detector" }) => {
  const userId = localStorage.getItem("user_id");
  const isAuthed = Boolean(userId);

  if (isAuthed) return <Navigate to={redirectTo} replace />;

  return <Outlet />;
};
