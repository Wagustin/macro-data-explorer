// PerData search catalog — every symbol VERIFIED against live Yahoo Finance data
// (scripts/build-catalog.js + scripts/verify-bvl.js, $(date)).
// Tiers: bvl_pe (BVL Lima), global (verified tickers), macro_pe (World Bank),
// unlisted (major Peruvian private companies — reference only, no market data).
// Unknown companies are still resolved live via the Yahoo Finance fallback.
import { applyCors, setCdnCache, handleRateLimit } from "./_lib/ratelimit.js";

export const CATALOG = [
  { symbol: "BVN", name: "Compañía de Minas Buenaventura S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["oro", "plata", "zinc", "cobre", "bvl", "nyse", "yumpag", "uchucchacua"] },
  { symbol: "SCCO.LM", name: "Southern Copper Corporation", sector: "Minería", country: "Perú / México", category: "bvl_pe", tags: ["cobre", "toquepala", "cuajone", "bvl", "spcc"] },
  { symbol: "VOLCABC1.LM", name: "Volcan Compañía Minera S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["zinc", "plata", "plomo", "cerro", "de", "pasco", "chungar"] },
  { symbol: "MINSURI1.LM", name: "Minsur S.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["estano", "oro", "san", "rafael", "pucamarca"] },
  { symbol: "NEXAPEC1.LM", name: "Nexa Resources Perú S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["zinc", "plomo", "cerro", "lindo", "nexa"] },
  { symbol: "CPACASC1.LM", name: "Cementos Pacasmayo S.A.A.", sector: "Construcción / Cemento", country: "Perú", category: "bvl_pe", tags: ["cemento", "concreto", "norte"] },
  { symbol: "UNACEMC1.LM", name: "UNACEM Corp S.A.A.", sector: "Construcción / Cemento", country: "Perú", category: "bvl_pe", tags: ["cemento", "lima", "unacem"] },
  { symbol: "SIDERC1.LM", name: "Empresa Siderúrgica del Perú S.A.A.", sector: "Industriales / Aceros", country: "Perú", category: "bvl_pe", tags: ["aceros", "siderurgia", "chimbote"] },
  { symbol: "ALICORC1.LM", name: "Alicorp S.A.A.", sector: "Consumo Masivo", country: "Perú", category: "bvl_pe", tags: ["alimentos", "primor", "don", "vittorio", "aceites", "fideos"] },
  { symbol: "BACKUSI1.LM", name: "Unión de Cervecerías Peruanas Backus y Johnston S.A.A.", sector: "Consumo Masivo", country: "Perú", category: "bvl_pe", tags: ["cerveza", "pilsen", "cristal", "backus", "abinbev"] },
  { symbol: "BAP", name: "Credicorp Ltd.", sector: "Banca y Finanzas", country: "Perú", category: "bvl_pe", tags: ["banco", "de", "credito", "bcp", "pacifico", "prima", "afp", "mibanco"] },
  { symbol: "IFS", name: "Intercorp Financial Services Inc.", sector: "Banca y Finanzas", country: "Perú", category: "bvl_pe", tags: ["interbank", "interseguro", "inteligo"] },
  { symbol: "FERREYC1.LM", name: "Ferreycorp S.A.A.", sector: "Bienes de Capital", country: "Perú", category: "bvl_pe", tags: ["caterpillar", "maquinaria", "minera", "ferreyros"] },
  { symbol: "AUSTRAC1.LM", name: "Austral Group S.A.A.", sector: "Pesca / Consumo", country: "Perú", category: "bvl_pe", tags: ["pesca", "anchoveta", "harina", "austral"] },
  { symbol: "AENZAC1.LM", name: "AENZA S.A.A.", sector: "Industriales / Infraestructura", country: "Perú", category: "bvl_pe", tags: ["construccion","infraestructura","energia"] },
  { symbol: "ATACOBC1.LM", name: "Nexa Resources Atacocha S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["oro","zinc","plata","mineria"] },
  { symbol: "BBVAC1.LM", name: "Banco BBVA Perú", sector: "Banca y Finanzas", country: "Perú", category: "bvl_pe", tags: ["banco","bbva","finanzas"] },
  { symbol: "BROCALC1.LM", name: "Sociedad Minera El Brocal S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["mineria","plata","zinc","brocal"] },
  { symbol: "CARTAVC1.LM", name: "Cartavio S.A.A.", sector: "Agroindustria", country: "Perú", category: "bvl_pe", tags: ["azucar","agroindustria","cartavio"] },
  { symbol: "CASAGRC1.LM", name: "Casa Grande S.A.A.", sector: "Agroindustria", country: "Perú", category: "bvl_pe", tags: ["azucar","agroindustria","casa","grande"] },
  { symbol: "CORAREI1.LM", name: "Corporación Aceros Arequipa S.A.", sector: "Industriales / Aceros", country: "Perú", category: "bvl_pe", tags: ["acero","siderurgia","arequipa"] },
  { symbol: "CREDITC1.LM", name: "Banco de Crédito del Perú", sector: "Banca y Finanzas", country: "Perú", category: "bvl_pe", tags: ["banco","credito","bcp","finanzas"] },
  { symbol: "CVERDEC1.LM", name: "Sociedad Minera Cerro Verde S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["cobre","mineria","arequipa","cerro"] },
  { symbol: "ENGIEC1.LM", name: "Engie Energía Perú S.A.A.", sector: "Energía", country: "Perú", category: "bvl_pe", tags: ["energia","electricidad","engie"] },
  { symbol: "FIBPRIME.LM", name: "FIBRA Prime", sector: "Bienes Raíces", country: "Perú", category: "bvl_pe", tags: ["fibra","inmobiliario","renta"] },
  { symbol: "HIDRA2C1.LM", name: "Hidrandina S.A.", sector: "Servicios Públicos", country: "Perú", category: "bvl_pe", tags: ["electricidad","energia","hidrandina"] },
  { symbol: "INRETC1.LM", name: "InRetail Perú Corp.", sector: "Consumo / Retail", country: "Perú", category: "bvl_pe", tags: ["retail","tiendas","consumo"] },
  { symbol: "IPCHBC1.LM", name: "Inversiones Portuarias Chancay S.A.A.", sector: "Industriales / Infraestructura", country: "Perú", category: "bvl_pe", tags: ["puerto","chancay","logistica"] },
  { symbol: "LUSURC1.LM", name: "Luz del Sur S.A.A.", sector: "Servicios Públicos", country: "Perú", category: "bvl_pe", tags: ["electricidad","energia","lima"] },
  { symbol: "PODERC1.LM", name: "Compañía Minera Poderosa S.A.A.", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["oro","mineria","poderosa"] },
  { symbol: "POMALCC1.LM", name: "Empresa Agroindustrial Pomalca S.A.A.", sector: "Agroindustria", country: "Perú", category: "bvl_pe", tags: ["azucar","agroindustria","pomalca"] },
  { symbol: "SPCCPI1.LM", name: "Southern Peru Copper Corporation - Sucursal del Perú", sector: "Minería", country: "Perú", category: "bvl_pe", tags: ["cobre","mineria","southern","peru"] },
  { symbol: "^GSPC", name: "S&P 500 Index", sector: "Índice", country: "EE.UU.", category: "global", tags: ["sp500", "bolsa", "eeuu"] },
  { symbol: "^DJI", name: "Dow Jones Industrial Average", sector: "Índice", country: "EE.UU.", category: "global", tags: ["dow", "jones", "bolsa"] },
  { symbol: "^IXIC", name: "NASDAQ Composite", sector: "Índice", country: "EE.UU.", category: "global", tags: ["nasdaq", "tecnologia", "bolsa"] },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50", sector: "Índice", country: "Europa", category: "global", tags: ["europa", "stoxx", "bolsa"] },
  { symbol: "000001.SS", name: "Shanghai Composite", sector: "Índice", country: "China", category: "global", tags: ["china", "shanghai", "bolsa"] },
  { symbol: "^MXX", name: "IPC México (S&P/BMV)", sector: "Índice", country: "México", category: "global", tags: ["mexico", "ipc", "bolsa"] },
  { symbol: "^BVSP", name: "Ibovespa Brasil", sector: "Índice", country: "Brasil", category: "global", tags: ["brasil", "ibovespa", "bolsa"] },
  { symbol: "^N225", name: "Nikkei 225", sector: "Índice", country: "Japón", category: "global", tags: ["japon", "nikkei", "bolsa"] },
  { symbol: "^FTSE", name: "FTSE 100", sector: "Índice", country: "Reino Unido", category: "global", tags: ["uk", "ftse", "bolsa"] },
  { symbol: "^IBEX", name: "IBEX 35", sector: "Índice", country: "España", category: "global", tags: ["espana", "ibex", "bolsa"] },
  { symbol: "AAPL", name: "Apple Inc.", sector: "Tecnología", country: "EE.UU.", category: "global", tags: ["iphone", "mac"] },
  { symbol: "MSFT", name: "Microsoft Corporation", sector: "Tecnología", country: "EE.UU.", category: "global", tags: ["windows", "azure", "office"] },
  { symbol: "GOOGL", name: "Alphabet Inc. (Google)", sector: "Tecnología", country: "EE.UU.", category: "global", tags: ["google", "busqueda", "android"] },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Consumo / E-commerce", country: "EE.UU.", category: "global", tags: ["amazon", "aws", "retail"] },
  { symbol: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductores", country: "EE.UU.", category: "global", tags: ["nvidia", "gpu", "ia", "chips"] },
  { symbol: "META", name: "Meta Platforms", sector: "Tecnología", country: "EE.UU.", category: "global", tags: ["facebook", "instagram", "whatsapp"] },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Automotriz / Energía", country: "EE.UU.", category: "global", tags: ["tesla", "electricos"] },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Banca", country: "EE.UU.", category: "global", tags: ["jpmorgan", "banco"] },
  { symbol: "V", name: "Visa Inc.", sector: "Pagos", country: "EE.UU.", category: "global", tags: ["visa", "pagos"] },
  { symbol: "KO", name: "Coca-Cola Company", sector: "Consumo Masivo", country: "EE.UU.", category: "global", tags: ["coca", "cola", "bebidas"] },
  { symbol: "PEP", name: "PepsiCo Inc.", sector: "Consumo Masivo", country: "EE.UU.", category: "global", tags: ["pepsi", "snacks"] },
  { symbol: "MCD", name: "McDonald's Corporation", sector: "Restaurantes", country: "EE.UU.", category: "global", tags: ["mcdonalds", "comida", "rapida"] },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energía / Petróleo", country: "EE.UU.", category: "global", tags: ["exxon", "petroleo", "gas"] },
  { symbol: "CVX", name: "Chevron Corporation", sector: "Energía / Petróleo", country: "EE.UU.", category: "global", tags: ["chevron", "petroleo"] },
  { symbol: "WMT", name: "Walmart Inc.", sector: "Retail", country: "EE.UU.", category: "global", tags: ["walmart", "supermercados"] },
  { symbol: "PG", name: "Procter & Gamble", sector: "Consumo Masivo", country: "EE.UU.", category: "global", tags: ["pg", "higiene", "hogar"] },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Salud", country: "EE.UU.", category: "global", tags: ["jnj", "farmaceutica"] },
  { symbol: "LLY", name: "Eli Lilly", sector: "Salud", country: "EE.UU.", category: "global", tags: ["lilly", "farmaceutica"] },
  { symbol: "MA", name: "Mastercard", sector: "Pagos", country: "EE.UU.", category: "global", tags: ["mastercard", "pagos"] },
  { symbol: "COST", name: "Costco Wholesale", sector: "Retail", country: "EE.UU.", category: "global", tags: ["costco", "mayoreo"] },
  { symbol: "HD", name: "Home Depot", sector: "Retail / Construcción", country: "EE.UU.", category: "global", tags: ["home", "depot", "ferreteria"] },
  { symbol: "ORCL", name: "Oracle Corporation", sector: "Software", country: "EE.UU.", category: "global", tags: ["oracle", "base", "datos", "nube"] },
  { symbol: "AMD", name: "AMD", sector: "Semiconductores", country: "EE.UU.", category: "global", tags: ["amd", "gpu", "procesadores"] },
  { symbol: "QCOM", name: "Qualcomm", sector: "Semiconductores", country: "EE.UU.", category: "global", tags: ["qualcomm", "chips", "moviles"] },
  { symbol: "AVGO", name: "Broadcom", sector: "Semiconductores", country: "EE.UU.", category: "global", tags: ["broadcom", "chips", "redes"] },
  { symbol: "ASML", name: "ASML Holding", sector: "Semiconductores", country: "Holanda", category: "global", tags: ["asml", "litografia", "euvm"] },
  { symbol: "TSM", name: "TSMC (Taiwan Semiconductor)", sector: "Semiconductores", country: "Taiwán", category: "global", tags: ["tsmc", "foundry", "chips"] },
  { symbol: "BAC", name: "Bank of America", sector: "Banca", country: "EE.UU.", category: "global", tags: ["boa", "banco"] },
  { symbol: "C", name: "Citigroup", sector: "Banca", country: "EE.UU.", category: "global", tags: ["citibank", "banco"] },
  { symbol: "GS", name: "Goldman Sachs", sector: "Banca / Inversión", country: "EE.UU.", category: "global", tags: ["goldman", "sachs"] },
  { symbol: "BLK", name: "BlackRock", sector: "Gestión de Activos", country: "EE.UU.", category: "global", tags: ["blackrock", "ishares"] },
  { symbol: "ABEV", name: "Ambev", sector: "Consumo Masivo", country: "Brasil", category: "global", tags: ["ambev", "cerveza"] },
  { symbol: "PBR", name: "Petrobras", sector: "Energía / Petróleo", country: "Brasil", category: "global", tags: ["petrobras", "petroleo"] },
  { symbol: "ITUB", name: "Itaú Unibanco", sector: "Banca", country: "Brasil", category: "global", tags: ["itau", "banco"] },
  { symbol: "BBDO", name: "Banco Bradesco", sector: "Banca", country: "Brasil", category: "global", tags: ["bradesco", "banco"] },
  { symbol: "BBD", name: "Banco Bradesco ADR", sector: "Banca", country: "Brasil", category: "global", tags: ["bradesco", "adr"] },
  { symbol: "MELI", name: "MercadoLibre", sector: "E-commerce", country: "LatAm", category: "global", tags: ["mercado", "libre"] },
  { symbol: "ARCO", name: "Arcos Dorados (McDonald's LatAm)", sector: "Restaurantes", country: "LatAm", category: "global", tags: ["arcos", "dorados"] },
  { symbol: "GGB", name: "Gerdau", sector: "Aceros", country: "Brasil", category: "global", tags: ["gerdau", "aceros"] },
  { symbol: "SID", name: "Companhia Siderúrgica Nacional", sector: "Aceros", country: "Brasil", category: "global", tags: ["csn", "aceros"] },
  { symbol: "EC", name: "Ecopetrol", sector: "Energía / Petróleo", country: "Colombia", category: "global", tags: ["ecopetrol", "petroleo"] },
  { symbol: "CX", name: "Cemex", sector: "Construcción / Cemento", country: "México", category: "global", tags: ["cemex", "cemento"] },
  { symbol: "FMX", name: "Fomento Económico Mexicano (FEMSA)", sector: "Consumo Masivo", country: "México", category: "global", tags: ["femsa", "oxxo"] },
  { symbol: "AMX", name: "América Móvil", sector: "Telecomunicaciones", country: "México", category: "global", tags: ["telmex", "claro"] },
  { symbol: "FCX", name: "Freeport-McMoRan (Cerro Verde)", sector: "Minería", country: "EE.UU. / Perú", category: "global", tags: ["cobre", "cerro", "verde", "grasberg"] },
  { symbol: "BHP", name: "BHP Group (Antamina)", sector: "Minería", country: "Australia / Global", category: "global", tags: ["cobre", "hierro", "antamina", "escondida"] },
  { symbol: "RIO", name: "Rio Tinto plc", sector: "Minería", country: "Reino Unido / Global", category: "global", tags: ["hierro", "aluminio", "cobre"] },
  { symbol: "NEM", name: "Newmont Corporation (Yanacocha)", sector: "Minería", country: "EE.UU. / Perú", category: "global", tags: ["oro", "yanacocha"] },
  { symbol: "GOLD", name: "Barrick Gold", sector: "Minería", country: "Canadá / Global", category: "global", tags: ["oro", "barrick", "lagunas", "norte"] },
  { symbol: "AEM", name: "Agnico Eagle Mines", sector: "Minería", country: "Canadá", category: "global", tags: ["oro", "agnico"] },
  { symbol: "TECK", name: "Teck Resources", sector: "Minería", country: "Canadá", category: "global", tags: ["cobre", "zinc", "quebrada", "blanca"] },
  { symbol: "GFI", name: "Gold Fields", sector: "Minería", country: "Sudáfrica", category: "global", tags: ["oro", "gold", "fields"] },
  { symbol: "AG", name: "First Majestic Silver", sector: "Minería", country: "Canadá / México", category: "global", tags: ["plata", "silver"] },
  { symbol: "PAAS", name: "Pan American Silver", sector: "Minería", country: "Canadá", category: "global", tags: ["plata", "pan", "american"] },
  { symbol: "BTG", name: "B2Gold Corp", sector: "Minería", country: "Canadá", category: "global", tags: ["oro", "b2gold"] },
  { symbol: "SCCO", name: "Southern Copper Corp (NYSE)", sector: "Minería", country: "EE.UU.", category: "global", tags: ["cobre", "southern"] },
  { symbol: "MPWR", name: "Monolithic Power Systems", sector: "Semiconductores", country: "EE.UU.", category: "global", tags: ["mpwr", "energia", "chips"] },
  { symbol: "HG=F", name: "Cobre Futuros (COMEX)", sector: "Commodity Metales", country: "Global", category: "global", tags: ["cobre", "copper", "lme"] },
  { symbol: "GC=F", name: "Oro Futuros (COMEX)", sector: "Commodity Metales", country: "Global", category: "global", tags: ["oro", "gold"] },
  { symbol: "SI=F", name: "Plata Futuros (COMEX)", sector: "Commodity Metales", country: "Global", category: "global", tags: ["plata", "silver"] },
  { symbol: "PL=F", name: "Platino Futuros (NYMEX)", sector: "Commodity Metales", country: "Global", category: "global", tags: ["platino", "platinum"] },
  { symbol: "PA=F", name: "Paladio Futuros (NYMEX)", sector: "Commodity Metales", country: "Global", category: "global", tags: ["paladio", "palladium"] },
  { symbol: "CL=F", name: "Petróleo Crudo WTI", sector: "Commodity Energía", country: "Global", category: "global", tags: ["petroleo", "wti", "oil"] },
  { symbol: "BZ=F", name: "Petróleo Brent", sector: "Commodity Energía", country: "Global", category: "global", tags: ["brent", "petroleo"] },
  { symbol: "NG=F", name: "Gas Natural (Henry Hub)", sector: "Commodity Energía", country: "Global", category: "global", tags: ["gas", "natural"] },
  { symbol: "ZW=F", name: "Trigo Futuros (CBOT)", sector: "Commodity Agrícola", country: "Global", category: "global", tags: ["trigo", "wheat"] },
  { symbol: "ZC=F", name: "Maíz Futuros (CBOT)", sector: "Commodity Agrícola", country: "Global", category: "global", tags: ["maiz", "corn"] },
  { symbol: "ZS=F", name: "Soja Futuros (CBOT)", sector: "Commodity Agrícola", country: "Global", category: "global", tags: ["soja", "soybean"] },
  { symbol: "SB=F", name: "Azúcar Futuros (ICE)", sector: "Commodity Agrícola", country: "Global", category: "global", tags: ["azucar", "sugar"] },
  { symbol: "CC=F", name: "Cacao Futuros (ICE)", sector: "Commodity Agrícola", country: "Global", category: "global", tags: ["cacao", "cocoa"] },
  { symbol: "KC=F", name: "Café Futuros (ICE)", sector: "Commodity Agrícola", country: "Global", category: "global", tags: ["cafe", "coffee"] },
  { symbol: "PEN=X", name: "Tipo de Cambio USD/PEN", sector: "Divisas (Forex)", country: "Perú", category: "global", tags: ["dolar", "sol", "tipo", "de", "cambio", "fx", "bcrp"] },
  { symbol: "EURUSD=X", name: "Euro / Dólar (EUR/USD)", sector: "Divisas (Forex)", country: "Global", category: "global", tags: ["euro", "dolar", "fx"] },
  { symbol: "USDJPY=X", name: "Dólar / Yen (USD/JPY)", sector: "Divisas (Forex)", country: "Global", category: "global", tags: ["yen", "japon", "fx"] },
  { symbol: "USDMXN=X", name: "Dólar / Peso Mexicano", sector: "Divisas (Forex)", country: "México", category: "global", tags: ["peso", "mexicano", "fx"] },
  { symbol: "USDBRL=X", name: "Dólar / Real Brasileño", sector: "Divisas (Forex)", country: "Brasil", category: "global", tags: ["real", "brasil", "fx"] },
  { symbol: "USDCOP=X", name: "Dólar / Peso Colombiano", sector: "Divisas (Forex)", country: "Colombia", category: "global", tags: ["peso", "colombiano", "fx"] },
  { symbol: "USDCNY=X", name: "Dólar / Yuan Chino", sector: "Divisas (Forex)", country: "China", category: "global", tags: ["yuan", "china", "fx"] },
  { symbol: "DX-Y.NYB", name: "Índice Dólar (DXY)", sector: "Divisas (Forex)", country: "EE.UU.", category: "global", tags: ["dxy", "dolar", "index"] },
  { symbol: "GBPUSD=X", name: "Libra / Dólar (GBP/USD)", sector: "Divisas (Forex)", country: "Reino Unido", category: "global", tags: ["libra", "fx"] },
  { symbol: "AUDUSD=X", name: "Dólar Australiano / USD", sector: "Divisas (Forex)", country: "Australia", category: "global", tags: ["aud", "fx"] },
  { symbol: "USDCAD=X", name: "Dólar / Dólar Canadiense", sector: "Divisas (Forex)", country: "Canadá", category: "global", tags: ["cad", "fx"] },
  { symbol: "USDCHF=X", name: "Dólar / Franco Suizo", sector: "Divisas (Forex)", country: "Suiza", category: "global", tags: ["chf", "fx"] },
  { symbol: "EURPEN=X", name: "Euro / Sol (EUR/PEN)", sector: "Divisas (Forex)", country: "Perú", category: "global", tags: ["euro", "sol", "fx"] },
  { symbol: "^TNX", name: "Bonos Tesoro EE.UU. 10Y (Rendimiento)", sector: "Tasas de Interés", country: "EE.UU.", category: "global", tags: ["bonos", "treasury", "tasa", "fed"] },
  { symbol: "^TYX", name: "Bonos Tesoro EE.UU. 30Y", sector: "Tasas de Interés", country: "EE.UU.", category: "global", tags: ["bonos", "30", "treasury"] },
  { symbol: "^FVX", name: "Bonos Tesoro EE.UU. 5Y", sector: "Tasas de Interés", country: "EE.UU.", category: "global", tags: ["bonos", "5", "treasury"] },
  { symbol: "BTC-USD", name: "Bitcoin (BTC/USD)", sector: "Criptoactivos", country: "Global", category: "global", tags: ["bitcoin", "btc", "cripto"] },
  { symbol: "ETH-USD", name: "Ethereum (ETH/USD)", sector: "Criptoactivos", country: "Global", category: "global", tags: ["ethereum", "eth", "cripto"] },
  { symbol: "GLD", name: "SPDR Gold Shares (ETF Oro)", sector: "ETF / Metales", country: "EE.UU.", category: "global", tags: ["oro", "etf", "gold"] },
  { symbol: "SLV", name: "iShares Silver Trust (ETF Plata)", sector: "ETF / Metales", country: "EE.UU.", category: "global", tags: ["plata", "etf", "silver"] },
  { symbol: "EEM", name: "iShares MSCI Emerging Markets", sector: "ETF Global", country: "Global", category: "global", tags: ["emerging", "etf"] },
  { symbol: "ILF", name: "iShares Latin America 40", sector: "ETF LatAm", country: "LatAm", category: "global", tags: ["latam", "etf"] },
  { symbol: "USO", name: "United States Oil Fund", sector: "ETF Energía", country: "EE.UU.", category: "global", tags: ["petroleo", "etf", "oil"] },
  { symbol: "PERU_CPI", name: "Inflación Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro_pe", tags: ["inflacion", "cpi", "ipc", "bcrp", "banco", "mundial"] },
  { symbol: "PERU_GDP", name: "Crecimiento PBI Anual Perú (%)", sector: "Macroeconomía", country: "Perú", category: "macro_pe", tags: ["pbi", "gdp", "crecimiento", "banco", "mundial"] },
  { symbol: "COSAPI", name: "Cosapi S.A.", sector: "Conglomerado Industrial y Construcción", country: "Perú", category: "unlisted", tags: ["cosapi", "construccion", "ingenieria", "mineria", "aviacion", "real", "estate"] },
  { symbol: "ANTAMINA-PRIV", name: "Compañía Minera Antamina", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["antamina", "cobre", "zinc", "joint", "venture"] },
  { symbol: "CERROVERDE-PRIV", name: "Sociedad Minera Cerro Verde", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["cerro", "verde", "cobre", "arequipa", "freeport"] },
  { symbol: "TINTAYA-PRIV", name: "Constancia / Tintaya (Hudbay)", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["tintaya", "constancia", "hudbay", "cobre"] },
  { symbol: "TALMA-PRIV", name: "Talma Servicios Aeroportuarios", sector: "Servicios y Logística (privada)", country: "Perú", category: "unlisted", tags: ["talma", "aeropuertos", "logistica"] },
  { symbol: "DANPER-PRIV", name: "Danper Trujillo", sector: "Agroindustria (privada)", country: "Perú", category: "unlisted", tags: ["danper", "agro", "esparragos", "palta", "exportacion"] },
  { symbol: "CAMPOSOL-PRIV", name: "Camposol Holding", sector: "Agroindustria (privada)", country: "Perú", category: "unlisted", tags: ["camposol", "palta", "mango", "arandano", "agro"] },
  { symbol: "NEWMONT-PRIV", name: "Minera Yanacocha (Newmont)", sector: "Minería (privada)", country: "Perú", category: "unlisted", tags: ["yanacocha", "oro", "cajamarca", "newmont"] },
  { symbol: "GloriaPRIV", name: "Gloria Foods International", sector: "Consumo (matriz offshore)", country: "Perú", category: "unlisted", tags: ["gloria", "matriz", "offshore"] },
  { symbol: "PAMOLPER-PRIV", name: "Palmas del Espino (Grupo Romero)", sector: "Agroindustria (privada)", country: "Perú", category: "unlisted", tags: ["palmas", "espino", "romero", "palma", "aceite"] },
  { symbol: "FERREYROS-PRIV", name: "Ferreyros S.A. (Caterpillar Perú)", sector: "Bienes de Capital (privada)", country: "Perú", category: "unlisted", tags: ["ferreyros", "caterpillar"] },
  { symbol: "QUIMPAC-PRIV", name: "Quimpac S.A. (química)", sector: "Química (privada)", country: "Perú", category: "unlisted", tags: ["quimpac", "quimica", "cloro", "sosa"] },
  { symbol: "LUCH-PRIV", name: "Lucchetti Perú (Adriano Lucchetti)", sector: "Consumo Masivo (BVL suspendida)", country: "Perú", category: "unlisted", tags: ["lucchetti", "fideos", "pasta", "consumo"] },
  { symbol: "CAJAARE-PRIV", name: "Caja Municipal Arequipa (CMAC)", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "arequipa", "cmac", "cmac-arequipa", "banca"] },
  { symbol: "CAJACUS-PRIV", name: "Caja Municipal Cusco", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "cusco", "cmac"] },
  { symbol: "CAJAHUA-PRIV", name: "Caja Municipal Huancayo", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "huancayo", "cmac"] },
  { symbol: "CAJAPIU-PRIV", name: "Caja Municipal Piura", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "piura", "cmac"] },
  { symbol: "CAJASUL-PRIV", name: "Caja Municipal Sullana", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "sullana", "cmac"] },
  { symbol: "CAJATRU-PRIV", name: "Caja Municipal Trujillo", sector: "Banca Municipal (no cotiza en bolsa)", country: "Perú", category: "unlisted", tags: ["caja", "trujillo", "cmac"] },
  { symbol: "SIDERPERU-PRIV", name: "Siderperu (Siderurgia)", sector: "Industriales (ver ticker SIDERC1.LM)", country: "Perú", category: "unlisted", tags: ["siderperu", "sider", "aceros", "chimbote"] },
  { symbol: "DIREKTP-PRIV", name: "Distribuidora Dtcar (DTC)", sector: "Retail automotriz (privada)", country: "Perú", category: "unlisted", tags: ["dtcar", "dtc", "autos", "retail"] },
  { symbol: "PLUZENER-PRIV", name: "Pluz Energía Perú (ex Enso)", sector: "Utilities (privada)", country: "Perú", category: "unlisted", tags: ["pluz", "energia", "electricidad", "enoso"] },
  { symbol: "GILATPER-PRIV", name: "Gilat Perú (satelital)", sector: "Telecom (privada)", country: "Perú", category: "unlisted", tags: ["gilat", "satelital", "telecom"] },
];

export default async function handler(req, res) {
  applyCors(req, res, "GET, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (handleRateLimit(req, res)) {
    return;
  }

  const hasAuth = Boolean(req.headers?.authorization);
  setCdnCache(res, hasAuth);

  const tradable = CATALOG.filter(c => c.category !== "unlisted").length;
  const total = CATALOG.length;

  if (req.query.stats === "1" || req.query.stats === "true") {
    return res.status(200).json({ tradable, total });
  }

  let q = String(req.query.q || "").trim().toLowerCase();
  if (q.length > 50) q = q.slice(0, 50);

  if (!q) {
    return res.status(200).json({ results: CATALOG.filter(c => c.category !== "unlisted").slice(0, 15), total, tradable });
  }

  // Split query into words: every word must match somewhere (AND search)
  const words = q.split(/\s+/).filter(Boolean);
  const matchesWord = (item, w) =>
    item.symbol.toLowerCase().includes(w) ||
    item.name.toLowerCase().includes(w) ||
    item.sector.toLowerCase().includes(w) ||
    item.country.toLowerCase().includes(w) ||
    item.tags.some(t => t.toLowerCase().includes(w));
  const localMatches = CATALOG.filter(item => words.every(w => matchesWord(item, w)));

  // Ranked: exact-name & BVL first, unlisted last (so tradable assets surface first)
  localMatches.sort((a, b) => {
    const score = (x) => (x.category === "unlisted" ? 2 : 0) + (x.name.toLowerCase().startsWith(q) ? -1 : 0);
    return score(a) - score(b);
  });

  if (localMatches.length >= 8) {
    return res.status(200).json({ results: localMatches.slice(0, 15), total, tradable });
  }

  // Complement with live Yahoo lookup (any company in the world)
  try {
    const yfUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
    const yfRes = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*"
      },
      signal: AbortSignal.timeout(5000)
    });

    if (yfRes.ok) {
      const yfData = await yfRes.json();
      const yfQuotes = (yfData.quotes || [])
        .filter(it => it.symbol && (it.shortname || it.longname))
        .map(it => ({
          symbol: String(it.symbol).slice(0, 20),
          name: String(it.shortname || it.longname).slice(0, 100),
          sector: String(it.quoteType || "Global").slice(0, 50),
          country: String(it.exchangeDispName || it.exchange || "Global").slice(0, 50),
          category: "global_stock",
          tags: [String(it.symbol).toLowerCase()]
        }));

      const seen = new Set(localMatches.map(m => m.symbol));
      for (const item of yfQuotes) {
        if (!seen.has(item.symbol)) {
          seen.add(item.symbol);
          localMatches.push(item);
        }
      }
    }
  } catch (err) {
    // Non-blocking: fall back to local matches
  }

  return res.status(200).json({ results: localMatches.slice(0, 15), total, tradable });
}
