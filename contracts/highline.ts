export type HighlineModelDefinition = {
  make: string;
  modelFamily: string;
  variant: string;
  generation?: string;
  yearStart: number;
  yearEnd?: number;
  bodyStyle?: string;
  transmission?: string;
  searchMake: string;
  searchModel?: string;
  matchTerms: string[];
  sortOrder: number;
};

export type HighlineSearchDefinition = {
  key: string;
  label: string;
  make: string;
  model?: string;
  family: string;
};

export const HIGHLINE_SEARCHES: HighlineSearchDefinition[] = [
  { key: "ferrari-all", label: "All Ferrari", make: "Ferrari", family: "Ferrari" },
  { key: "lamborghini-all", label: "All Lamborghini", make: "Lamborghini", family: "Lamborghini" },
  { key: "aston-martin-all", label: "All Aston Martin", make: "Aston Martin", family: "Aston Martin" },
  { key: "porsche-911", label: "Porsche 911", make: "Porsche", model: "911", family: "911" },
  { key: "mercedes-g-class", label: "Mercedes G-Class", make: "Mercedes-Benz", model: "G-Class", family: "G-Class" },
  { key: "mercedes-g550", label: "Mercedes G 550", make: "Mercedes-Benz", model: "G 550", family: "G-Class" },
  { key: "mercedes-amg-g63", label: "Mercedes-AMG G 63", make: "Mercedes-Benz", model: "AMG G 63", family: "G-Class" },
];

const ferrari = (
  variant: string,
  yearStart: number,
  yearEnd: number | undefined,
  sortOrder: number,
  generation?: string,
): HighlineModelDefinition => ({
  make: "Ferrari",
  modelFamily: "Ferrari",
  variant,
  generation,
  yearStart,
  yearEnd,
  bodyStyle: variant.includes("Spider") || variant.includes("GTS") || variant.includes("California") || variant.includes("Portofino") ? "Convertible" : "Coupe",
  searchMake: "Ferrari",
  matchTerms: [variant, ...variant.split(/\s+/)],
  sortOrder,
});

const lamborghini = (
  variant: string,
  yearStart: number,
  yearEnd: number | undefined,
  sortOrder: number,
  generation?: string,
): HighlineModelDefinition => ({
  make: "Lamborghini",
  modelFamily: "Lamborghini",
  variant,
  generation,
  yearStart,
  yearEnd,
  bodyStyle: variant.includes("Spyder") || variant.includes("Roadster") ? "Convertible" : variant.includes("Urus") ? "SUV" : "Coupe",
  searchMake: "Lamborghini",
  matchTerms: [variant, ...variant.replace("Huracán", "Huracan").split(/\s+/)],
  sortOrder,
});

const astonMartin = (
  variant: string,
  yearStart: number,
  yearEnd: number | undefined,
  sortOrder: number,
  generation?: string,
): HighlineModelDefinition => ({
  make: "Aston Martin",
  modelFamily: "Aston Martin",
  variant,
  generation,
  yearStart,
  yearEnd,
  bodyStyle: variant.includes("Volante") ? "Convertible" : variant.includes("DBX") ? "SUV" : variant.includes("Rapide") ? "Sedan" : "Coupe",
  searchMake: "Aston Martin",
  matchTerms: [variant, ...variant.split(/\s+/)],
  sortOrder,
});

const porsche911 = (
  variant: string,
  yearStart: number,
  yearEnd: number | undefined,
  sortOrder: number,
  generation?: string,
): HighlineModelDefinition => ({
  make: "Porsche",
  modelFamily: "911",
  variant,
  generation,
  yearStart,
  yearEnd,
  bodyStyle: variant.includes("Cabriolet") || variant.includes("Speedster") ? "Convertible" : variant.includes("Targa") ? "Targa" : "Coupe",
  transmission: variant.includes("GT3") || variant.includes("Carrera T") || variant.includes("S/T") ? "Manual available" : undefined,
  searchMake: "Porsche",
  searchModel: "911",
  matchTerms: [variant, "911", ...variant.split(/\s+/)],
  sortOrder,
});

const gWagon = (
  variant: string,
  yearStart: number,
  yearEnd: number | undefined,
  sortOrder: number,
  generation?: string,
): HighlineModelDefinition => ({
  make: "Mercedes-Benz",
  modelFamily: "G-Class",
  variant,
  generation,
  yearStart,
  yearEnd,
  bodyStyle: "SUV",
  searchMake: "Mercedes-Benz",
  searchModel: variant.includes("G 63") ? "AMG G 63" : variant.includes("G 550") ? "G 550" : "G-Class",
  matchTerms: [variant, "G-Class", "G Wagon", ...variant.split(/\s+/)],
  sortOrder,
});

