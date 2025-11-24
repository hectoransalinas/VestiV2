// src/motor/fitEngine.ts

// ------------------------------
// Tipos base
// ------------------------------
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

export type GarmentCategory = "remera" | "buzo" | "pantalon";

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

// ------------------------------
// Estructuras de resultado
// ------------------------------
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

// ------------------------------
// Recomendación de talle
// ------------------------------
export type RecTag = "OK" | "SIZE_UP" | "SIZE_DOWN" | "CHECK_LENGTH";

export interface Recommendation {
  tag: RecTag;
  title: string;
  message: string;
}

// ------------------------------
// Configuración (Equilibrada)
// ------------------------------
const COL_OK = "#22c55e"; // verde
const COL_TIGHT = "#ef4444"; // rojo
const COL_LOOSE = "#eab308"; // amarillo

// tolerancias base por categoría (en cm)
const BASE_TOLERANCES: Record<GarmentCategory, Partial<Measurements>> = {
  remera: { hombros: 0.8, pecho: 2.0, cintura: 2.0, largoTorso: 1.0 },
  buzo: { hombros: 1.0, pecho: 2.5, cintura: 2.5, largoTorso: 1.0 },
  pantalon: { cintura: 2.0, largoPierna: 1.0 },
};

// “ease” (holgura objetivo) según categoría y preset
const EASE_TABLE: Record<
  GarmentCategory,
  Record<EasePreset, Measurements>
> = {
  remera: {
    slim: {
      hombros: 0.5,
      pecho: 2,
      cintura: 2,
      largoTorso: 1,
      largoPierna: 0,
    },
    regular: {
      hombros: 1,
      pecho: 1,
      cintura: 2,
      largoTorso: 1,
      largoPierna: 0,
    },
    oversize: {
      hombros: 2,
      pecho: 8,
      cintura: 8,
      largoTorso: 1,
      largoPierna: 0,
    },
  },
  buzo: {
    slim: {
      hombros: 0.5,
      pecho: 3,
      cintura: 3,
      largoTorso: 1,
      largoPierna: 0,
    },
    regular: {
      hombros: 1,
      pecho: 5,
      cintura: 5,
      largoTorso: 1,
      largoPierna: 0,
    },
    oversize: {
      hombros: 2,
      pecho: 9,
      cintura: 9,
      largoTorso: 1,
      largoPierna: 0,
    },
  },
  pantalon: {
    slim: {
      hombros: 0,
      pecho: 0,
      cintura: 1,
      largoTorso: 0,
      largoPierna: 0.5,
    },
    regular: {
      hombros: 0,
      pecho: 0,
      cintura: 2,
      largoTorso: 0,
      largoPierna: 1,
    },
    oversize: {
      hombros: 0,
      pecho: 0,
      cintura: 3,
      largoTorso: 0,
      largoPierna: 1.5,
    },
  },
};

// pesos de importancia por zona
const WIDTH_WEIGHTS: Record<
  GarmentCategory,
  Record<ZoneWidth, number>
> = {
  remera: { hombros: 1.4, pecho: 1.6, cintura: 1.2 },
  buzo: { hombros: 1.3, pecho: 1.7, cintura: 1.1 },
  pantalon: { hombros: 0, pecho: 0, cintura: 1.8 },
};

const LENGTH_WEIGHTS: Record<
  GarmentCategory,
  Record<ZoneLength, number>
> = {
  remera: { largoTorso: 0.8, largoPierna: 0 },
  buzo: { largoTorso: 0.9, largoPierna: 0 },
  pantalon: { largoTorso: 0, largoPierna: 1.2 },
};

// offsets por marca (ejemplo, podés afinarlos luego)
const BRAND_WIDTH_OFFSETS: Record<string, Partial<Measurements>> = {
  runx: { pecho: 1, hombros: 0.5 },
  warmco: { pecho: -0.5, cintura: -0.5 },
  generic: {},
};

