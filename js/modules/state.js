import { load, save } from "../utils/storage.js";

const defaultUsers = [
  {
    id: "user_admin",
    name: "Admin User",
    email: "admin@ias2.test",
    password: "admin123",
    role: "admin",
    createdAt: "2026-09-19T00:00:00.000Z"
  },
  {
    id: "user_demo",
    name: "Demo Customer",
    email: "user@ias2.test",
    password: "user123",
    role: "user",
    createdAt: "2026-09-19T00:00:00.000Z"
  }
];

const defaultItems = [
  {
    id: "item_lamp",
    name: "Aura Desk Lamp",
    category: "Workspace",
    price: 1290,
    stock: 16,
    image: "assets/img/desk-lamp.jpg",
    description: "Adjustable task lighting with warm and cool modes.",
    active: true
  },
  {
    id: "item_headphones",
    name: "Pulse Wireless Headphones",
    category: "Audio",
    price: 2450,
    stock: 11,
    image: "assets/img/headphones.jpg",
    description: "Lightweight wireless listening with soft ear cushions.",
    active: true
  },
  {
    id: "item_keyboard",
    name: "Metro Mechanical Keyboard",
    category: "Computer",
    price: 3150,
    stock: 8,
    image: "assets/img/keyboard.jpg",
    description: "Compact keyboard with tactile switches and quiet stabilizers.",
    active: true
  },
  {
    id: "item_watch",
    name: "Stride Smart Watch",
    category: "Wearables",
    price: 1890,
    stock: 19,
    image: "assets/img/smartwatch.jpg",
    description: "Daily health tracking, notifications, and long battery life.",
    active: true
  },
  {
    id: "item_speaker",
    name: "Orbit Bluetooth Speaker",
    category: "Audio",
    price: 1650,
    stock: 14,
    image: "assets/img/speaker.jpg",
    description: "Room-filling sound in a palm-sized, splash-proof shell.",
    active: true
  },
  {
    id: "item_mouse",
    name: "Glide Ergo Mouse",
    category: "Computer",
    price: 980,
    stock: 22,
    image: "assets/img/mouse.jpg",
    description: "Silent-click ergonomic mouse with adjustable DPI.",
    active: true
  },
  {
    id: "item_monitor",
    name: "Vista 27-inch 4K Monitor",
    category: "Computer",
    price: 18500,
    stock: 6,
    image: "assets/img/monitor.jpg",
    description: "27-inch 4K IPS panel with 99% sRGB color and slim bezels.",
    active: true
  },
  {
    id: "item_kettle",
    name: "Beacon Pour-Over Kettle",
    category: "Kitchen",
    price: 1750,
    stock: 9,
    image: "assets/img/pour-over.jpg",
    description: "Gooseneck kettle with thermometer cap for precise brewing.",
    active: true
  },
  {
    id: "item_backpack",
    name: "Commuter Everyday Backpack",
    category: "Lifestyle",
    price: 2250,
    stock: 12,
    image: "assets/img/backpack.jpg",
    description: "Water-resistant 22L pack with a padded 16-inch laptop sleeve.",
    active: true
  },
  {
    id: "item_sneakers",
    name: "Dash Court Sneakers",
    category: "Lifestyle",
    price: 3890,
    stock: 10,
    image: "assets/img/sneakers.jpg",
    description: "Cushioned court classics in breathable canvas.",
    active: true
  },
  {
    id: "item_sunglasses",
    name: "Solstice Sunglasses",
    category: "Lifestyle",
    price: 1150,
    stock: 4,
    image: "assets/img/sunglasses.jpg",
    description: "Polarized UV400 lenses in a lightweight acetate frame.",
    active: true
  },
  {
    id: "item_powerbank",
    name: "Volt 20K Power Bank",
    category: "Gadgets",
    price: 1450,
    stock: 18,
    image: "assets/img/powerbank.jpg",
    description: "Fast-charging 20,000mAh with dual USB-C ports.",
    active: true
  }
];

// Bump when the default catalog changes: existing installs get new items and
// refreshed photos merged in once (user deletions are respected afterwards).
const SEED_VERSION = 2;

const sortLabels = {
  featured: "Featured",
  priceLow: "Price low to high",
  priceHigh: "Price high to low",
  stock: "Stock available"
};

const state = {
  users: load("users", defaultUsers),
  items: load("items", defaultItems),
  orders: load("orders", []),
  cart: load("cart", []),
  wishlist: load("wishlist", []),
  currentUserId: localStorage.getItem("ias2.commerce.currentUserId") || "",
  view: "shop",
  adminTab: "items",
  search: "",
  category: "All",
  sort: "featured",
  authMode: "login",
  theme: localStorage.getItem("ias2.commerce.theme") || "light"
};

// Seed upgrade: if the stored catalog predates the current seed, merge in the
// new default items (matched by id) and refresh photos for the originals.
// Runs once per version bump — afterwards admin edits are the source of truth.
const storedSeedVersion = Number(localStorage.getItem("ias2.commerce.seedVersion") || "1");
if (storedSeedVersion < SEED_VERSION) {
  const storedById = new Map(state.items.map((item) => [item.id, item]));
  defaultItems.forEach((item) => {
    const existing = storedById.get(item.id);
    if (existing) {
      existing.image = item.image;
      existing.description = item.description;
    } else {
      state.items.push(structuredClone(item));
    }
  });
  save("items", state.items);
  try {
    localStorage.setItem("ias2.commerce.seedVersion", String(SEED_VERSION));
  } catch {
    /* storage unavailable; upgrade will simply re-run next boot */
  }
}

export { state, defaultUsers, defaultItems, sortLabels, SEED_VERSION };