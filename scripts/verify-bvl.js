// Phase 2: verify a curated BVL universe (real Lima exchange tickers) against Yahoo.
// BVL nomenclature: <ROOT><SERIES>C1.LM (common shares). We test every candidate; survivors enter the catalog.
const { writeFileSync } = await import("node:fs");

// Curated BVL roots with series patterns to probe
const BVL_CANDIDATES = [
  // mining
  "BVN", "SCCO.LM", "VOLCABC1.LM", "MINSURI1.LM", "NEXPECC1.LM", "NEXAPEC1.LM", "ATACOC1.LM",
  "CORONAI1.LM", "PODERO1.LM", "CASAPAL1.LM", "SANTAC1.LM", "SIERRA1.LM", "TAMBOGR1.LM",
  "IRLCP1.LM", "MINIRL1.LM", "AUSANGATE1.LM", "PAMPAB1.LM", "MINAND1.LM", "MINQUES1.LM",
  "SUYAMAR1.LM", "ALGAMAR1.LM", "ANTAMINA1.LM", "CHINALCO1.LM", "SHOUGANG1.LM", "TINTAYA1.LM",
  // cement / construction
  "CPACAS1.LM", "CPACASC1.LM", "UNACEMC1.LM", "LARCO1.LM", "COLLPA1.LM", "PAMPP1.LM", "ORMA1.LM",
  "ETERNIT1.LM", "ACEROAC1.LM", "SIDERC1.LM", "FAMESA1.LM",
  // consumption / retail
  "ALICORC1.LM", "BACKUS1.LM", "BACKUSI1.LM", "LINDLEY1.LM", "GLORIAC1.LM", "GLORIA1.LM",
  "LUCH1.LM", "ANDINA1.LM", "INRETAIL1.LM", "SANMI1.LM", "ORALCE1.LM", "PAMOL1.LM", "POMONA1.LM",
  "DANPER1.LM", "AGROIN1.LM", "CAMPOSOL1.LM", "AGRYS1.LM", "UNIONVL1.LM", "PANORAM1.LM",
  // banking / financial / insurance
  "BAP", "CREDIC1.LM", "IFS", "BBVAP1.LM", "BBVAPEC1.LM", "SCOTC1.LM", "COMERC1.LM",
  "CAVALC1.LM", "CAJACU1.LM", "CAVAL2.LM", "CAVAL3.LM", "CAVAL4.LM", "CAVAL5.LM", "CAVAL6.LM",
  "CAJAARE1.LM", "CONFIA1.LM", "ALTERN1.LM", "PRIMAF1.LM", "RIMAC1.LM", "PACIFC1.LM", "POSITI1.LM",
  "INVITA1.LM", "BYSA1.LM", "MAPFRE1.LM", "SEGURO1.LM", "ACCE1.LM", "ANDINO1.LM", "CRECAPC1.LM",
  "IFHD1.LM",
  // energy / utilities
  "ENELC1.LM", "ENELD1.LM", "EGE1.LM", "LUZSUR1.LM", "ENGIE1.LM", "REPSOL1.LM", "HIDRAN1.LM",
  "ELECTRO1.LM", "PLUZ1.LM", "ORAZUL1.LM", "GTP1.LM", "ALTERNA1.LM", "PAMPAE1.LM", "ENAPU1.LM",
  // telecom / tech / media
  "TELEF1.LM", "TELEFBC1.LM", "WOW1.LM", "CLARO1.LM", "GILAT1.LM", "TVTP1.LM", "AISA1.LM",
  "ANDINOI1.LM", "MOVIL1.LM",
  // industrial / transport / misc
  "FERREYC1.LM", "GRAÑA1.LM", "AENZA1.LM", "GYMC1.LM", "RETA1.LM", "CETECO1.LM", "CONTIN1.LM",
  "INCAST1.LM", "SUDAM1.LM", "AEROL1.LM", "VIVA1.LM", "LAMAS1.LM", "QUIMPAC1.LM", "PACIFICO1.LM",
  "MILPO1.LM", "YUMPAG1.LM", "ROSA1.LM", "TEXTEL1.LM", "TRABAJ1.LM", "TREBOL1.LM", "CATERIN1.LM",
  // ETFs / fibras / funds
  "ETFSPCL.LM", "ETFSPCLP.LM", "ETFSPCL.LM", "FIBRAC1.LM", "FIBRAM1.LM", "FIBRAP1.LM", "IFIC1.LM",
  "TX701.LM", "ZENIT1.LM", "ALICORI1.LM", "INRETAILC1.LM",
  // more BVL patterns
  "AUSA1.LM", "AUSTRAC1.LM", "PAMPAEN1.LM", "SEGUROS1.LM", "VOLCANI1.LM"
];

async function verify(sym) {
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1y&interval=1mo`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", "Accept": "*/*" },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    const d = await r.json();
    const res = d?.chart?.result?.[0];
    if (!res || (res.timestamp || []).length === 0) return null;
    return {
      symbol: sym,
      name: res.meta?.longName || res.meta?.shortName || sym,
      currency: res.meta?.currency || "",
      exchange: res.meta?.fullExchangeName || res.meta?.exchangeName || "",
      points: res.timestamp.length
    };
  } catch { return null; }
}

(async () => {
  const uniq = [...new Set(BVL_CANDIDATES)];
  const verified = [], failed = [];
  for (const sym of uniq) {
    const v = await verify(sym);
    if (v) verified.push(v); else failed.push(sym);
    await new Promise(r => setTimeout(r, 150));
  }
  writeFileSync("/tmp/bvl-verified.json", JSON.stringify({ verified, failed }, null, 1));
  console.log("VERIFIED:", verified.length);
  verified.forEach(v => console.log(`  ${v.symbol} | ${v.name} | ${v.exchange} | ${v.points} pts`));
  console.log("FAILED:", failed.length, failed.join(" "));
})();
