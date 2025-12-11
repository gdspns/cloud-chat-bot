import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// 处理404.html的SPA重定向
const redirectPath = sessionStorage.getItem('redirect_path');
if (redirectPath) {
  sessionStorage.removeItem('redirect_path');
  window.history.replaceState(null, '', redirectPath);
}

createRoot(document.getElementById("root")!).render(<App />);
