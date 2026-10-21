import { createRoot } from "react-dom/client";
import { App, store } from "./App";
import { startAutoSign } from "./autoSign";
// Pure PDF services: these do not render or own application UI.
import "../../ocf/terms.js";
import "../../ocf/ocf.js";
import "./style.css";
createRoot(document.getElementById("app")!).render(<App />);
void store.load().then(() => {
  if (store.state.ready && store.state.writable) void startAutoSign(store);
});
