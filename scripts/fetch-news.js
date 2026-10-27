/**
 * scripts/fetch-news.js
 * 
 * Pipeline propio de ingesta de noticias financieras y macroeconómicas para PerData.
 * Basado en las fuentes autorizadas (INFORME.md y fuentes.json).
 * 
 * Cumplimiento normativo estricto:
 * - Fuentes VERDE (Oficiales): Datos abiertos del Estado (Andina, MEF, INEI, BCRP).
 * - Fuentes AMARILLO (Medios privados): Solo titular fáctico + enlace canónico + fecha (NUNCA texto ni resumen).
 * - User-Agent transparente: PerDataBot/1.0 (+https://perdata.site)
 * - Cadencia respetuosa: Peticiones secuenciales espaciadas por 2 segundos.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "noticias.json");

const USER_AGENT = "PerDataBot/1.0 (+https://perdata.site)";
const REQUEST_DELAY_MS = 2000;
const MAX_OUTPUT_ITEMS = 120;
const FETCH_TIMEOUT_MS = 12000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return "";
      }
    });
}

function cleanText(raw) {
  if (!raw) return "";
  let text = String(raw);
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  return text.replace(/\s+/g, " ").trim();
}

function normalizeTitle(raw) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SPANISH_MONTHS = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  setiembre: 8,
  septiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11
};

function parseDateIso(raw) {
  if (!raw) return new Date().toISOString();
  const trimmed = String(raw).trim();

  // Try native date parsing (ISO or RFC 2822)
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }

  // Parse Gob.pe format: "23 de octubre de 2026 -  5:09 p. m." or "23 de octubre de 2026"
  const gobMatch = trimmed.match(
    /(\d{1,2})\s+de\s+([a-zA-Záéíóúñ]+)\s+de\s+(\d{4})(?:\s*-\s*(\d{1,2}):(\d{2})\s*(a\.\s*m\.|p\.\s*m\.|am|pm)?)?/i
  );
  if (gobMatch) {
    const day = parseInt(gobMatch[1], 10);
    const monthName = gobMatch[2].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const year = parseInt(gobMatch[3], 10);
    const month = SPANISH_MONTHS[monthName] ?? 0;

    let hour = gobMatch[4] ? parseInt(gobMatch[4], 10) : 12;
    const min = gobMatch[5] ? parseInt(gobMatch[5], 10) : 0;
    const meridiem = gobMatch[6] ? gobMatch[6].toLowerCase() : "";

    if (meridiem.includes("p") && hour < 12) hour += 12;
    if (meridiem.includes("a") && hour === 12) hour = 0;

    // Lima time is UTC-5
    const limaDate = new Date(Date.UTC(year, month, day, hour + 5, min, 0));
    if (!isNaN(limaDate.getTime())) {
      return limaDate.toISOString();
    }
  }

  return new Date().toISOString();
}

function classifyCategory(title) {
  const t = String(title || "");

  // 1. Dólar y BCRP
  if (
    /\b(d[oó]lar|d[oó]lares|tipo\s+de\s+cambio|divisa[s]?|tc|bcr|bcrp|banco\s+central|julio\s+velarde|moneda\s+extranjera|pol[ií]tica\s+monetaria|tasa[s]?\s+de\s+inter[eé]s|interbancari[oa]|reservas\s+internacionales|billete\s+verde|soles?\s+por\s+d[oó]lar|depreciaci[oó]n|apreciaci[oó]n\s+del\s+sol)\b/i.test(
      t
    )
  ) {
    return "Dólar y BCRP";
  }

  // 2. Minería y metales
  if (
    /\b(miner[ií]a|minero[s]?|minera[s]?|reinfo|doe\s+run|formalizaci[oó]n\s+minera|canon\s+minero|regal[ií]as\s+mineras|snmpe|cobre|copper|oro|gold|plata|silver|zinc|esta[ñn]o|tin|plomo|lead|litio|lithium|hierro|iron|metales|metalurgia|concentrado[s]?|c[aá]todo[s]?|fundici[oó]n|refiner[ií]a\s+de\s+cobre|yacimiento[s]?|antamina|cerro\s+verde|las\s+bambas|southern\s+copper|buenaventura|chinalco|toromocho|quellaveco|t[ií]a\s+mar[ií]a|volcan|minsur|hudbay|marcona)\b/i.test(
      t
    )
  ) {
    return "Minería y metales";
  }

  // 3. Energía
  if (
    /\b(energ[ií]a|electricidad|el[eé]ctric[oa][s]?|hidrocarburos|petr[oó]leo|crudo|barril|wti|brent|gas\s+natural|glp|gnv|gnl|camisea|petroper[uú]|talara|refiner[ií]a\s+de\s+talara|osinergmin|oefa|generaci[oó]n\s+el[eé]ctrica|solar|e[oó]lic[oa]|hidroel[eé]ctrica|renovable[s]?|combustible[s]?|gasolina|di[eé]sel)\b/i.test(
      t
    )
  ) {
    return "Energía";
  }

  // 4. Bolsa y empresas
  if (
    /\b(bolsa|bvl|acciones|bonos|renta\s+variable|renta\s+fija|dividendos|utilidades|smv|hechos?\s+de\s+importancia|estados?\s+financieros?|opa|adquisici[oó]n|fusiones?|mercado\s+de\s+valores|credicorp|intercorp|ferreycorp|alicorp|bcp|bbva|scotiabank|interbank|banco\s+de\s+cr[eé]dito|fitch|moody'?s|s&p|standard\s+&?\s+poor'?s|startups?|venture|inversionistas?|corporativ[oa][s]?|empresas?|empresarial(?:es)?|compañ[ií]as?|corporaci[oó]n(?:es)?|ceo|cfo|directorio[s]?|firmas?|marcas?|negocios?|cadena[s]?|franquicias?|apertura[s]?|portafolio|retail|supermercados?|malls?|centros?\s+comerciales|fideicomiso[s]?|holding|grupos?\s+econ[oó]micos?)\b/i.test(
      t
    )
  ) {
    return "Bolsa y empresas";
  }

  // 5. Economía y fiscal
  if (
    /\b(mef|inei|indecopi|sunat|uif|pbi|producto\s+bruto|inflaci[oó]n|deflaci[oó]n|ipc|precios\s+al\s+consumidor|tribut[oa][s]?|impuesto[s]?|igv|arancel(?:es)?|deuda\s+p[uú]blica|d[eé]ficit\s+fiscal|super[aá]vit|presupuesto[s]?\s+p[uú]blico|fmi|banco\s+mundial|cepal|comercio\s+exterior|exportaci[oó]n(?:es)?|importaci[oó]n(?:es)?|balanza\s+comercial|empleo|desempleo|subempleo|salario[s]?|sueldo[s]?|remuneraci[oó]n|rmv|onp|afp|pensi[oó]n(?:es)?|jubilad[oa][s]?|pobreza|consumo\s+privado|gasto\s+p[uú]blico|crecimiento\s+econ[oó]mico|reactivaci[oó]n|bono[s]?|proinversi[oó]n|financier[oa][s]?|cr[eé]dito[s]?|banca|econom[ií]a|econ[oó]mic[oa][s]?|cr[eé]dito\s+hipotecario|vivienda|costo[s]?\s+de\s+producci[oó]n|productividad|agro|agr[ií]cola|pesca|pesquer[ií]a|avicultura|av[ií]cola|textil|industria[s]?|manufactura|laboral(?:es)?|trabajo|trabajadores|suspensi[oó]n\s+perfecta|canasta\s+b[aá]sica|alimentos?|escasez|operaciones\s+sospechosas)\b/i.test(
      t
    )
  ) {
    return "Economía y fiscal";
  }

  // 6. World events that move markets: wars, the big economies, central banks, trade, AI and tech
  if (
    /\b(guerra|conflicto\s+armado|ataque|misil(?:es)?|invasi[oó]n|otan|israel|ir[aá]n|gaza|rusia|ucrania|taiw[aá]n|china|chin[oa]s?|estados\s+unidos|ee\.?\s?uu\.?|eeuu|trump|casa\s+blanca|reserva\s+federal|fed|powell|bce|wall\s+street|nasdaq|dow\s+jones|s&p\s*500|recesi[oó]n|opep|sanciones|elecciones|inteligencia\s+artificial|ia\b|chatgpt|openai|nvidia|chips?|semiconductores?|tecnol[oó]gic[oa]s?)\b/i.test(
      t
    )
  ) {
    return "Mundo";
  }

  // 7. Other economic news (trade, real estate, investment, jobs, companies) without a specific topic
  if (
    /\b(export(?:aci[oó]n|aciones|adores?)|import(?:aci[oó]n|aciones)|agroexport\w*|comercio\s+exterior|inversi[oó]n(?:es)?|inversionistas?|viviendas?|inmobiliari[oa]s?|construcci[oó]n|empleo|desempleo|salario|sueldo\s+m[ií]nimo|remuneraci[oó]n|ventas|consumo|retail|empresas?|millones|crecimiento\s+econ[oó]mico|econom[ií]a|financier[oa]s?|bancos?|cr[eé]ditos?|afp|pensiones|turismo|aerol[ií]neas?|licitaci[oó]n|concesi[oó]n|buena\s+pro|obras?\s+p[uú]blicas|presupuesto|recaudaci[oó]n|mype|pymes?|startups?|fintech)\b/i.test(
      t
    )
  ) {
    return "Economía y fiscal";
  }

  return "Otros";
}

const GLOBAL_PERU_REGEX =
  /\b(per[uú]|peruan[oas]{1,2}|lima|soles|bcr|bcrp|bvl|mef|inei|smv|sunat|antamina|cerro\s+verde|las\s+bambas|southern\s+copper|buenaventura|quellaveco|toromocho|t[ií]a\s+mar[ií]a|volcan|minsur|credicorp|intercorp|alicorp|petroper[uú]|camisea|velarde|cobre|copper|plata|silver|zinc|oro|gold|wti)\b/i;

const NON_ECONOMIC_SECTION_REGEX =
  /\/(?:futbol|deportes?|famosos?|farandula|espectaculos?|celebridades?|cine-series?|entretenimiento|estilo-vida|virales?)\//i;

const NOISE_TITLE_REGEX =
  /\b(cine|cartelera|pel[ií]cula[s]?|hor[oó]scopo|clima|senamhi|temperatura|gar[uú]a|sismo|temblor|loter[ií]a|tinka|pron[oó]stico\s+del\s+tiempo|corte\s+de\s+agua|se[ñn]or\s+de\s+los\s+milagros|procesi[oó]n|concierto|streamer|v[oó]ley|f[uú]tbol|liga\s+\d*|selecci[oó]n\s+peruana|halloween|canci[oó]n\s+criolla)\b/i;

const SOURCES_CONFIG = [
  // VERDE (Oficiales)
  {
    id: "andina",
    nombre: "Agencia Andina",
    tipo: "rss",
    url: "https://andina.pe/agencia/rss.aspx?id=2",
    fallbackUrl: "https://andina.pe/agencia/rss.aspx",
    semaforo: "VERDE",
    esGlobal: false
  },
  {
    id: "mef",
    nombre: "Ministerio de Economía y Finanzas",
    tipo: "gobpe",
    url: "https://www.gob.pe/busquedas.json?contenido[]=noticias&institucion[]=mef",
    semaforo: "VERDE",
    esGlobal: false
  },
  {
    id: "inei",
    nombre: "Instituto Nacional de Estadística e Informática",
    tipo: "gobpe",
    url: "https://www.gob.pe/busquedas.json?contenido[]=noticias&institucion[]=inei",
    semaforo: "VERDE",
    esGlobal: false
  },
  {
    id: "bcrp",
    nombre: "Banco Central de Reserva del Perú",
    tipo: "html",
    url: "https://www.bcrp.gob.pe/transparencia/notas-de-prensa.html",
    semaforo: "VERDE",
    esGlobal: false
  },

  // AMARILLO (Medios privados - solo titular, url, fecha)
  {
    id: "gestion",
    nombre: "Gestión",
    tipo: "rss",
    url: "https://gestion.pe/arcio/rss/category/economia/",
    semaforo: "AMARILLO",
    esGlobal: false
  },
  {
    id: "el_comercio",
    nombre: "El Comercio Economía",
    tipo: "rss",
    url: "https://elcomercio.pe/arcio/rss/category/economia/",
    semaforo: "AMARILLO",
    esGlobal: false
  },
  {
    id: "rpp",
    nombre: "RPP Noticias",
    tipo: "rss",
    url: "https://rpp.pe/feed",
    semaforo: "AMARILLO",
    esGlobal: false,
    filterGeneral: true
  },
  {
    id: "la_republica",
    nombre: "La República Economía",
    tipo: "rss",
    url: "https://larepublica.pe/rss/economia",
    semaforo: "AMARILLO",
    esGlobal: false
  },
  {
    id: "infobae",
    nombre: "Infobae Perú",
    tipo: "rss",
    url: "https://www.infobae.com/arc/outboundfeeds/rss/category/peru/",
    semaforo: "AMARILLO",
    esGlobal: false,
    filterGeneral: true
  },
  {
    id: "semana_economica",
    nombre: "Semana Económica",
    tipo: "atom",
    url: "https://semanaeconomica.com/feed",
    semaforo: "AMARILLO",
    esGlobal: false
  },
  {
    id: "bloomberg_linea",
    nombre: "Bloomberg Línea",
    tipo: "rss",
    url: "https://www.bloomberglinea.com/arc/outboundfeeds/google-news-feed-latam/?outputType=xml",
    semaforo: "AMARILLO",
    esGlobal: true
  },
  {
    id: "mining_com",
    nombre: "Mining.com",
    tipo: "rss",
    url: "https://www.mining.com/feed/",
    semaforo: "AMARILLO",
    esGlobal: true
  }
];

async function fetchWithTimeout(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/xml, application/json, text/xml, text/html, */*",
        "Accept-Language": "es-PE,es;q=0.9,en;q=0.8",
        ...headers
      },
      signal: controller.signal
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

