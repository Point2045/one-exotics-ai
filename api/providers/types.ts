export type NormalizedListing = {
  source: string;
  externalId: string;
  vin?: string;
  year?: number;
  make: string;
  model: string;
  trim?: string;
  title: string;
  price?: number;
  mileage?: number;
  exteriorColor?: string;
  interiorColor?: string;
  transmission?: string;
  drivetrain?: string;
  bodyStyle?: string;
  sellerName?: string;
  sellerType?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  url?: string;
  imageUrl?: string;
  description?: string;
  listedAt?: Date;
  cpo?: boolean;
  photoCount?: number;
  carfaxUrl?: string;
  accidentCount?: number;
  ownerCount?: number;
  usageType?: string;
  status: "active" | "expired" | "sold" | "unknown";
  raw?: unknown;
};

export type SearchCompletion = {
  key: string;
  make: string;
  model?: string;
  /** True when pagination reached a short page — the search saw all current inventory. */
  exhausted: boolean;
  externalIds: string[];
};

export type ProviderFetchResult = {
  provider: string;
  listings: NormalizedListing[];
  warnings: string[];
  searches: SearchCompletion[];
};
