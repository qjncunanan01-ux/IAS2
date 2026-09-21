import { load } from "../utils/storage.js";

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
    image: "assets/desk-lamp.svg",
    description: "Adjustable task lighting with warm and cool modes.",
    active: true
  },
  {
    id: "item_headphones",
    name: "Pulse Wireless Headphones",
    category: "Audio",
    price: 2450,
    stock: 11,
    image: "assets/wireless-headphones.svg",
    description: "Lightweight wireless listening with soft ear cushions.",
    active: true
  },
  {
    id: "item_keyboard",
    name: "Metro Mechanical Keyboard",
    category: "Computer",
    price: 3150,
    stock: 8,
    image: "assets/mechanical-keyboard.svg",
    description: "Compact keyboard with tactile switches and quiet stabilizers.",
    active: true
  },
  {
    id: "item_watch",
    name: "Stride Smart Watch",
    category: "Wearables",
    price: 1890,
    stock: 19,
    image: "assets/smart-watch.svg",
    description: "Daily health tracking, notifications, and long battery life.",
    active: true
  }
];

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

export { state, defaultUsers, defaultItems, sortLabels };