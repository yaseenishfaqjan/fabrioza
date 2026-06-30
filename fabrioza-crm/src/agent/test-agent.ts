// Manual agent test — no DB needed, only OPENAI_API_KEY.
//   npm run agent:test -- "I want a quote for 200 hoodies with embroidery"
// Loads .env.local first so the key/model are available, then prints the JSON.

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { analyzeLead } from "@/agent/leadAgent";

const input =
  process.argv.slice(2).join(" ").trim() ||
  "Hi, we're a startup streetwear brand. I'd like a quote for 200 heavyweight hoodies " +
    "in black with an embroidered chest logo, sizes S-XL. What's the price?";

console.log("--- INPUT ---\n" + input + "\n");
analyzeLead(input)
  .then((result) => {
    console.log("--- AGENT OUTPUT ---");
    console.log(result ? JSON.stringify(result, null, 2) : "(null — analysis failed after retry; fallback would be used)");
    process.exit(0);
  })
  .catch((err) => {
    console.error("test failed:", err);
    process.exit(1);
  });
