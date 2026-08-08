type NhtsaValueRow = Record<string, string | null | undefined>;

function clean(value: string | null | undefined) {
  return value && value !== "Not Applicable" ? value : undefined;
}

export async function decodeVinWithNhtsa(vin: string) {
  const normalizedVin = vin.trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(normalizedVin)) {
    throw new Error("VIN must be 17 characters and cannot contain I, O, or Q.");
  }

  let response: Response;
  try {
    response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(normalizedVin)}?format=json`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new Error("NHTSA vPIC is unreachable from the server right now. Wait a moment and try again.");
  }
  if (!response.ok) throw new Error(`NHTSA VIN decode failed with ${response.status}`);

  const payload = (await response.json()) as { Results?: NhtsaValueRow[] };
  const row = payload.Results?.[0];
  if (!row) throw new Error("NHTSA returned no decode result for this VIN.");

  return {
    vin: normalizedVin,
    year: clean(row.ModelYear),
    make: clean(row.Make),
    model: clean(row.Model),
    trim: clean(row.Trim),
    bodyClass: clean(row.BodyClass),
    driveType: clean(row.DriveType),
    transmission: clean(row.TransmissionStyle),
    engineCylinders: clean(row.EngineCylinders),
    engineDisplacement: clean(row.DisplacementL),
    fuelType: clean(row.FuelTypePrimary),
    plantCountry: clean(row.PlantCountry),
    manufacturer: clean(row.Manufacturer),
    errorCode: clean(row.ErrorCode),
    errorText: clean(row.ErrorText),
    source: "NHTSA vPIC",
  };
}

export type RecallInfo = {
  campaignNumber?: string;
  component?: string;
  summary?: string;
  consequence?: string;
  remedy?: string;
  date?: string;
  parkIt: boolean;
};

/** Open safety recalls — free NHTSA API, no key. Tolerant by design: failure yields an empty list. */
export async function fetchRecallsByVehicle(make: string, model: string, year: string): Promise<RecallInfo[]> {
  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`NHTSA recalls failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { results?: Record<string, unknown>[] };
  return (payload.results ?? []).slice(0, 10).map((row) => ({
    campaignNumber: clean(row.NHTSACampaignNumber as string | undefined),
    component: clean(row.Component as string | undefined),
    summary: clean(row.Summary as string | undefined),
    consequence: clean(row.Conequence as string | undefined) ?? clean(row.Consequence as string | undefined),
    remedy: clean(row.Remedy as string | undefined),
    date: clean(row.ReportReceivedDate as string | undefined),
    parkIt: row.parkIt === true,
  }));
}

export type ComplaintDigest = {
  count: number;
  samples: { components?: string; summary?: string; date?: string }[];
};

/** Owner-filed complaints — free NHTSA API. Recurring components are reliability red flags. */
export async function fetchComplaintsByVehicle(make: string, model: string, year: string): Promise<ComplaintDigest> {
  const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`NHTSA complaints failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { count?: number; Count?: number; results?: Record<string, unknown>[] };
  const rows = payload.results ?? [];
  return {
    count: payload.count ?? payload.Count ?? rows.length,
    samples: rows.slice(0, 3).map((row) => ({
      components: clean(row.components as string | undefined),
      summary: clean(row.summary as string | undefined),
      date: clean(row.dateOfIncident as string | undefined),
    })),
  };
}
