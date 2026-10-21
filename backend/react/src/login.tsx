import { createRoot } from "react-dom/client";
import { Security } from "./MFA";
import { Recovery } from "./Recovery";
import { Login } from "./Auth";
import "./auth.css";
createRoot(document.getElementById("auth-root")!).render(
  location.pathname === "/security" ? (
    <Security />
  ) : location.pathname === "/forgot-password" ? (
    <Recovery />
  ) : location.pathname === "/reset-password" ? (
    <Recovery reset />
  ) : (
    <Login />
  ),
);
