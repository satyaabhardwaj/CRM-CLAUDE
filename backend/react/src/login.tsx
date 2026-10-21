import { createRoot } from "react-dom/client";
import { Login } from "./Auth";
import "./auth.css";
createRoot(document.getElementById("auth-root")!).render(<Login />);
