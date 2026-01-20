
// src/motor/fitEngine.ts
/**
 * VESTI AI — Fit Engine (v4)
 * Soporte de perfiles de calce: slim / regular / oversize
 *
 * Reglas clave:
 * - UPPER:
 *   * Decisorios: hombros, pecho
 *   * Advertencia: cintura, largoTorso
 * - PANTS:
 *   * Decisorio: cintura
 *   * Advertencia: largoPierna
 * - SHOES:
 *   * Decisorio: pie_largo
 *
 * Perfil de calce:
 * - slim: tolerancia baja (sube talle antes)
 * - regular: baseline
 * - oversize: tolerancia alta (holgado => Perfecto (Suelto), no baja talle)
 */

export type Category = "upper" | "pants" | "shoes";
export type EasePreset = "slim" | "regular" | "oversize";

export type Measurements = {
  hombros?: number;
  pecho?: number;
  cintura?: number;
  largoTorso?: number;
  largoPierna?: number;
  pie_largo?: number;
};

export type Garment = {
  sizeLabel?: string;
  measures: Measurements;
  stretchPct?: number;
  easePreset?: EasePreset;
};

export type FitStatus = "Perfecto" | "Ajustado" | "Holgado" | "Perfecto (Suelto)";
export type RecommendationTag = "OK" | "SIZE_UP" | "SIZE_DOWN" | "CHECK_WARNING";

// -------------------- UTILIDADES --------------------

const num = (v?: number) => (typeof v === "number" ? v : 0);

const stretchFactor = (pct?: number) => 1 + num(pct) / 100;

const easeTable = {
  upper: {
    slim: { pecho: 1, hombros: 0 },
    regular: { pecho: 4, hombros: 2 },
    oversize: { pecho: 8, hombros: 4 },
  },
  pants: {
    slim: { cintura: 0 },
    regular: { cintura: 2 },
    oversize: { cintura: 4 },
  },
};

// -------------------- CORE --------------------

export function computeFit(
  category: Category,
  user: Measurements,
  garment: Garment
) {
  const ease: EasePreset = garment.easePreset ?? "regular";
  const stretch = stretchFactor(garment.stretchPct);

  let tag: RecommendationTag = "OK";
  const zones: { zone: string; status: FitStatus }[] = [];

  // ---------- UPPER ----------
  if (category === "upper") {
    // Decisorios
    const pechoUser = num(user.pecho);
    const pechoGarment =
      (num(garment.measures.pecho) + easeTable.upper[ease].pecho) * stretch;

    const hombrosUser = num(user.hombros);
    const hombrosGarment =
      (num(garment.measures.hombros) + easeTable.upper[ease].hombros) * stretch;

    let pechoStatus: FitStatus = "Perfecto";
    if (pechoUser > pechoGarment) {
      pechoStatus = "Ajustado";
      tag = "SIZE_UP";
    } else if (pechoUser < pechoGarment - 8 && ease !== "oversize") {
      pechoStatus = "Holgado";
    } else if (ease === "oversize" && pechoUser < pechoGarment) {
      pechoStatus = "Perfecto (Suelto)";
    }

    let hombrosStatus: FitStatus = "Perfecto";
    if (hombrosUser > hombrosGarment) {
      hombrosStatus = "Ajustado";
      tag = "SIZE_UP";
    } else if (hombrosUser < hombrosGarment - 6 && ease !== "oversize") {
      hombrosStatus = "Holgado";
    } else if (ease === "oversize" && hombrosUser < hombrosGarment) {
      hombrosStatus = "Perfecto (Suelto)";
    }

    zones.push({ zone: "pecho", status: pechoStatus });
    zones.push({ zone: "hombros", status: hombrosStatus });

    // Advertencias
    if (num(user.cintura) && num(garment.measures.cintura)) {
      zones.push({
        zone: "cintura",
        status:
          num(user.cintura) < num(garment.measures.cintura)
            ? "Holgado"
            : "Perfecto",
      });
      if (tag === "OK") tag = "CHECK_WARNING";
    }

    if (num(user.largoTorso) && num(garment.measures.largoTorso)) {
      zones.push({
        zone: "largoTorso",
        status:
          num(user.largoTorso) > num(garment.measures.largoTorso)
            ? "Corto"
            : "Perfecto",
      });
      if (tag === "OK") tag = "CHECK_WARNING";
    }

    return { tag, zones };
  }

  // ---------- PANTS ----------
  if (category === "pants") {
    const cinturaUser = num(user.cintura);
    const cinturaGarment =
      (num(garment.measures.cintura) +
        (easeTable.pants[ease]?.cintura ?? 0)) *
      stretch;

    let cinturaStatus: FitStatus = "Perfecto";

    if (cinturaUser > cinturaGarment) {
      cinturaStatus = "Ajustado";
      tag = "SIZE_UP";
    } else if (cinturaUser < cinturaGarment - 4 && ease !== "oversize") {
      cinturaStatus = "Holgado";
      tag = "SIZE_DOWN";
    } else if (ease === "oversize" && cinturaUser < cinturaGarment) {
      cinturaStatus = "Perfecto (Suelto)";
    }

    zones.push({ zone: "cintura", status: cinturaStatus });

    // Advertencia largo
    if (num(user.largoPierna) && num(garment.measures.largoPierna)) {
      zones.push({
        zone: "largoPierna",
        status:
          num(user.largoPierna) > num(garment.measures.largoPierna)
            ? "Corto"
            : "Perfecto",
      });
      if (tag === "OK") tag = "CHECK_WARNING";
    }

    return { tag, zones };
  }

  // ---------- SHOES ----------
  if (category === "shoes") {
    const footUser = num(user.pie_largo);
    const footGarment = num(garment.measures.pie_largo);

    let footStatus: FitStatus = "Perfecto";
    if (footUser > footGarment) {
      footStatus = "Ajustado";
      tag = "SIZE_UP";
    } else if (footUser < footGarment - 0.5) {
      footStatus = "Holgado";
      tag = "SIZE_DOWN";
    }

    zones.push({ zone: "pie_largo", status: footStatus });
    return { tag, zones };
  }

  return { tag: "OK", zones: [] };
}
