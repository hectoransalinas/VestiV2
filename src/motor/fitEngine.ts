// src/motor/fitEngine.ts
/**
 * VESTI AI — Fit Engine
 * - Normaliza categorías (Shopify/demo) a: "upper" | "pants" | "shoes"
 * - PANTS: la cintura manda el talle; el largo solo agrega advertencia
 */

export type FitWidth = "Perfecto" | "Ajustado" | "Holgado";
export type FitLength = "Corto" | "Perfecto" | "Largo";

export type ZoneWidth = "hombros" | "pecho" | "cintura";
export type ZoneLength = "largoTorso" | "largoPierna";

export type Measurements = {
  hombros: number;
  pecho: number;
  cintura: number;
  largoTorso: number;
  largoPierna: number;
};

// Aceptamos valores viejos (demo) y nuevos (Shopify) sin romper
export type GarmentCategory =
  | "upper"
  | "pants"
  | "shoes"
  | "remera"
  | "camiseta"
  | "buzo"
  | "hoodie"
  | "campera"
  | "jacket"
  | "pantalon"
  | "pantalón"
  | "jeans"
  | "denim"
  | "zapatillas"
  | "zapatilla"
  | "calzado";

export type EasePreset = "slim" | "regular" | "oversize";

export interface Garment {
  id: string;
  name: string;
  brand?: string;
  category: GarmentCategory;
  sizeLabel: string;
  measures: Partial<Measurements>;
  stretchPct: number; // 0-100
  easePreset?: EasePreset;
}

export interface ZoneFitWidth {
  kind: "width";
  zone: ZoneWidth;
  delta: number;
  status: FitWidth;
  color: string;
}

export interface ZoneFitLength {
  kind: "length";
  zone: ZoneLength;
  delta: number;
  status: FitLength;
  color: string;
}

export interface WidthBreak {
  zone: ZoneWidth;
  body: number;
  garment: number;
  baseEase: number;
  tol: number;
  weight: number;
  scoreUnit: number;
  contribution: number;
  status: FitWidth;
}

export interface LengthBreak {
  zone: ZoneLength;
  body: number;
  garment: number;
  baseEase: number;
  tol: number;
  weight: number;
  scoreUnit: number;
  contribution: number;
  status: FitLength;
}

export interface FitResult {
  overall: FitWidth;
  widths: ZoneFitWidth[];
  lengths: ZoneFitLength[];
  debug: {
    widths: WidthBreak[];
    lengths: LengthBreak[];
    score: number;
    wsum: number;
    norm: number;
  };
}

export type RecTag = "OK" | "SIZE_UP" | "SIZE_DOWN" | "CHECK_LENGTH";

export interface Recommendation {
  tag: RecTag;
  title: string;
  message: string;
}

/** Categorías canónicas internas del motor */
export type CanonCategory = "upper" | "pants" | "shoes";

/** Normaliza categorías de Shopify/demo a categorías canónicas */
export function normalizeCategory(raw: any): CanonCategory {
  const c = String(raw ?? "").trim().toLowerCase();

  // pants
  if (
    ["pants", "pantalon", "pantalón", "jeans", "denim", "trousers", "pant"].includes(c)
  ) {
    return "pants";
  }

  // shoes
  if (
    ["shoes", "shoe", "zapatilla", "zapatillas", "calzado", "sneakers", "botas", "boots"].includes(c)
  ) {
    return "shoes";
  }

  // upper (default)
  if (
    [
      "upper",
      "top",
      "remera",
      "camiseta",
      "shirt",
      "tshirt",
      "buzo",
      "hoodie",
      "campera",
      "jacket",
    ].includes(c)
  ) {
    return "upper";
  }

  return "upper";
}

// ------------------------------
// Helpers / Constantes
// ------------------------------
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

const COL_OK = "#16a34a";
const COL_TIGHT = "#ef4444";
const COL_LOOSE = "#eab308";

// ------------------------------
// Parámetros (ease, tolerancias, pesos)
// ------------------------------
type EaseTable = Record<CanonCategory, Record<EasePreset, Measurements>>;
type TolTable = Record<CanonCategory, Measurements>;
type Ww = Record<CanonCategory, Record<ZoneWidth, number>>;
type Lw = Record<CanonCategory, Record<ZoneLength, number>>;

