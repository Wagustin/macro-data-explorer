// Does a headline really talk about a company? The classifier's company tags are not
// reliable on their own, so a tag only counts if the text names the company or a brand.

const fold = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Names people use in the press, by nemónico (any of the issuer's values)
const ALIAS = {
  AENZAC1: ["aenza", "grana y montero", "graña y montero"],
  ALICORC1: ["alicorp"], AIHC1: ["andino investment"], AUSTRAC1: ["austral"],
  BBVAC1: ["bbva"], CREDITC1: ["bcp", "banco de credito", "credicorp"],
  INTERBC1: ["interbank", "intercorp"], BPICHC1: ["pichincha"],
  CARTAVC1: ["cartavio"], CASAGRC1: ["casa grande"], CPACASI1: ["pacasmayo"],
  SNJUANC1: ["cerveceria san juan"], BVN: ["buenaventura"], PODERC1: ["poderosa"],
  MOROCOC1: ["morococha"], CORAREC1: ["aceros arequipa"], CRETEXC1: ["creditex"],
  HIDRA2C1: ["hidrandina"], POMALCC1: ["pomalca"], ELCOMEI1: ["el comercio"],
  SIDERC1: ["siderperu", "sider peru"], ENGIEC1: ["engie"], ETNAI1: ["etna"],
  FERREYC1: ["ferreycorp", "ferreyros"], FIBPRIME: ["coril"],
  INRETC1: ["inretail", "plaza vea", "inkafarma", "mifarma"],
  IPCHAC1: ["chancay"], GLORIAI1: ["gloria"], LUSURC1: ["luz del sur"],
  MINSURI1: ["minsur"], ATACOAC1: ["atacocha"], NEXAPEC1: ["nexa"],
  EXALMC1: ["exalmar"], RIMSEGC1: ["rimac"], SCOTIAC1: ["scotiabank"],
  CVERDEC1: ["cerro verde"], BROCALC1: ["brocal"],
  SPCCPI1: ["southern copper", "southern peru"], UNACEMC1: ["unacem"],
  BACKUAC1: ["backus"], VOLCAAC1: ["volcan"],
};

const GENERIC = new Set(["compania", "minas", "minera", "sociedad", "anonima", "abierta", "corporacion", "corp",
  "grupo", "empresa", "banco", "peru", "peruana", "peruanas", "internacional", "industrias", "financiera",
  "holding", "servicios", "inversiones", "cementos", "energia", "electrica", "resources", "sucursal", "seguros"]);

export function aliasesOf(emisor) {
  const out = new Set();
  for (const v of emisor?.valores || []) for (const a of ALIAS[v.nemonico] || []) out.add(fold(a));
  if (!out.size) {
    for (const w of fold(emisor?.razonSocial).replace(/[^a-z ]/g, " ").split(/\s+/)) if (w.length >= 5 && !GENERIC.has(w)) out.add(w);
  }
  return [...out];
}

export function mencionaEmpresa(texto, emisor) {
  const t = ` ${fold(texto).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  return aliasesOf(emisor).some((a) => t.includes(` ${a.replace(/[^a-z0-9 ]/g, " ")} `));
}
