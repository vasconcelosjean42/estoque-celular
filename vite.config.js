import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" para o build funcionar via file:// dentro do Electron
export default defineConfig({ base: "./", plugins: [react()] });
