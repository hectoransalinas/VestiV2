// src/motor/fitEngine.ts
/**
 * VESTI AI — Fit Engine (v2)
 * Objetivo:
 * - Soportar categorías Shopify + demo + legacy (ES/EN) y normalizarlas a:
 *   "upper" | "pants" | "shoes"
 * - PANTS v1.0 (acordado):
 *   * El talle lo decide SOLO la cintura
 *   * El largo NO cambia talle; solo dispara CHECK_LENGTH (si talle OK)
 *   * Umbrales:
 *       - Cintura: Perfecto 0..3cm de holgura (>=0), Holgado >3, Ajustado <0
 *       - Largo pierna: Perfecto ±2cm, Corto <-2, Largo >2
 */

export type CanonCategory = "upper" | "pants" | "shoes";

/**
 * Mantengo compatibilidad con lo que puede venir de Shopify/demo/histórico.
 * En runtime SIEMPRE lo normalizamos a CanonCategory con normalizeCategory().
 */
export type GarmentCategory =
  | CanonCategory
  | "remera"
  | "camiseta"
  | "buzo"
  | "campera"
  | "upper"
  | "pantalon"
  | "pantalón"
  | "jeans"
  | "pants"
  | "zapatillas"
  | "calzado"
  | "shoes"
  | string;

export type FitWidth = "Perfecto" | "Ajustado" | "Holgado";
export type FitLength = "Corto" | "Perfecto" | "Largo";

export type ZoneWidth = "hombros" | "pecho" | "cintura" | "cadera";
export type ZoneLength = "largoTorso" | "largoPierna" | "pieLargo";

export type Measurements = {
  hombros: number;
  pecho: number;
  cintura: number;
  largoTorso: number;
  largoPierna: number;
  pieLargo: number;  cadera?: number;

};

export type EasePreset = "slim" | "regular" | "oversize";

export interface Garment {
  id?: string | number;
  sizeLabel?: string;
  category: GarmentCategory;
  brand?: string;
  measures: Measurements;
  easePreset?: EasePreset;
  stretchPct: number; // 0..100 (porcentaje)
}

export interface ZoneFitWidth {
  zone: ZoneWidth;
  status: FitWidth;
  delta: number; // holgura efectiva (prenda - cuerpo) en cm (positivo = holgura)
}

export interface ZoneFitLength {
  zone: ZoneLength;
  status: FitLength;
  delta: number; // prenda - cuerpo (positivo = más largo)
}

export interface FitResult {
  category: CanonCategory;
  overall: FitWidth; // estado global (en pants = cintura)
  widths: ZoneFitWidth[];
  lengths: ZoneFitLength[];
  debug?: Record<string, any>;
}

export type RecommendationTag = "OK" | "SIZE_UP" | "SIZE_DOWN" | "CHECK_LENGTH";

export interface Recommendation {
  tag: RecommendationTag;
  title: string;
  message: string;
}

// ------------------------------
// Helpers
// ------------------------------
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeNum(n: any, fallback = 0) {
  // Acepta number o string numérico (viene mucho desde JSON/metafields)
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string") {
    const t = n.trim().replace(",", ".");
    if (t !== "" && !Number.isNaN(Number(t)) && Number.isFinite(Number(t))) return Number(t);
  }
  return fallback;
}

/**
 * Normaliza cualquier input a CanonCategory.
 * Importante: esto es la base para que NO vuelvan los bugs de "pantalon" vs "pants".
 */
export function normalizeCategory(input: GarmentCategory): CanonCategory {
  const s = String(input ?? "")
    .trim()
    .toLowerCase();

  // pants
  if (
    s === "pants" ||
    s === "pantalon" ||
    s === "pantalón" ||
    s === "jeans" ||
    s === "jean" ||
    s === "pantalones" ||
    s.includes("pants")
  ) {
    return "pants";
  }

  // shoes
  if (
    s === "shoes" ||
    s === "zapatillas" ||
    s === "calzado" ||
    s === "zapatos" ||
    s.includes("shoe")
  ) {
    return "shoes";
  }

  // upper (default)
  return "upper";
}

// ------------------------------
// Parámetros base (ease, tolerancias, pesos)
// ------------------------------

type EaseTable = Record<CanonCategory, Record<EasePreset, Measurements>>;
type TolTable = Record<CanonCategory, Measurements>;