// helper: clamp
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// ------------------------------
// Motor principal: computeFit
// ------------------------------
export function computeFit(
  user: Measurements,
  g: Garment
): FitResult {
  const preset = g.easePreset ?? "regular";
  const ease = EASE_TABLE[g.category][preset];
  const tolBase = BASE_TOLERANCES[g.category];
  const stretch = clamp(g.stretchPct, 0, 100) / 100;

  const widths: ZoneWidth[] =
    g.category === "pantalon"
      ? ["cintura"]
      : ["hombros", "pecho", "cintura"];
  const lengths: ZoneLength[] =
    g.category === "pantalon" ? ["largoPierna"] : ["largoTorso"];

  const brandKey = (g.brand || "generic").toLowerCase();
  const brandOff = BRAND_WIDTH_OFFSETS[brandKey] || {};

  const widthsFit: ZoneFitWidth[] = [];
  const widthsDbg: WidthBreak[] = [];
  const lengthsFit: ZoneFitLength[] = [];
  const lengthsDbg: LengthBreak[] = [];

  // Ancho
  widths.forEach((z) => {
    const body = (user as any)[z] as number;
    const garment =
      (g.measures as any)[z] != null
        ? ((g.measures as any)[z] as number)
        : 0;
    const baseEase = (ease as any)[z] ?? 0;
    const tolZ =
      (tolBase as any)[z] != null
        ? ((tolBase as any)[z] as number)
        : 1.0;
    const brandDelta = (brandOff as any)[z] ?? 0;

    if (!garment || !body) {
      const wght =
        (WIDTH_WEIGHTS[g.category] as any)[z] ?? 0;
      widthsFit.push({
        kind: "width",
        zone: z,
        delta: 0,
        status: "Perfecto",
        color: COL_OK,
      });
      widthsDbg.push({
        zone: z,
        body: 0,
        garment: 0,
        baseEase: 0,
        tol: tolZ,
        weight: wght,
        scoreUnit: 0,
        contribution: 0,
        status: "Perfecto",
      });
      return;
    }

    const delta = garment - body + brandDelta;
    const fromIdeal = delta - baseEase;

    let status: FitWidth = "Perfecto";
    if (fromIdeal < -tolZ) status = "Ajustado";
    else if (fromIdeal > tolZ) status = "Holgado";

    const wght =
      (WIDTH_WEIGHTS[g.category] as any)[z] ?? 1;
    // stretch reduce “penalización” por ajustado
    const effectiveTol = tolZ * (1 + stretch * 0.5);
    const unit = clamp(fromIdeal / effectiveTol, -2, 2);
    const contribution = unit * wght;

    const color =
      status === "Perfecto"
        ? COL_OK
        : status === "Ajustado"
        ? COL_TIGHT
        : COL_LOOSE;

    widthsFit.push({
      kind: "width",
      zone: z,
      delta,
      status,
      color,
    });
    widthsDbg.push({
      zone: z,
      body,
      garment,
      baseEase,
      tol: effectiveTol,
      weight: wght,
      scoreUnit: unit,
      contribution,
      status,
    });
  });

  // Largo
  lengths.forEach((z) => {
    const body = (user as any)[z] as number;
    const garment =
      (g.measures as any)[z] != null
        ? ((g.measures as any)[z] as number)
        : 0;
    const baseEase = (ease as any)[z] ?? 0;
    const tolZ =
      (tolBase as any)[z] != null
        ? ((tolBase as any)[z] as number)
        : 1.0;

    if (!garment || !body) {
      const wght =
        (LENGTH_WEIGHTS[g.category] as any)[z] ?? 0;
      lengthsFit.push({
        kind: "length",
        zone: z,
        delta: 0,
        status: "Perfecto",
        color: COL_OK,
      });
      lengthsDbg.push({
        zone: z,
        body: 0,
        garment: 0,
        baseEase: 0,
        tol: tolZ,
        weight: wght,
        scoreUnit: 0,
        contribution: 0,
        status: "Perfecto",
      });
      return;
    }

    const delta = garment - body;
    const fromIdeal = delta - baseEase;

    let status: FitLength = "Perfecto";
    if (fromIdeal < -tolZ) status = "Corto";
    else if (fromIdeal > tolZ) status = "Largo";

    const wght =
      (LENGTH_WEIGHTS[g.category] as any)[z] ?? 1;
    const unit = clamp(fromIdeal / tolZ, -2, 2);
    const contribution = unit * wght;

    const color =
      status === "Perfecto"
        ? COL_OK
        : status === "Corto"
        ? COL_TIGHT
        : COL_LOOSE;

    lengthsFit.push({
      kind: "length",
      zone: z,
      delta,
      status,
      color,
    });
    lengthsDbg.push({
      zone: z,
      body,
      garment,
      baseEase,
      tol: tolZ,
      weight: wght,
      scoreUnit: unit,
      contribution,
      status,
    });
  });

  // Score global
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

  return {
    overall,
    widths: widthsFit,
    lengths: lengthsFit,
    debug: {
      widths: widthsDbg,
      lengths: lengthsDbg,
      score,
      wsum,
      norm,
    },
  };
}