function parseRssXml(xmlText, sourceConfig) {
  const items = [];
  const itemMatches = [...xmlText.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)];

  for (const match of itemMatches) {
    const block = match[1];

    const titleRaw =
      block.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i)?.[1] || "";
    const titulo = cleanText(titleRaw);
    if (!titulo) continue;

    // Filter out obvious noise in general feeds
    if (sourceConfig.filterGeneral && NOISE_TITLE_REGEX.test(titulo)) {
      continue;
    }

    // Link extraction
    let url = "";
    const linkMatch = block.match(/<link[\s\S]*?>([\s\S]*?)<\/link>/i);
    if (linkMatch) {
      url = cleanText(linkMatch[1]);
    }
    if (!url) {
      const guidMatch = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
      if (guidMatch && guidMatch[1].startsWith("http")) {
        url = cleanText(guidMatch[1]);
      }
    }
    if (!url) continue;

    // Filter out non-economic sections in general feeds
    if (sourceConfig.filterGeneral && NON_ECONOMIC_SECTION_REGEX.test(url)) {
      continue;
    }

    // Global feeds: news about Peru, or world events that move markets
    if (sourceConfig.esGlobal && !GLOBAL_PERU_REGEX.test(titulo) && classifyCategory(titulo) !== "Mundo") {
      continue;
    }

    // Date extraction
    const dateRaw =
      block.match(/<pubDate[\s\S]*?>([\s\S]*?)<\/pubDate>/i)?.[1] ||
      block.match(/<dc:date[\s\S]*?>([\s\S]*?)<\/dc:date>/i)?.[1] ||
      "";
    const fecha_iso = parseDateIso(dateRaw);

    const categoria = classifyCategory(titulo);

    // General news feeds (RPP, Infobae Perú): economic and world topics only. Almost every headline
    // there mentions Lima or Peru, so the Peru filter let processions, concerts and sports through.
    if (sourceConfig.filterGeneral && categoria === "Otros") continue;

    const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 10);
    const id = `${sourceConfig.id}-${hash}`;

    items.push({
      id,
      titulo,
      url,
      fuente: sourceConfig.nombre,
      fecha_iso,
      categoria,
      semaforo: sourceConfig.semaforo
    });
  }

  return items;
}

