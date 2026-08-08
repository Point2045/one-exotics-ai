import { decodeVinWithAutoDev } from "../providers/autoDev";
import { decodeVinWithNhtsa, fetchComplaintsByVehicle, fetchRecallsByVehicle, type ComplaintDigest, type RecallInfo } from "./nhtsa";

export type VinReport = {
  vin: string;
  valid: boolean;
  checksum?: boolean;
  origin?: string;
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  bodyClass?: string;
  driveType?: string;
  transmission?: string;
  engine?: string;
  engineCylinders?: string;
  fuelType?: string;
  plantCountry?: string;
  manufacturer?: string;
  recalls: RecallInfo[];
  complaints: ComplaintDigest;
  sources: string[];
  errors: string[];
};

function pick(...values: (string | undefined)[]) {
  return values.find((value) => value && value.trim());
}

/**
 * Multi-source VIN intelligence: Auto.dev decode (exotic trims + check-digit
 * validation) merged with NHTSA vPIC, then NHTSA recalls and owner complaints
 * for the decoded vehicle. Every source is failure-isolated — the report
 * succeeds as long as one decoder answers.
 */
export async function buildVinReport(vin: string): Promise<VinReport> {
  const normalizedVin = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) {
    throw new Error("VIN must be 17 characters and cannot contain I, O, or Q.");
  }

  const [autoDevResult, nhtsaResult] = await Promise.allSettled([
    decodeVinWithAutoDev(normalizedVin),
    decodeVinWithNhtsa(normalizedVin),
  ]);

  const autoDev = autoDevResult.status === "fulfilled" ? autoDevResult.value : undefined;
  const nhtsa = nhtsaResult.status === "fulfilled" ? nhtsaResult.value : undefined;
  const sources: string[] = [];
  const errors: string[] = [];
  if (autoDev) sources.push("Auto.dev VIN decode");
  else errors.push(autoDevResult.status === "rejected" ? String(autoDevResult.reason?.message ?? autoDevResult.reason) : "Auto.dev unavailable");
  if (nhtsa) sources.push("NHTSA vPIC");
  else errors.push(nhtsaResult.status === "rejected" ? String(nhtsaResult.reason?.message ?? nhtsaResult.reason) : "NHTSA vPIC unavailable");

  if (!autoDev && !nhtsa) {
    throw new Error(`All VIN decoders failed — ${errors.join("; ")}`);
  }

  const year = pick(nhtsa?.year, autoDev?.year);
  const make = pick(autoDev?.make, nhtsa?.make);
  const model = pick(autoDev?.model, nhtsa?.model);

  let recalls: RecallInfo[] = [];
  let complaints: ComplaintDigest = { count: 0, samples: [] };
  if (make && model && year) {
    const [recallsResult, complaintsResult] = await Promise.allSettled([
      fetchRecallsByVehicle(make, model, year),
      fetchComplaintsByVehicle(make, model, year),
    ]);
    if (recallsResult.status === "fulfilled") {
      recalls = recallsResult.value;
      sources.push("NHTSA recalls");
    } else {
      errors.push(String(recallsResult.reason?.message ?? recallsResult.reason));
    }
    if (complaintsResult.status === "fulfilled") {
      complaints = complaintsResult.value;
      sources.push("NHTSA complaints");
    } else {
      errors.push(String(complaintsResult.reason?.message ?? complaintsResult.reason));
    }
  }

  return {
    vin: normalizedVin,
    valid: autoDev?.valid ?? true,
    checksum: autoDev?.checksum,
    origin: autoDev?.origin ?? nhtsa?.plantCountry,
    year,
    make,
    model,
    trim: pick(autoDev?.trim, nhtsa?.trim),
    bodyClass: pick(nhtsa?.bodyClass, autoDev?.bodyClass),
    driveType: pick(autoDev?.driveType, nhtsa?.driveType),
    transmission: pick(autoDev?.transmission, nhtsa?.transmission),
    engine: autoDev?.engine,
    engineCylinders: nhtsa?.engineCylinders,
    fuelType: nhtsa?.fuelType,
    plantCountry: nhtsa?.plantCountry,
    manufacturer: nhtsa?.manufacturer,
    recalls,
    complaints,
    sources,
    errors,
  };
}
