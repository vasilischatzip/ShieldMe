import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "node:path";

export default defineConfig({
  base: process.env.SHIELDME_BASE_PATH ?? "/",
  plugins: [preact()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("pdfjs-dist")) return "parser-pdf";
          if (id.includes("mammoth")) return "parser-docx";
          if (id.includes("xlsx") || id.includes("sheetjs")) return "parser-xlsx";
          if (id.includes("tesseract")) return "parser-ocr";
          if (id.includes("jspdf")) return "export-pdf";
        },
      },
    },
  },
  resolve: {
    alias: {
      "~": path.resolve("src"),
      html2canvas: path.resolve("src/stubs/html2canvas.js"),
    },
  },
});