function parseAtomXml(xmlText, sourceConfig) {
  const items = [];
  const entryMatches = [...xmlText.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)];

  for (const match of entryMatches) {
    const block = match[1];

    const titleRaw =
      block.match(/<title[\s\S]*?>([\s\S]*?)<\/title>/i)?.[1] || "";
    const titulo = cleanText(titleRaw);
    if (!titulo) continue;

    if (sourceConfig.filterGeneral && NOISE_TITLE_REGEX.test(titulo)) {
      continue;
    }

    let url = "";
    const linkHrefMatch = block.match(/<link[^>]+href=["']([^"']+)["']/i);
    if (linkHrefMatch) {
      url = linkHrefMatch[1].trim();
    } else {
      const linkTagMatch = block.match(/<link[\s\S]*?>([\s\S]*?)<\/link>/i);
      if (linkTagMatch) url = cleanText(linkTagMatch[1]);
    }
    if (!url) continue;

    if (sourceConfig.esGlobal && !GLOBAL_PERU_REGEX.test(titulo)) {
      continue;
    }

    const dateRaw =
      block.match(/<updated[\s\S]*?>([\s\S]*?)<\/updated>/i)?.[1] ||
      block.match(/<published[\s\S]*?>([\s\S]*?)<\/published>/i)?.[1] ||
      "";
    const fecha_iso = parseDateIso(dateRaw);

    const categoria = classifyCategory(titulo);
    const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 10);
    const id = `${sourceConfig.id}-${hash}`;

    items.push({
      id,
      titulo,
      url,
      fuente: sourceConfig.nombre,
      fecha_iso,
      categoria,
      semaforo: sourceConfig.semaforo
    });
  }

  return items;
}

