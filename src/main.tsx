import { createRoot } from "react-dom/client";
import { App } from "./app/routes";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root");

createRoot(root).render(<App />);
