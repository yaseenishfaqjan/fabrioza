// WhatWeMake.jsx — drop-in product showcase for the FABRIOZA homepage (Next.js + Tailwind).
//
// SETUP:
//   1. Place the 8 source images in:  public/products-premium/<filename>.jpg
//   2. Import and render on the homepage:  import WhatWeMake from "@/components/WhatWeMake";  ... <WhatWeMake />
//   3. Requires Tailwind. next/image handles resizing, WebP/AVIF, and lazy-loading automatically.
//
// Notes:
//   - aspect-[4/5] needs Tailwind v3.3+ (or add a custom aspectRatio). Fallback: wrap with a padded box.
//   - On this repo's STATIC build, the equivalent live page is /what-we-make/ (plain HTML + landing.css).

import Image from "next/image";

const PRODUCTS = [
  {
    file: "henley-black.jpg",
    label: "Henleys & Long Sleeve",
    desc: "Premium garment-washed knits in custom fits.",
    alt: "Black custom garment-washed henley long sleeve — FABRIOZA custom clothing manufacturing",
  },
  {
    file: "hoodie-bone.jpg",
    label: "Pullover Hoodies",
    desc: "Heavyweight fleece and terry, built to your spec.",
    alt: "Bone pullover hoodie in heavyweight fleece — FABRIOZA custom hoodie manufacturing",
  },
  {
    file: "ziphoodie-charcoal.jpg",
    label: "Zip Hoodies & Jackets",
    desc: "Structured outerwear with premium trims.",
    alt: "Charcoal zip hoodie jacket with premium trims — FABRIOZA custom outerwear manufacturing",
  },
  {
    file: "activewear-sage.jpg",
    label: "Activewear & Sets",
    desc: "Technical, sculpting two-piece sets.",
    alt: "Sage activewear two-piece set — FABRIOZA custom sportswear manufacturing",
  },
  {
    file: "sweaterdress-oatmeal.jpg",
    label: "Dresses & Knitwear",
    desc: "Elegant knit pieces and modest silhouettes.",
    alt: "Oatmeal knit sweater dress — FABRIOZA custom knitwear manufacturing",
  },
  {
    file: "hoodie-embroidery.jpg",
    label: "Custom Embroidery",
    desc: "Tonal and detailed stitched branding.",
    alt: "Tonal custom embroidery stitched on a hoodie — FABRIOZA custom branding",
  },
  {
    file: "tee-sand.jpg",
    label: "Heavyweight Tees",
    desc: "Boxy, structured staples in premium cotton.",
    alt: "Sand heavyweight boxy t-shirt in premium cotton — FABRIOZA custom tee manufacturing",
  },
  {
    file: "sublimation-shirt.jpg",
    label: "All-Over Sublimation",
    desc: "Vivid full-garment print on technical fabric.",
    alt: "All-over sublimation printed shirt on technical fabric — FABRIOZA sublimation manufacturing",
  },
];

export default function WhatWeMake() {
  return (
    <section className="bg-[#f4f1ea] border-y border-[#e6e1d6] py-14">
      <div className="mx-auto max-w-[1180px] px-6">
        <header className="mb-8 max-w-3xl">
          <h2 className="font-serif text-3xl md:text-4xl text-[#1d1f1e]">What We Make</h2>
          <p className="mt-2 text-[#6b726d] text-lg">
            Representative of the custom pieces we develop for our partners.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PRODUCTS.map((p) => (
            <article
              key={p.file}
              className="group bg-white border border-[#e6e1d6] rounded-2xl overflow-hidden transition duration-300 hover:shadow-xl hover:-translate-y-1"
            >
              <div className="relative aspect-[4/5] overflow-hidden bg-[#efeae0]">
                <Image
                  src={`/products-premium/${p.file}`}
                  alt={p.alt}
                  fill
                  loading="lazy"
                  sizes="(max-width: 560px) 100vw, (max-width: 980px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <h3 className="text-[#1d1f1e] font-semibold text-[17px]">{p.label}</h3>
                <p className="mt-1 text-sm text-[#6b726d] leading-relaxed">{p.desc}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