function parseGobPeJson(jsonObj, sourceConfig) {
  const items = [];
  const results = jsonObj?.data?.attributes?.results || [];

  for (const res of results) {
    const rawTitle = res.name_with_parent || res.name || "";
    const titulo = cleanText(rawTitle);
    if (!titulo) continue;

    let url = "";
    if (res.url) {
      const hrefMatch = String(res.url).match(/href=["']([^"']+)["']/i);
      if (hrefMatch) {
        url = hrefMatch[1];
      } else if (String(res.url).startsWith("http") || String(res.url).startsWith("/")) {
        url = String(res.url);
      }
    }
    if (!url && res.friendly_slug) {
      url = `/institucion/${sourceConfig.id}/noticias/${res.friendly_slug}`;
    }
    if (url && !url.startsWith("http")) {
      url = `https://www.gob.pe${url.startsWith("/") ? "" : "/"}${url}`;
    }
    if (!url) continue;

    const fecha_iso = parseDateIso(res.publication || res.date || "");
    const categoria = classifyCategory(titulo);

    const hash = crypto.createHash("sha256").update(url).digest("hex").slice(0, 10);
    const id = `${sourceConfig.id}-${hash}`;

    items.push({
      id,
      titulo,
      url,
      fuente: sourceConfig.nombre,
      fecha_iso,
      categoria,
      semaforo: sourceConfig.semaforo
    });
  }

  return items;
}