export const HIGHLINE_MODEL_DEFINITIONS: HighlineModelDefinition[] = [
  ferrari("296 GTB", 2022, undefined, 10, "Tipo F171"),
  ferrari("296 GTS", 2022, undefined, 11, "Tipo F171"),
  ferrari("488 GTB", 2016, 2019, 20, "Tipo F142M"),
  ferrari("488 Spider", 2016, 2019, 21, "Tipo F142M"),
  ferrari("488 Pista", 2018, 2020, 22, "Tipo F142M"),
  ferrari("F8 Tributo", 2020, 2023, 30, "Tipo F142M"),
  ferrari("F8 Spider", 2020, 2023, 31, "Tipo F142M"),
  ferrari("812 Superfast", 2018, 2022, 40, "F152"),
  ferrari("812 GTS", 2020, 2023, 41, "F152"),
  ferrari("812 Competizione", 2022, 2024, 42, "F152"),
  ferrari("SF90 Stradale", 2020, undefined, 50, "F173"),
  ferrari("SF90 Spider", 2021, undefined, 51, "F173"),
  ferrari("Roma", 2021, undefined, 60, "F169"),
  ferrari("Roma Spider", 2024, undefined, 61, "F169"),
  ferrari("Portofino", 2018, 2020, 70, "F164"),
  ferrari("Portofino M", 2021, 2023, 71, "F164"),
  ferrari("California T", 2015, 2017, 80, "F149M"),
  ferrari("458 Italia", 2010, 2015, 90, "F142"),
  ferrari("458 Spider", 2011, 2015, 91, "F142"),
  ferrari("458 Speciale", 2014, 2015, 92, "F142"),
  ferrari("FF", 2012, 2016, 100, "F151"),
  ferrari("GTC4Lusso", 2017, 2020, 101, "F151"),
  ferrari("F12berlinetta", 2013, 2017, 110, "F152"),
  ferrari("599 GTB Fiorano", 2007, 2012, 120, "F141"),
  ferrari("599 GTO", 2011, 2012, 121, "F141"),
  ferrari("LaFerrari", 2014, 2016, 130, "F150"),

  lamborghini("Huracán EVO", 2020, 2024, 200, "LB724"),
  lamborghini("Huracán EVO Spyder", 2020, 2024, 201, "LB724"),
  lamborghini("Huracán EVO RWD", 2020, 2024, 202, "LB724"),
  lamborghini("Huracán Tecnica", 2023, 2024, 203, "LB724"),
  lamborghini("Huracán STO", 2021, 2024, 204, "LB724"),
  lamborghini("Huracán Performante", 2018, 2019, 205, "LB724"),
  lamborghini("Huracán LP 610-4", 2015, 2019, 206, "LB724"),
  lamborghini("Aventador S", 2017, 2021, 220, "LB834"),
  lamborghini("Aventador SV", 2016, 2017, 221, "LB834"),
  lamborghini("Aventador SVJ", 2019, 2021, 222, "LB834"),
  lamborghini("Aventador Ultimae", 2022, 2022, 223, "LB834"),
  lamborghini("Revuelto", 2024, undefined, 230, "LB744"),
  lamborghini("Urus", 2019, undefined, 240, "MLB Evo"),
  lamborghini("Urus Performante", 2023, undefined, 241, "MLB Evo"),
  lamborghini("Gallardo LP 560-4", 2009, 2013, 250, "L140"),
  lamborghini("Gallardo Superleggera", 2008, 2008, 251, "L140"),
  lamborghini("Murciélago LP 640", 2007, 2010, 260, "LB709"),
  lamborghini("Diablo VT", 1994, 2001, 270, "P132"),

  astonMartin("Vantage", 2019, undefined, 300, "AM6"),
  astonMartin("Vantage V12", 2022, 2023, 301, "AM6"),
  astonMartin("DB11", 2017, 2023, 310, "AM5"),
  astonMartin("DB11 Volante", 2018, 2023, 311, "AM5"),
  astonMartin("DB12", 2024, undefined, 320, "AM7"),
  astonMartin("DBS Superleggera", 2019, 2023, 330, "AM4"),
  astonMartin("DBS 770 Ultimate", 2023, 2024, 331, "AM4"),
  astonMartin("Vanquish", 2013, 2018, 340, "VH"),
  astonMartin("Rapide S", 2014, 2020, 350, "VH"),
  astonMartin("DBX", 2021, undefined, 360, "MLB Evo"),
  astonMartin("DBX707", 2022, undefined, 361, "MLB Evo"),
  astonMartin("Valkyrie", 2022, undefined, 370, "AM-RB 001"),

  porsche911("Carrera", 2012, undefined, 400, "991/992"),
  porsche911("Carrera S", 2012, undefined, 401, "991/992"),
  porsche911("Carrera 4", 2012, undefined, 402, "991/992"),
  porsche911("Carrera 4S", 2012, undefined, 403, "991/992"),
  porsche911("Carrera T", 2018, undefined, 404, "991/992"),
  porsche911("Carrera GTS", 2015, undefined, 405, "991/992"),
  porsche911("Targa 4", 2014, undefined, 410, "991/992"),
  porsche911("Targa 4S", 2014, undefined, 411, "991/992"),
  porsche911("Targa 4 GTS", 2017, undefined, 412, "991/992"),
  porsche911("Turbo", 2014, undefined, 420, "991/992"),
  porsche911("Turbo S", 2014, undefined, 421, "991/992"),
  porsche911("GT3", 2014, undefined, 430, "991/992"),
  porsche911("GT3 Touring", 2018, undefined, 431, "991/992"),
  porsche911("GT3 RS", 2016, undefined, 432, "991/992"),
  porsche911("GT2 RS", 2018, 2019, 433, "991.2"),
  porsche911("Sport Classic", 2023, 2023, 440, "992"),
  porsche911("Speedster", 2019, 2019, 441, "991.2"),
  porsche911("Dakar", 2023, 2024, 442, "992"),
  porsche911("S/T", 2024, 2024, 443, "992"),
  porsche911("Carrera Cabriolet", 2012, undefined, 450, "991/992"),
  porsche911("Carrera S Cabriolet", 2012, undefined, 451, "991/992"),

  gWagon("G 550", 2010, undefined, 500, "W463"),
  gWagon("G 500", 2002, 2024, 501, "W463"),
  gWagon("AMG G 63", 2013, undefined, 510, "W463/W465"),
  gWagon("AMG G 65", 2016, 2018, 520, "W463"),
  gWagon("G 550 4x4²", 2017, 2018, 530, "W463"),
  gWagon("AMG G 63 4x4²", 2023, undefined, 531, "W463"),
];
