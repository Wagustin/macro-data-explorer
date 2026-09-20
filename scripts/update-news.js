import { refreshNewsCache, fetchMacroNews, FALLBACK_NEWS, FEEDS } from "../api/news.js";
import { fileURLToPath } from "url";

export { refreshNewsCache, fetchMacroNews, FALLBACK_NEWS, FEEDS };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  refreshNewsCache().catch((err) => {
    console.error("Error al actualizar la caché de noticias:", err);
    process.exit(1);
  });
}