const EASE_TABLE: EaseTable = {
	  upper: {
	    slim: { hombros: 0.5, pecho: 2, cintura: 2, largoTorso: 1, largoPierna: 0, pieLargo: 0 },
	    regular: { hombros: 1, pecho: 4, cintura: 4, largoTorso: 1, largoPierna: 0, pieLargo: 0 },
	    oversize: { hombros: 2, pecho: 8, cintura: 8, largoTorso: 1, largoPierna: 0, pieLargo: 0 },
	  },
  // En pants el ease aplicado a cintura se maneja con la misma tabla,
  // pero la regla final de talle es v1.0 por cintura.
	  pants: {
	    slim: { hombros: 0, pecho: 0, cintura: 1, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
	    regular: { hombros: 0, pecho: 0, cintura: 3, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
	    oversize: { hombros: 0, pecho: 0, cintura: 5, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
	  },
  // shoes todavía no usa este motor (lo dejamos neutro para no romper)
	  shoes: {
	    slim: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
	    regular: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
	    oversize: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
	  },
};

const BASE_TOLERANCES: TolTable = {
  upper: { hombros: 1, pecho: 2, cintura: 2, largoTorso: 2, largoPierna: 0, pieLargo: 0 },
  // pants: las tolerancias importantes las definimos en la regla v1.0
  pants: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
  shoes: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0, pieLargo: 0 },
};

// ------------------------------
// Core: computeFit
// ------------------------------

export function computeFit(user: Measurements, garment: Garment): FitResult {
  const cat = normalizeCategory(garment.category);
  // Algunos catálogos (p. ej. shoes) hoy solo tienen "regular".
  // Si llega un preset inexistente, caemos a "regular" para evitar crashes.
  const requestedPreset: EasePreset = garment.easePreset ?? "regular";
  const preset: EasePreset = (EASE_TABLE[cat] && (EASE_TABLE[cat] as any)[requestedPreset])
    ? requestedPreset
    : "regular";
  const ease = EASE_TABLE[cat][preset];
  const stretch = clamp(safeNum(garment.stretchPct, 0), 0, 100) / 100;

  const u: Measurements = {
    hombros: safeNum(user.hombros),
    pecho: safeNum(user.pecho),
    cintura: safeNum(user.cintura),
    largoTorso: safeNum(user.largoTorso),
    largoPierna: safeNum(user.largoPierna),
    pieLargo: safeNum(user.pieLargo),
    cadera: safeNum((user as any).cadera),
  };

  const g: Measurements = {
    hombros: safeNum(garment.measures?.hombros),
    pecho: safeNum(garment.measures?.pecho),
    cintura: safeNum(garment.measures?.cintura),
    largoTorso: safeNum(garment.measures?.largoTorso),
    largoPierna: safeNum(garment.measures?.largoPierna),
    pieLargo: safeNum(garment.measures?.pieLargo),
    cadera: safeNum((garment.measures as any)?.cadera),
  };

  // ---------- PANTS v1.0 ----------
  if (cat === "pants") {
    // Cintura efectiva por elasticidad
    const effectiveWaist = g.cintura * (1 + stretch);
    const deltaWaist = effectiveWaist - u.cintura; // + holgura, - ajustado

    // Para pantalón el "ease" define cuánta holgura todavía consideramos "Perfecto".
    // - slim: tolera menos holgura
    // - oversize: tolera más holgura
    const perfectMax = (EASE_TABLE.pants[preset]?.cintura ?? 3) as number;
    // Perfecto: 0..perfectMax, Holgado: >perfectMax, Ajustado: <0
    const cinturaStatus: FitWidth =
      deltaWaist < 0 ? "Ajustado" : deltaWaist <= perfectMax ? "Perfecto" : "Holgado";

    // Largo pierna: Perfecto ±2
    // Si falta dato (0), no forzamos alerta (evita bug de quedar siempre "Largo")
    let deltaLen = g.largoPierna - u.largoPierna;
    let largoStatus: FitLength = "Perfecto";

    if (g.largoPierna > 0 && u.largoPierna > 0) {
      // delta = prenda - cuerpo (positivo => a la prenda le sobra largo)
      deltaLen = g.largoPierna - u.largoPierna;
      largoStatus = deltaLen < -2 ? "Corto" : deltaLen <= 2 ? "Perfecto" : "Largo";
    } else {
      deltaLen = 0;
      largoStatus = "Perfecto";
    }

// Cadera (opcional): solo si hay datos válidos
const hasHip = (g.cadera ?? 0) > 0 && (u.cadera ?? 0) > 0;
const effectiveHip = hasHip ? (g.cadera as number) * (1 + stretch) : 0;
const deltaHip = hasHip ? effectiveHip - (u.cadera as number) : 0;

// Umbrales acordados:
// - Perfecto: 0..2cm de holgura
// - Holgado: >2cm
// - Ajustado: <0cm (prenda más chica que el cuerpo)
const hipPerfectMax = preset === "slim" ? 3 : 2;
const caderaStatus: FitWidth = !hasHip
  ? "Perfecto"
  : deltaHip < 0
  ? "Ajustado"
  : deltaHip <= hipPerfectMax
  ? "Perfecto"
  : "Holgado";

const widthsOut: ZoneFitWidth[] = [
  { zone: "cintura", status: cinturaStatus, delta: round2(deltaWaist) },
  ...(hasHip ? [{ zone: "cadera" as const, status: caderaStatus, delta: round2(deltaHip) }] : []),
];

return {
  category: cat,
  overall: cinturaStatus,
  widths: widthsOut,
  lengths: [{ zone: "largoPierna", status: largoStatus, delta: round2(deltaLen) }],
  debug: {
    catRaw: garment.category,
    cat,
    preset,
    stretchPct: garment.stretchPct,
    effectiveWaist,
    deltaWaist,
    hasHip,
    effectiveHip,
    deltaHip,
    deltaLen,
    uLargoPierna: u.largoPierna,
    gLargoPierna: g.largoPierna,
  },
};

  }

  // ---------- SHOES v1.0 (solo largo de pie) ----------
  if (cat === "shoes") {
    // delta = calzado - pie (positivo => sobra, negativo => queda corto)
    const delta = g.pieLargo - u.pieLargo;

    // Para shoes, mantenemos la semántica del motor:
    // - lengths.pieLargo: Corto / Perfecto / Largo
    // - overall (FitWidth) lo usamos como señal visual general
    const lengthStatus: FitLength =
      delta < 0 ? "Corto" : delta <= 0.6 ? "Perfecto" : "Largo";

    const overall: FitWidth =
      lengthStatus === "Corto"
        ? "Ajustado"
        : lengthStatus === "Largo"
        ? "Holgado"
        : "Perfecto";

    return {
      category: cat,
      overall,
      widths: [],
      lengths: [{ zone: "pieLargo", status: lengthStatus, delta: round2(delta) }],
      debug: {
        catRaw: garment.category,
        cat,
        preset,
        stretchPct: garment.stretchPct,
        delta,
        uPieLargo: u.pieLargo,
        gPieLargo: g.pieLargo,
      },
    };
  }

  // ---------- UPPER (lógica existente simplificada) ----------
  // Se calcula holgura efectiva por elasticidad + ease.
  const widths: ZoneWidth[] = ["hombros", "pecho", "cintura"];
  const lengths: ZoneLength[] = ["largoTorso"];

  const widthsFit: ZoneFitWidth[] = widths.map((z) => {
    const baseTol = BASE_TOLERANCES[cat][z];
    const easeCm = ease[z];
    const effectiveGarment = g[z] * (1 + stretch) + easeCm;
    const delta = effectiveGarment - u[z];

    // Regla genérica:
    // - Ajustado si delta < -tol
    // - Perfecto si |delta| <= tol
    // - Holgado si delta > tol
    const tol = baseTol;
    const status: FitWidth =
      delta < -tol ? "Ajustado" : delta > tol ? "Holgado" : "Perfecto";

    return { zone: z, status, delta: round2(delta) };
  });

  const lengthsFit: ZoneFitLength[] = lengths.map((z) => {
    const tol = BASE_TOLERANCES[cat][z];
    const delta = (g[z] + ease[z]) - u[z];
    const status: FitLength =
      delta < -tol ? "Corto" : delta > tol ? "Largo" : "Perfecto";
    return { zone: z, status, delta: round2(delta) };
  });

  // overall: si hay algún "Ajustado" prioriza Ajustado; si no, si hay "Holgado" => Holgado; si no => Perfecto
  let overall: FitWidth = "Perfecto";
  if (widthsFit.some((w) => w.status === "Ajustado")) overall = "Ajustado";
  else if (widthsFit.some((w) => w.status === "Holgado")) overall = "Holgado";

  return {
    category: cat,
    overall,
    widths: widthsFit,
    lengths: lengthsFit,
    debug: { catRaw: garment.category, cat, preset, stretchPct: garment.stretchPct },
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ------------------------------
// Recomendación
// ------------------------------


function cleanSizeLabel(label?: string) {
  const raw = String(label ?? "").trim();
  if (!raw) return "Único";
  if (/^default\s*title$/i.test(raw)) return "Único";
  if (/^default$/i.test(raw)) return "Único";
  return raw;
}


export function makeRecommendation(params: {
  category: GarmentCategory;
  garment: Garment;
  fit: FitResult;
}): Recommendation {
  const cat = normalizeCategory(params.category ?? params.garment.category);
  const garment = params.garment;
  const fit = params.fit;

  // ✅ PANTS v1.0 — solo cintura decide talle; largo solo warning
  if (cat === "pants") {
    const cintura = fit.widths.find((w) => w.zone === "cintura");
    const largo = fit.lengths.find((l) => l.zone === "largoPierna");
    const cadera = fit.widths.find((w) => w.zone === "cadera");

    const cinturaStatus: FitWidth = cintura?.status ?? "Perfecto";
    const largoStatus: FitLength = largo?.status ?? "Perfecto";
    const hasHip = !!cadera;
    const caderaStatus: FitWidth = cadera?.status ?? "Perfecto";
    const caderaDelta: number = typeof cadera?.delta === "number" ? cadera.delta : 0;
    // Cadera crítica: prenda queda >5cm más chica que el cuerpo
    const hipCritical = hasHip && caderaDelta < -5;

    // Tag principal por cintura
    let tag: RecommendationTag = "OK";
    if (cinturaStatus === "Ajustado") tag = "SIZE_UP";
    else if (cinturaStatus === "Holgado") tag = "SIZE_DOWN";

    // CHECK_LENGTH solo si talle OK (acordado)
    if (tag === "OK" && largoStatus !== "Perfecto") tag = "CHECK_LENGTH";

    // Si la cadera es crítica, priorizamos subir talle aunque la cintura esté OK.
    if (hipCritical) tag = "SIZE_UP";

    // Mensajes por caso (sin pecho/hombros)
    const sizeLabel = ` ${cleanSizeLabel(garment.sizeLabel)}`;

    const cinturaLine =
      cinturaStatus === "Perfecto"
        ? "La cintura se ve bien para tus medidas."
        : cinturaStatus === "Ajustado"
        ? "La cintura se ve ajustada para tus medidas."
        : "La cintura se ve holgada para tus medidas.";

    const caderaLine = !hasHip ? "" :
      caderaStatus === "Perfecto"
        ? ""
        : caderaStatus === "Ajustado"
        ? "Revisá la cadera: podría quedarte ajustado."
        : "Revisá la cadera: podría quedarte holgado.";

    const largoLine =
      largoStatus === "Perfecto"
        ? ""
        : largoStatus === "Corto"
        ? "Revisá el largo: podría quedarte corto."
        : "Revisá el largo: podría quedarte largo.";

    if (tag === "SIZE_UP") {
      return {
        tag,
        title: "Talle sugerido: subir",
        message:
          `Este talle${sizeLabel} podría quedarte ajustado en la cintura. ` +
          "Probá compararlo con un talle más. " +
          ((caderaLine ? ` ${caderaLine}` : "") + ((caderaLine ? ` ${caderaLine}` : "") + (largoLine ? ` ${largoLine}` : ""))),
      };
    }

    if (tag === "SIZE_DOWN") {
      return {
        tag,
        title: "Talle sugerido: bajar",
        message:
          `Este talle${sizeLabel} se ve holgado en la cintura. ` +
          "Si preferís un calce más al cuerpo, compará con un talle menos. " +
          ((caderaLine ? ` ${caderaLine}` : "") + ((caderaLine ? ` ${caderaLine}` : "") + (largoLine ? ` ${largoLine}` : ""))),
      };
    }

    if (tag === "CHECK_LENGTH") {
      return {
        tag,
        title: "Revisá el largo antes de comprar",
        message:
          `En cintura, este talle${sizeLabel} se ve bien. ` +
          ((caderaLine ? `${caderaLine} ` : "") + (largoLine || "Revisá el largo para confirmar cómo te gusta que caiga.")),
      };
    }

    // OK
    return {
      tag,
      title: "Este talle parece adecuado para vos",
      message:
        `En cintura, este talle${sizeLabel} se ve bien para tus medidas. ` +
        ((caderaLine ? ` ${caderaLine}` : "") + ((caderaLine ? ` ${caderaLine}` : "") + (largoLine ? ` ${largoLine}` : ""))),
    };
  }

  // ✅ SHOES — decide por largo de pie
  if (cat === "shoes") {
    const pie = fit.lengths.find((l) => l.zone === "pieLargo");
    const pieStatus: FitLength = pie?.status ?? "Perfecto";

    let tag: RecommendationTag = "OK";
    if (pieStatus === "Corto") tag = "SIZE_UP";
    else if (pieStatus === "Largo") tag = "SIZE_DOWN";

    const sizeLabel = ` ${cleanSizeLabel(garment.sizeLabel)}`;

    if (tag === "SIZE_UP") {
      return {
        tag,
        title: "Talle sugerido: subir",
        message:
          `Este talle${sizeLabel} podría quedarte corto. ` +
          "Para estar cómodo, compará con un talle más.",
      };
    }

    if (tag === "SIZE_DOWN") {
      return {
        tag,
        title: "Talle sugerido: bajar",
        message:
          `Este talle${sizeLabel} se ve largo. ` +
          "Si preferís un calce más justo del calzado, compará con un talle menos.",
      };
    }

    return {
      tag,
      title: "Este talle parece adecuado para vos",
      message: `Este talle${sizeLabel} se ve bien para tu largo de pie.`,
    };
  }

  // ✅ UPPER — recomendación simple y coherente
  // ✅ UPPER — en prendas superiores, cintura y largoTorso son advertencias (no cambian talle)
  const overall: FitWidth = (() => {
    if (cat !== "upper") return fit.overall;

    const decisiveZones: ZoneWidth[] = ["hombros", "pecho"];
    const decisive = fit.widths.filter((w) => decisiveZones.includes(w.zone));

    const hasTight = decisive.some((w) => w.status === "Ajustado");
    const hasLoose = decisive.some((w) => w.status === "Holgado");

    return hasTight ? "Ajustado" : hasLoose ? "Holgado" : "Perfecto";
  })();

  if (overall === "Ajustado") {
    return {
      tag: "SIZE_UP",
      title: "Talle sugerido: subir",
      message:
        "Vemos una o más zonas ajustadas. Si querés estar más cómodo/a, compará con un talle más.",
    };
  }

  if (overall === "Holgado") {
    return {
      tag: "SIZE_DOWN",
      title: "Talle sugerido: bajar",
      message:
        "Vemos holgura en alguna zona. Si preferís un calce más al cuerpo, compará con un talle menos.",
    };
  }
  // ✅ UPPER — si el talle está OK por hombros/pecho pero hay advertencias,
  // mostramos mensaje de revisión sin cambiar el talle.
  if (cat === "upper" && overall === "Perfecto") {
    const cintura = fit.widths.find((w) => w.zone === "cintura")?.status ?? "Perfecto";
    const largoTorso = fit.lengths.find((l) => l.zone === "largoTorso")?.status ?? "Perfecto";

    const hasWarn = cintura !== "Perfecto" || largoTorso !== "Perfecto";

    if (hasWarn) {
      const parts: string[] = [];
      if (cintura !== "Perfecto") parts.push(`cintura: ${cintura.toLowerCase()}`);
      if (largoTorso !== "Perfecto") parts.push(`largo torso: ${largoTorso.toLowerCase()}`);

      return {
        tag: "OK",
        title: "Revisá el calce antes de comprar",
        message:
          "El talle se ve bien en hombros y pecho. " +
          `Vemos una alerta en ${parts.join(" y ")}. ` +
          "Podés comparar con otro talle si buscás un calce distinto, pero no es necesario por defecto.",
      };
    }
  }


  return {
    tag: "OK",
    title: "Este talle parece adecuado para vos",
    message:
      "En general el calce se ve bien para tus medidas. Revisá las zonas clave para confirmar tu preferencia.",
  };
}