function parseHtmlPortal(htmlText, sourceConfig) {
  if (
    htmlText.includes("recaptcha") ||
    htmlText.includes("cf-browser-verification") ||
    htmlText.includes("Incapsula") ||
    htmlText.includes("Attention Required")
  ) {
    return { ok: false, error: "WAF challenge detected (Incapsula/Cloudflare)", items: [] };
  }

  const items = [];
  const regex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(htmlText)) !== null) {
    let link = match[1];
    let anchorText = cleanText(match[2]);

    if (anchorText.length > 20 && anchorText.length < 200) {
      if (link.startsWith("/")) {
        link = `https://www.bcrp.gob.pe${link}`;
      }
      if (link.startsWith("https://www.bcrp.gob.pe")) {
        const categoria = classifyCategory(anchorText);
        const hash = crypto.createHash("sha256").update(link).digest("hex").slice(0, 10);
        items.push({
          id: `${sourceConfig.id}-${hash}`,
          titulo: anchorText,
          url: link,
          fuente: sourceConfig.nombre,
          fecha_iso: new Date().toISOString(),
          categoria,
          semaforo: sourceConfig.semaforo
        });
      }
    }
  }

  return { ok: items.length > 0, items };
}

async function fetchSource(sourceConfig) {
  let targetUrl = sourceConfig.url;
  try {
    let res = await fetchWithTimeout(targetUrl);

    if (!res.ok && sourceConfig.fallbackUrl) {
      console.warn(`[${sourceConfig.id}] URL principal devolvió ${res.status}. Probando fallback: ${sourceConfig.fallbackUrl}`);
      targetUrl = sourceConfig.fallbackUrl;
      res = await fetchWithTimeout(targetUrl);
    }

    if (!res.ok) {
      return {
        id: sourceConfig.id,
        nombre: sourceConfig.nombre,
        ok: false,
        items: [],
        error: `HTTP ${res.status} ${res.statusText}`
      };
    }

    if (sourceConfig.tipo === "gobpe") {
      const data = await res.json();
      const items = parseGobPeJson(data, sourceConfig);
      return {
        id: sourceConfig.id,
        nombre: sourceConfig.nombre,
        ok: true,
        items
      };
    }

    if (sourceConfig.tipo === "atom") {
      const xml = await res.text();
      const items = parseAtomXml(xml, sourceConfig);
      return {
        id: sourceConfig.id,
        nombre: sourceConfig.nombre,
        ok: true,
        items
      };
    }

    if (sourceConfig.tipo === "rss") {
      const xml = await res.text();
      const items = parseRssXml(xml, sourceConfig);
      return {
        id: sourceConfig.id,
        nombre: sourceConfig.nombre,
        ok: true,
        items
      };
    }

    if (sourceConfig.tipo === "html") {
      const html = await res.text();
      const result = parseHtmlPortal(html, sourceConfig);
      return {
        id: sourceConfig.id,
        nombre: sourceConfig.nombre,
        ok: result.ok,
        items: result.items,
        error: result.error
      };
    }

    return {
      id: sourceConfig.id,
      nombre: sourceConfig.nombre,
      ok: false,
      items: [],
      error: `Tipo no soportado: ${sourceConfig.tipo}`
    };
  } catch (err) {
    return {
      id: sourceConfig.id,
      nombre: sourceConfig.nombre,
      ok: false,
      items: [],
      error: err.name === "AbortError" ? "Timeout" : err.message
    };
  }
}

