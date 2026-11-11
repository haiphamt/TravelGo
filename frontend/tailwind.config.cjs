// Didaune's public UI utilities, scoped to the components that reuse its templates.
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  important: ".didaune-ui",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', "Inter", "sans-serif"] },
      colors: { primary: "#f97316", primary_light: "#ffedd5" },
    },
  },
};
