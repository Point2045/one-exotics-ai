import { seedDemoData } from "../api/services/demoData";

async function seed() {
  console.log("Seeding Highline Index database...");
  const result = await seedDemoData();
  console.log(result);
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