export async function main() {
  console.log("=== INICIO INGESTA DE FEEDS DE NOTICIAS PERDATA ===");
  console.log(`User-Agent: ${USER_AGENT}`);
  console.log(`Pausa entre peticiones: ${REQUEST_DELAY_MS} ms\n`);

  const fuentesResumen = {};
  const todasLasNoticias = [];

  for (let i = 0; i < SOURCES_CONFIG.length; i++) {
    const src = SOURCES_CONFIG[i];
    if (i > 0) {
      await sleep(REQUEST_DELAY_MS);
    }

    console.log(`Consultando [${src.semaforo}] ${src.nombre} (${src.url})...`);
    const res = await fetchSource(src);

    if (res.ok) {
      console.log(`  -> OK: ${res.items.length} noticias extraídas.`);
      fuentesResumen[src.id] = {
        nombre: src.nombre,
        ok: true,
        items: res.items.length
      };
      todasLasNoticias.push(...res.items);
    } else {
      console.warn(`  -> FALLO: ${res.error || "No se obtuvieron noticias"}`);
      fuentesResumen[src.id] = {
        nombre: src.nombre,
        ok: false,
        items: 0
      };
    }
  }

  // Deduplicación por título normalizado y URL
  const seenTitles = new Set();
  const seenUrls = new Set();
  const noticiasUnicas = [];

  // Ordenar previamente por fecha (más reciente primero)
  todasLasNoticias.sort((a, b) => new Date(b.fecha_iso).getTime() - new Date(a.fecha_iso).getTime());

  for (const item of todasLasNoticias) {
    const norm = normalizeTitle(item.titulo);
    if (!norm || norm.length < 10) continue;
    if (seenTitles.has(norm)) continue;
    if (seenUrls.has(item.url)) continue;

    seenTitles.add(norm);
    seenUrls.add(item.url);
    noticiasUnicas.push(item);
  }

  // Limitar al número máximo requerido
  const noticiasFinales = noticiasUnicas.slice(0, MAX_OUTPUT_ITEMS);

  // Recalcular conteo real aportado por fuente en la colección final
  const conteoFinalPorFuente = {};
  for (const item of noticiasFinales) {
    const srcId = Object.keys(fuentesResumen).find(
      (k) => fuentesResumen[k].nombre === item.fuente
    ) || item.fuente;
    conteoFinalPorFuente[srcId] = (conteoFinalPorFuente[srcId] || 0) + 1;
  }

  const payload = {
    actualizado: new Date().toISOString(),
    fuentes: fuentesResumen,
    noticias: noticiasFinales
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), "utf-8");

  console.log("\n=== RESUMEN DE EJECUCIÓN ===");
  console.log(`Archivo generado: ${OUTPUT_FILE}`);
  console.log(`Total noticias únicas consolidadas: ${noticiasFinales.length}`);
  console.log("Distribución en data/noticias.json:");
  for (const [id, count] of Object.entries(conteoFinalPorFuente)) {
    console.log(`  - ${id}: ${count} noticias`);
  }

  const fallidas = Object.entries(fuentesResumen).filter(([, v]) => !v.ok);
  if (fallidas.length > 0) {
    console.log("\nFuentes que fallaron o no respondieron:");
    for (const [id, data] of fallidas) {
      console.log(`  - ${id} (${data.nombre})`);
    }
  }

  return { payload, fuentesResumen, conteoFinalPorFuente };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error("Error crítico ejecutando fetch-news.js:", err);
    process.exit(1);
  });
}