const EASE_TABLE: EaseTable = {
  upper: {
    slim: { hombros: 0.5, pecho: 2, cintura: 2, largoTorso: 1, largoPierna: 0 },
    regular: { hombros: 1, pecho: 4, cintura: 4, largoTorso: 1, largoPierna: 0 },
    oversize: { hombros: 2, pecho: 8, cintura: 8, largoTorso: 1, largoPierna: 0 },
  },
  pants: {
    slim: { hombros: 0, pecho: 0, cintura: 1, largoTorso: 0, largoPierna: 0.5 },
    regular: { hombros: 0, pecho: 0, cintura: 2, largoTorso: 0, largoPierna: 1 },
    oversize: { hombros: 0, pecho: 0, cintura: 3, largoTorso: 0, largoPierna: 1.5 },
  },
  shoes: {
    slim: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0 },
    regular: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0 },
    oversize: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0 },
  },
};

const BASE_TOLERANCES: TolTable = {
  upper: { hombros: 1.5, pecho: 4, cintura: 4, largoTorso: 2, largoPierna: 0 },
  pants: { hombros: 0, pecho: 0, cintura: 3, largoTorso: 0, largoPierna: 1.5 },
  shoes: { hombros: 0, pecho: 0, cintura: 0, largoTorso: 0, largoPierna: 0 },
};

const WIDTH_WEIGHTS: Ww = {
  upper: { hombros: 1.4, pecho: 1.6, cintura: 1.2 },
  pants: { hombros: 0, pecho: 0, cintura: 2.2 }, // cintura manda
  shoes: { hombros: 0, pecho: 0, cintura: 0 },
};

const LENGTH_WEIGHTS: Lw = {
  upper: { largoTorso: 0.9, largoPierna: 0 },
  pants: { largoTorso: 0, largoPierna: 1.2 },
  shoes: { largoTorso: 0, largoPierna: 0 },
};

// offsets opcionales por marca (si no se usan, quedan en 0)
const BRAND_WIDTH_OFFSETS: Record<string, Partial<Measurements>> = {
  generic: {},
};

