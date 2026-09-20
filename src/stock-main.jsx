// Entrée du site AUTONOME Planet'Stock (voir vite.stock.config.ts).
// Le module tourne seul : son propre écran de connexion, sa propre
// navigation et sa propre base (projet Supabase « Stockage »). Aucune
// prop `session` n'est passée — c'est elle qui déclenche le mode
// intégré à Planet'Desk.
import React from "react";
import { createRoot } from "react-dom/client";
import StockApp from "./stock/StockApp.jsx";

createRoot(document.getElementById("root")).render(<StockApp />);
