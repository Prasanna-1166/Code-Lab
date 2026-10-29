// Loaded in <head> before the page paints, so there is no light/dark flash.
(function () {
  var saved = null;
  try { saved = localStorage.getItem("lcl-theme"); } catch (e) { /* storage may be blocked */ }
  var dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
