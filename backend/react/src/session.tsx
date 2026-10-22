import { createRoot } from "react-dom/client";
import { installSessionRedirect } from "./api";
import { SessionGuard } from "./SessionGuard";
installSessionRedirect(window, (url) => location.assign(url));
const root = document.getElementById("session-root");
if (root) createRoot(root).render(<SessionGuard />);
