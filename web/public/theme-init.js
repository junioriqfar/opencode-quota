(function () {
  try {
    var key = "opencode-quota-theme";
    var stored = localStorage.getItem(key);
    var dark =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#09090b" : "#ffffff");
  } catch (_) {
    // ignore
  }
})();
