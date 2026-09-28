// Runs in <head>, before first paint (a tiny blocking script; the CSP forbids inline ones).
// 1. The hot-metal headword sets itself once per browser: later visits get it already set.
// 2. Remembers where you clicked a same-site link, so the next page's ink bleeds out from there.
(function () {
  var root = document.documentElement;
  try {
    if (localStorage.getItem("jv-set")) root.classList.add("hero-set");
    else localStorage.setItem("jv-set", "1");
  } catch (e) {}
  try {
    var at = sessionStorage.getItem("jv-ink");
    if (at) {
      var xy = at.split(",");
      root.style.setProperty("--ink-x", xy[0] + "vw");
      root.style.setProperty("--ink-y", xy[1] + "vh");
      sessionStorage.removeItem("jv-ink");
    }
  } catch (e) {}
  addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href^="/"]');
    if (!a) return;
    try {
      sessionStorage.setItem("jv-ink", Math.round((ev.clientX / innerWidth) * 100) + "," + Math.round((ev.clientY / innerHeight) * 100));
    } catch (e) {}
  }, true);
})();
