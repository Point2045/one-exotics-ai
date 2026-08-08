import type { NormalizedListing } from "../providers/types";
import { ensureSupportedModelsSeeded, rebuildModelStats, rebuildValuations, upsertListing } from "./ingestion";
import { matchSupportedModel } from "./matching";
import { getStore } from "./store";

const PEXELS = {
  showroom: "https://images.pexels.com/photos/4157182/pexels-photo-4157182.jpeg?auto=compress&cs=tinysrgb&w=1200",
  aventador: "https://images.pexels.com/photos/8664306/pexels-photo-8664306.jpeg?auto=compress&cs=tinysrgb&w=1200",
  lineup: "https://images.pexels.com/photos/27968213/pexels-photo-27968213.jpeg?auto=compress&cs=tinysrgb&w=1200",
};

type DemoSeed = {
  make: string;
  model: string;
  trim: string;
  year: number;
  prices: number[];
  mileageBase: number;
  city: string;
  state: string;
  imageUrl: string;
  /** Illustrative sell-through observations: days the car sat before leaving the market, and how long ago it left. */
  sellThrough: { daysToSell: number; goneDaysAgo: number }[];
};

const demoSeeds: DemoSeed[] = [
  {
    make: "Ferrari",
    model: "488",
    trim: "Pista",
    year: 2020,
    prices: [385000, 462000, 478000, 489000, 505000, 518000],
    mileageBase: 8200,
    city: "Miami",
    state: "FL",
    imageUrl: PEXELS.showroom,
    sellThrough: [
      { daysToSell: 26, goneDaysAgo: 9 },
      { daysToSell: 38, goneDaysAgo: 25 },
      { daysToSell: 44, goneDaysAgo: 58 },
      { daysToSell: 61, goneDaysAgo: 102 },
    ],
  },
  {
    make: "Porsche",
    model: "911",
    trim: "GT3 Touring",
    year: 2022,
    prices: [249000, 259000, 268000, 274000, 283000, 292000],
    mileageBase: 6400,
    city: "Los Angeles",
    state: "CA",
    imageUrl: PEXELS.showroom,
    sellThrough: [
      { daysToSell: 9, goneDaysAgo: 5 },
      { daysToSell: 14, goneDaysAgo: 17 },
      { daysToSell: 21, goneDaysAgo: 39 },
      { daysToSell: 12, goneDaysAgo: 76 },
      { daysToSell: 18, goneDaysAgo: 121 },
    ],
  },
  {
    make: "Lamborghini",
    model: "Huracán",
    trim: "EVO RWD",
    year: 2021,
    prices: [224000, 232000, 238000, 246000, 251000, 263000],
    mileageBase: 11200,
    city: "Scottsdale",
    state: "AZ",
    imageUrl: PEXELS.lineup,
    sellThrough: [
      { daysToSell: 27, goneDaysAgo: 8 },
      { daysToSell: 35, goneDaysAgo: 29 },
      { daysToSell: 44, goneDaysAgo: 63 },
      { daysToSell: 52, goneDaysAgo: 97 },
    ],
  },
  {
    make: "Mercedes-Benz",
    model: "G-Class",
    trim: "AMG G 63",
    year: 2022,
    prices: [142000, 151000, 158000, 166000, 174000, 181000],
    mileageBase: 15500,
    city: "Dallas",
    state: "TX",
    imageUrl: PEXELS.lineup,
    sellThrough: [
      { daysToSell: 16, goneDaysAgo: 4 },
      { daysToSell: 24, goneDaysAgo: 19 },
      { daysToSell: 31, goneDaysAgo: 52 },
      { daysToSell: 29, goneDaysAgo: 83 },
      { daysToSell: 40, goneDaysAgo: 140 },
    ],
  },
  {
    make: "Aston Martin",
    model: "DB11",
    trim: "V8",
    year: 2020,
    prices: [96500, 103000, 111000, 118000, 124000, 132000],
    mileageBase: 17600,
    city: "Atlanta",
    state: "GA",
    imageUrl: PEXELS.showroom,
    sellThrough: [
      { daysToSell: 66, goneDaysAgo: 12 },
      { daysToSell: 95, goneDaysAgo: 41 },
      { daysToSell: 128, goneDaysAgo: 74 },
      { daysToSell: 88, goneDaysAgo: 130 },
    ],
  },
  {
    make: "Lamborghini",
    model: "Aventador",
    trim: "SVJ",
    year: 2019,
    prices: [615000, 642000, 675000, 698000, 724000, 756000],
    mileageBase: 5900,
    city: "Greenwich",
    state: "CT",
    imageUrl: PEXELS.aventador,
    sellThrough: [
      { daysToSell: 58, goneDaysAgo: 15 },
      { daysToSell: 84, goneDaysAgo: 49 },
      { daysToSell: 112, goneDaysAgo: 91 },
      { daysToSell: 97, goneDaysAgo: 143 },
    ],
  },
];