// ------------------------------
// Recomendación de talle
// ------------------------------
export function makeRecommendation(params: {
  category: GarmentCategory;
  garment: Garment;
  fit: FitResult;
}): Recommendation {
  const { category, garment, fit } = params;
  const widths = fit.widths || [];
  const lengths = fit.lengths || [];
  const norm = fit.debug && typeof fit.debug.norm === "number" ? fit.debug.norm : 0;

  // Mapeo por nombre de zona para poder aplicar reglas específicas
  const zonesByName: Record<string, string> = {};
  widths.forEach((w) => {
    zonesByName[w.zone] = w.status;
  });

  const hombrosStatus = zonesByName["hombros"];
  const pechoStatus = zonesByName["pecho"];
  const cinturaStatus = zonesByName["cintura"];

  const isSuperiorCategory =
    category === "remera" ||
    category === "campera" ||
    category === "buzo" ||
    category === "superior";

  const problemWidths = widths.filter((z) => z.status !== "Perfecto");
  const tightWidths = widths.filter((z) => z.status === "Ajustado");
  const looseWidths = widths.filter((z) => z.status === "Holgado");

  const problemLengths = lengths.filter((z) => z.status !== "Perfecto");

  const tightCount = tightWidths.length;
  const looseCount = looseWidths.length;

  const onlyCinturaProblema =
    hombrosStatus === "Perfecto" &&
    pechoStatus === "Perfecto" &&
    cinturaStatus &&
    cinturaStatus !== "Perfecto" &&
    problemWidths.length === 1;

  // ⚖️ Caso ideal: todo perfecto
  if (
    fit.overall === "Perfecto" &&
    Math.abs(norm) < 0.15 &&
    problemWidths.length === 0 &&
    problemLengths.length === 0
  ) {
    return {
      tag: "OK",
      title: "Talle recomendado",
      message: `El talle ${garment.sizeLabel ?? ""} tiene un calce equilibrado para tus medidas en esta prenda.`,
    };
  }

  // 🧵 Regla especial Vesti·Fit para prendas superiores:
  // Si hombros y pecho están perfectos y la única zona con diferencia es cintura
  // (ajustada u holgada), NO forzamos cambio de talle. Solo advertimos el comportamiento
  // particular de la cintura.
  if (isSuperiorCategory) {
    if (onlyCinturaProblema) {
      const detalleCintura =
        cinturaStatus === "Ajustado"
          ? "La cintura puede sentirse algo ajustada, especialmente si tendés a concentrar volumen en esa zona."
          : "La cintura puede sentirse algo holgada, típico en personas con cintura más fina o fit atlético.";
      return {
        tag: "OK",
        title: "Talle recomendado con cintura particular",
        message:
          "Los hombros y el pecho calzan bien en este talle. " +
          detalleCintura +
          " Si este estilo de calce coincide con tu preferencia, podés mantener este talle.",
      };
    }

    // 🧵 Regla híbrida Vesti·Fit (opción C):
    // Si el pecho es la única zona ajustada y hay alguna zona más bien holgada,
    // recomendamos mantener el talle actual como principal, pero sugerimos
    // comparar con un talle menos SI la persona busca un calce más al cuerpo.
    const pechoAjustadoSolo =
      pechoStatus === "Ajustado" &&
      (!hombrosStatus || hombrosStatus === "Perfecto") &&
      tightWidths.length === 1 &&
      tightWidths[0].zone === "pecho" &&
      looseCount >= 1;

    if (pechoAjustadoSolo) {
      return {
        tag: "OK",
        title: "Talle recomendado (con opción más slim)",
        message:
          `Este talle ${garment.sizeLabel ?? ""} acompaña bien tus medidas en general y puede sentirse algo ajustado en el pecho. ` +
          "Si preferís un calce más al cuerpo o muy prolijo, podés comparar con un talle menos.",
      };
    }
  }

  // 🔺 Principalmente ajustado: recomendamos subir talle
  if (
    fit.overall === "Ajustado" ||
    norm <= -0.2 ||
    tightCount >= 2
  ) {
    const zonasApret = tightWidths.map((z) => z.zone).join(", ");
    return {
      tag: "SIZE_UP",
      title: "Mejor un talle más",
      message:
        zonasApret.length > 0
          ? `Este talle tiende a quedar ajustado en ${zonasApret}. Te conviene considerar un talle más para evitar incomodidad y posibles devoluciones.`
          : "Este talle se percibe algo ajustado en varias zonas. Te conviene considerar un talle más.",
    };
  }

  // 🔻 Principalmente holgado: recomendamos bajar talle
  if (
    fit.overall === "Holgado" ||
    norm >= 0.2 ||
    looseCount >= 2
  ) {
    const zonasHolgadas = looseWidths.map((z) => z.zone).join(", ");
    return {
      tag: "SIZE_DOWN",
      title: "Podrías bajar un talle",
      message:
        zonasHolgadas.length > 0
          ? `Este talle queda algo holgado en ${zonasHolgadas}. Podrías bajar un talle para un calce más prolijo.`
          : "Este talle se percibe algo holgado en varias zonas. Un talle menos podría quedarte mejor.",
    };
  }

  // 📏 Problemas de largo: ancho razonable pero largo a revisar
  if (problemLengths.length > 0) {
    const zonas = problemLengths
      .map((z) => `${z.zone} (${z.status})`)
      .join(", ");
    return {
      tag: "CHECK_LENGTH",
      title: "Revisá el largo",
      message: `El largo de la prenda puede ser un punto a revisar (${zonas}). Según tu altura y proporciones, podrías preferir más o menos cobertura. Evaluá si este largo coincide con tu preferencia o considerá otro talle/modelo.`,
    };
  }

  // ✅ Fallback: calce aceptable aunque no perfecto en todas las zonas
  return {
    tag: "OK",
    title: "Calce aceptable",
    message:
      "El calce es razonable para tus medidas. Revisá el detalle por zonas para confirmar que coincida con tu preferencia de ajuste.",
  };
}

