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