function demoListing(seed: DemoSeed, price: number, index: number): NormalizedListing {
  const mileage = Math.max(500, seed.mileageBase + (index - 2) * 2400);
  const title = `${seed.year} ${seed.make} ${seed.model} ${seed.trim}`;
  return {
    source: "demo",
    externalId: `${seed.make}-${seed.model}-${seed.trim}-${index}`.replace(/[^a-z0-9]+/gi, "-"),
    vin: `DEMO${seed.make.replace(/[^A-Z]/gi, "").slice(0, 4).toUpperCase()}${seed.year}${index}`.slice(0, 17).padEnd(17, "X"),
    year: seed.year,
    make: seed.make,
    model: seed.model,
    trim: seed.trim,
    title,
    price,
    mileage,
    exteriorColor: ["Nero", "Rosso", "Grigio", "Bianco", "Blu", "Verde"][index % 6],
    interiorColor: index % 2 ? "Black" : "Tan",
    transmission: seed.trim.includes("GT3") ? "Manual" : "Automatic",
    drivetrain: seed.make === "Mercedes-Benz" ? "4WD" : seed.trim.includes("RWD") ? "RWD" : "AWD",
    bodyStyle: seed.make === "Mercedes-Benz" ? "SUV" : "Coupe",
    sellerName: `${seed.city} Exotic Motorcars`,
    sellerType: "dealer",
    city: seed.city,
    state: seed.state,
    url: "https://example.com/demo-listing",
    imageUrl: seed.imageUrl,
    description: "Illustrative demo listing used until the live provider is configured.",
    listedAt: new Date(Date.now() - (6 + index * 9) * 86_400_000),
    status: "active",
    raw: { demo: true },
  };
}

export async function seedDemoData() {
  await ensureSupportedModelsSeeded();
  const store = await getStore();
  if (await store.hasListingsBySource("demo")) return { inserted: 0, valuationsCreated: 0, message: "Demo data already exists" };

  const models = await store.allSupportedModels();
  let inserted = 0;
  for (const seed of demoSeeds) {
    for (const [index, price] of seed.prices.entries()) {
      const listing = demoListing(seed, price, index);
      const model = matchSupportedModel(listing, models);
      await upsertListing(listing, model?.id);
      inserted += 1;
    }
  }

  // Illustrative sell-through history so velocity stats render before real observations accumulate.
  const DAY_MS = 86_400_000;
  const now = Date.now();
  for (const seed of demoSeeds) {
    for (const [index, observation] of seed.sellThrough.entries()) {
      const removedAt = new Date(now - observation.goneDaysAgo * DAY_MS);
      const listedAt = new Date(removedAt.getTime() - observation.daysToSell * DAY_MS);
      const listing = demoListing(seed, seed.prices[(index + 1) % seed.prices.length], 30 + index);
      const model = matchSupportedModel(listing, models);
      await store.insertListing({
        source: "demo",
        externalId: `${listing.externalId}-gone`,
        modelId: model?.id ?? null,
        vin: null,
        year: listing.year,
        make: listing.make,
        model: listing.model,
        trim: listing.trim,
        title: listing.title,
        price: listing.price,
        mileage: listing.mileage,
        exteriorColor: listing.exteriorColor,
        interiorColor: listing.interiorColor,
        transmission: listing.transmission,
        drivetrain: listing.drivetrain,
        bodyStyle: listing.bodyStyle,
        sellerName: listing.sellerName,
        sellerType: listing.sellerType,
        city: listing.city,
        state: listing.state,
        url: listing.url,
        imageUrl: listing.imageUrl,
        description: "Demo sell-through observation: this listing left the market.",
        listedAt,
        status: "unknown",
        firstSeenAt: listedAt,
        lastSeenAt: removedAt,
        removedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        raw: { demo: true, gone: true },
      });
    }
  }

  await rebuildModelStats();
  const valuationsCreated = await rebuildValuations();
  const runId = await store.insertIngestionRun({ provider: "demo", status: "completed" });
  await store.updateIngestionRun(runId, {
    listingsFound: inserted,
    listingsUpserted: inserted,
    valuationsCreated,
    finishedAt: new Date(),
  });

  return { inserted, valuationsCreated, message: "Demo data seeded" };
}
