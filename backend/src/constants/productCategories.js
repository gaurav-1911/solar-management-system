// Default product categories matching the catalog's original hardcoded list.
//
// These are ordinary, user-manageable records — they can be edited, recolored,
// renamed or deleted from the Product Catalog UI just like any other category.
// They are only ever created once (when the collection is first empty); after a
// category is deleted it is never re-created, even if the seed runs again.
export const DEFAULT_PRODUCT_CATEGORIES = [
    { key: "solar-panels", label: "Solar Panels", color: "#2563eb", icon: "☀️", description: "Photovoltaic solar panels" },
    { key: "inverters", label: "Inverters", color: "#16a34a", icon: "⚡", description: "Inverters and power conditioning" },
    { key: "batteries", label: "Batteries", color: "#ca8a04", icon: "🔋", description: "Energy storage batteries" },
    { key: "solar-water-pumps", label: "Solar Water Pumps", color: "#9333ea", icon: "💧", description: "Solar-powered water pumps" },
    { key: "charge-controllers", label: "Charge Controllers", color: "#2c5364", icon: "🔌", description: "Charge controllers and regulators" },
    { key: "mounting-structures", label: "Mounting Structures", color: "#dc2626", icon: "🛠️", description: "Racking and mounting systems" },
    { key: "connectors", label: "Connectors", color: "#0891b2", icon: "🔗", description: "Cable connectors and MC4" },
    { key: "cables", label: "Cables", color: "#6366f1", icon: "🪢", description: "Solar cables and wiring" }
];
