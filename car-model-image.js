(function attachCarModelImageUrl(globalScope) {
  "use strict";

  const brandPaths = [
    ["Mercedes Benz", "mercedes-benz"],
    ["Lamborghini", "lamborghini"],
    ["Mitsubishi", "mitsubishi"],
    ["Volkswagen", "volkswagen"],
    ["Chevrolet", "chevrolet"],
    ["Cadillac", "cadillac"],
    ["Chrysler", "chrysler"],
    ["Citroen", "citroen"],
    ["Genesis", "genesis"],
    ["Hyundai", "hyundai"],
    ["Porsche", "porsche"],
    ["Renault", "renault"],
    ["Subaru", "subaru"],
    ["Toyota", "toyota"],
    ["Buick", "buick"],
    ["Dodge", "dodge"],
    ["Honda", "honda"],
    ["Lexus", "lexus"],
    ["Nissan", "nissan"],
    ["Peugeot", "peugeot"],
    ["Rivian", "rivian"],
    ["Tesla", "tesla"],
    ["Audi", "audi"],
    ["Ford", "ford"],
    ["Jeep", "jeep"],
    ["Mini", "mini"],
    ["Seat", "seat"],
    ["BMW", "bmw"],
    ["GMC", "gmc"],
    ["Kia", "kia"]
  ];

  globalScope.carModelImageUrl = (carName) => {
    const value = String(carName || "").trim();
    const brand = brandPaths.find(([label]) => value.startsWith(`${label} `));
    if (!brand) return "";

    const modelSlug = value
      .slice(brand[0].length)
      .trim()
      .toLowerCase()
      .replace(/[./]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!modelSlug) return "";

    return `https://thecarpicker.com/assets/models/${brand[1]}/${modelSlug}.webp`;
  };
})(typeof window === "undefined" ? globalThis : window);
