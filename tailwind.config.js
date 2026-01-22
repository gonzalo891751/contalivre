import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#3B82F6",
          secondary: "#10B981",
          dark: "#0F172A",
        },
        slate: {
          850: "#111827",
          900: "#0F172A",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #2563EB 0%, #10B981 100%)",
        "brand-gradient-hover": "linear-gradient(135deg, #60A5FA 0%, #34D399 100%)",
      },
      fontFamily: {
        display: ["Outfit", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        body: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        soft: "0 8px 24px rgba(15, 23, 42, 0.10)",
        glow: "0 0 15px rgba(59, 130, 246, 0.3)",
      },
    },
  },
  plugins: [animate],
  corePlugins: { preflight: false },
};
