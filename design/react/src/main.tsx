import { createRoot } from "react-dom/client";
import { App, store } from "./App";
import "./style.css";
createRoot(document.getElementById("app")!).render(<App />);
void store.load();