// ------------------------------
// Motor principal
// ------------------------------
export function computeFit(user: Measurements, g: Garment): FitResult {
  const category = normalizeCategory(g.category);
  const preset: EasePreset = g.easePreset ?? "regular";
  const ease = EASE_TABLE[category][preset];
  const tolBase = BASE_TOLERANCES[category];
  const stretch = clamp(g.stretchPct ?? 0, 0, 100) / 100;

  const widths: ZoneWidth[] = category === "pants" ? ["cintura"] : ["hombros", "pecho", "cintura"];
  const lengths: ZoneLength[] = category === "pants" ? ["largoPierna"] : ["largoTorso"];

  const brandKey = String(g.brand ?? "generic").toLowerCase();
  const brandOff = BRAND_WIDTH_OFFSETS[brandKey] || BRAND_WIDTH_OFFSETS.generic;

  const widthsFit: ZoneFitWidth[] = [];
  const widthsDbg: WidthBreak[] = [];
  const lengthsFit: ZoneFitLength[] = [];
  const lengthsDbg: LengthBreak[] = [];

  // ---- Ancho
  widths.forEach((z) => {
    const body = (user as any)[z] as number;
    const garment = (g.measures as any)[z] as number | undefined;

    const baseEase = (ease as any)[z] ?? 0;
    const tolZ = (tolBase as any)[z] ?? 1.0;
    const brandDelta = (brandOff as any)[z] ?? 0;

    const wght = (WIDTH_WEIGHTS[category] as any)[z] ?? 0;

    // Si faltan datos, no penalizamos
    if (!Number.isFinite(body) || !Number.isFinite(garment as any) || !garment || !body) {
      widthsFit.push({ kind: "width", zone: z, delta: 0, status: "Perfecto", color: COL_OK });
      widthsDbg.push({
        zone: z,
        body: Number.isFinite(body) ? body : 0,
        garment: Number.isFinite(garment as any) ? (garment as number) : 0,
        baseEase,
        tol: tolZ,
        weight: wght,
        scoreUnit: 0,
        contribution: 0,
        status: "Perfecto",
      });
      return;
    }

    const delta = (garment as number) - body + brandDelta;
    const fromIdeal = delta - baseEase;

    let status: FitWidth = "Perfecto";
    if (fromIdeal < -tolZ) status = "Ajustado";
    else if (fromIdeal > tolZ) status = "Holgado";

    // Stretch suaviza penalización por ajustado
    const effectiveTol = tolZ * (1 + stretch * 0.5);
    const unit = clamp(fromIdeal / effectiveTol, -2, 2);
    const contribution = unit * wght;

    const color = status === "Perfecto" ? COL_OK : status === "Ajustado" ? COL_TIGHT : COL_LOOSE;

    widthsFit.push({ kind: "width", zone: z, delta, status, color });
    widthsDbg.push({
      zone: z,
      body,
      garment: garment as number,
      baseEase,
      tol: tolZ,
      weight: wght,
      scoreUnit: unit,
      contribution,
      status,
    });
  });

  // ---- Largo
  lengths.forEach((z) => {
    const body = (user as any)[z] as number;
    const garment = (g.measures as any)[z] as number | undefined;

    const baseEase = (ease as any)[z] ?? 0;
    const tolZ = (tolBase as any)[z] ?? 1.0;
    const wght = (LENGTH_WEIGHTS[category] as any)[z] ?? 0;

    if (!Number.isFinite(body) || !Number.isFinite(garment as any) || !garment || !body) {
      lengthsFit.push({ kind: "length", zone: z, delta: 0, status: "Perfecto", color: COL_OK });
      lengthsDbg.push({
        zone: z,
        body: Number.isFinite(body) ? body : 0,
        garment: Number.isFinite(garment as any) ? (garment as number) : 0,
        baseEase,
        tol: tolZ,
        weight: wght,
        scoreUnit: 0,
        contribution: 0,
        status: "Perfecto",
      });
      return;
    }

    const delta = (garment as number) - body;
    const fromIdeal = delta - baseEase;

    let status: FitLength = "Perfecto";
    if (fromIdeal < -tolZ) status = "Corto";
    else if (fromIdeal > tolZ) status = "Largo";

    const unit = clamp(fromIdeal / tolZ, -2, 2);
    const contribution = unit * wght;

    const color = status === "Perfecto" ? COL_OK : status === "Corto" ? COL_TIGHT : COL_LOOSE;

    lengthsFit.push({ kind: "length", zone: z, delta, status, color });
    lengthsDbg.push({
      zone: z,
      body,
      garment: garment as number,
      baseEase,
      tol: tolZ,
      weight: wght,
      scoreUnit: unit,
      contribution,
      status,
    });
  });

  // ---- Agregación global (útil para upper). En pants, se sobrescribe por cintura.
  let score = 0;
  let wsum = 0;

  widthsDbg.forEach((w) => {
    score += w.contribution;
    wsum += w.weight;
  });
  lengthsDbg.forEach((l) => {
    score += l.contribution;
    wsum += l.weight;
  });

  const norm = wsum > 0 ? score / wsum : 0;

  let overall: FitWidth = "Perfecto";
  if (norm <= -0.15) overall = "Ajustado";
  else if (norm >= 0.15) overall = "Holgado";

  // 🎯 Regla obligatoria: en pants el calce global es la cintura
  if (category === "pants") {
    const cintura = widthsFit.find((w) => w.zone === "cintura");
    if (cintura) overall = cintura.status;
  }

  return {
    overall,
    widths: widthsFit,
    lengths: lengthsFit,
    debug: { widths: widthsDbg, lengths: lengthsDbg, score, wsum, norm },
  };
}

// ------------------------------
// Recomendación
// ------------------------------
export function makeRecommendation(params: {
  category: GarmentCategory;
  garment: Garment;
  fit: FitResult;
}): Recommendation {
  const category = normalizeCategory(params.category ?? params.garment?.category);
  const { garment, fit } = params;

  // ✅ PANTS: cintura manda + largo advierte
  if (category === "pants") {
    const cintura = fit.widths.find((w) => w.zone === "cintura")?.status;
    const largo = fit.lengths.find((l) => l.zone === "largoPierna")?.status;

    if (cintura === "Ajustado") {
      return {
        tag: "SIZE_UP",
        title: "Mejor un talle más",
        message:
          `La cintura se ve ajustada para tus medidas. ` +
          (largo && largo !== "Perfecto" ? `Además, el largo de pierna se percibe ${largo.toLowerCase()}. ` : "") +
          "Te recomendamos probar un talle más para mayor comodidad.",
      };
    }

    if (cintura === "Holgado") {
      return {
        tag: "SIZE_DOWN",
        title: "Podrías bajar un talle",
        message:
          `La cintura se ve algo holgada para tus medidas. ` +
          (largo && largo !== "Perfecto" ? `Además, el largo de pierna se percibe ${largo.toLowerCase()}. ` : "") +
          "Si preferís un calce más prolijo, compará con un talle menos.",
      };
    }

    // cintura perfecto → mirar largo
    if (largo && largo !== "Perfecto") {
      return {
        tag: "CHECK_LENGTH",
        title: "Revisá el largo de pierna",
        message:
          `La cintura calza bien en este talle, pero el largo de pierna se percibe ${largo.toLowerCase()}. ` +
          "Revisá si preferís que el pantalón quede más corto o más largo antes de comprar.",
      };
    }

    return {
      tag: "OK",
      title: "Talle recomendado",
      message: `Este talle ${garment.sizeLabel ?? ""} tiene un calce razonable para tus medidas (cintura y largo).`,
    };
  }

  // ✅ UPPER (lógica general)
  const widths = fit.widths || [];
  const lengths = fit.lengths || [];
  const norm = typeof fit.debug?.norm === "number" ? fit.debug.norm : 0;

  const problemWidths = widths.filter((z) => z.status !== "Perfecto");
  const tightWidths = widths.filter((z) => z.status === "Ajustado");
  const looseWidths = widths.filter((z) => z.status === "Holgado");

  const problemLengths = lengths.filter((z) => z.status !== "Perfecto");

  const tightCount = tightWidths.length;
  const looseCount = looseWidths.length;

  // Caso ideal
  if (fit.overall === "Perfecto" && Math.abs(norm) < 0.15 && problemWidths.length === 0 && problemLengths.length === 0) {
    return {
      tag: "OK",
      title: "Talle recomendado",
      message: `El talle ${garment.sizeLabel ?? ""} tiene un calce equilibrado para tus medidas.`,
    };
  }

  // Mayormente ajustado
  if (fit.overall === "Ajustado" || norm <= -0.2 || tightCount >= 2) {
    const zonas = tightWidths.map((z) => z.zone).join(", ");
    return {
      tag: "SIZE_UP",
      title: "Mejor un talle más",
      message:
        zonas.length > 0
          ? `Este talle tiende a quedar ajustado en ${zonas}. Te conviene probar un talle más.`
          : "Este talle se percibe algo ajustado en varias zonas. Te conviene considerar un talle más.",
    };
  }

  // Mayormente holgado
  if (fit.overall === "Holgado" || norm >= 0.2 || looseCount >= 2) {
    const zonas = looseWidths.map((z) => z.zone).join(", ");
    return {
      tag: "SIZE_DOWN",
      title: "Podrías bajar un talle",
      message:
        zonas.length > 0
          ? `Este talle queda algo holgado en ${zonas}. Podrías bajar un talle.`
          : "Este talle se percibe algo holgado en varias zonas. Un talle menos podría quedarte mejor.",
    };
  }

  // Problemas de largo
  if (problemLengths.length > 0) {
    const zonas = problemLengths.map((z) => `${z.zone} (${z.status})`).join(", ");
    return {
      tag: "CHECK_LENGTH",
      title: "Revisá el largo",
      message: `El largo puede ser un punto a revisar (${zonas}).`,
    };
  }

  return {
    tag: "OK",
    title: "Calce aceptable",
    message: "El calce es razonable. Revisá el detalle por zonas para confirmar tu preferencia.",
  };
}
