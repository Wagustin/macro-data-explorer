/* PerData - Google AdSense slots, only for visitors without a paid plan.
 * Slots are <div class="pd-ad" data-ad-kind="infeed|display"></div> placed in the page, plus
 * in-feed slots that this script inserts in the news list. Nothing shows until ADS.enabled is true
 * (after AdSense approves the site and the ad units exist), except with ?anuncios=vista, which
 * draws labelled placeholders to judge the layout. Ads load when they come near the viewport, in a
 * box with reserved height so the page doesn't jump. Auto ads stay off in the AdSense account.
 */
(function () {
  var ADS = {
    enabled: false,
    client: "ca-pub-3342536112010915",
    slots: { infeed: "", display: "" },   // ad unit ids from AdSense, once created
    infeedLayoutKey: ""                    // "data-ad-layout-key" of the in-feed unit
  };
  var preview = /[?&]anuncios=vista\b/.test(location.search);
  if (!ADS.enabled && !preview) return;

  function paidUser() {
    try {
      var u = window.MDE_Auth && window.MDE_Auth.getUser && window.MDE_Auth.getUser();
      return !!(u && (u.plan === "pro" || u.plan === "boletin"));
    } catch (e) { return false; }
  }

  function fill(slot) {
    if (slot.dataset.filled) return;
    slot.dataset.filled = "1";
    var kind = slot.getAttribute("data-ad-kind") || "display";
    slot.classList.add("is-on", "pd-ad-" + kind);
    var label = document.createElement("span");
    label.className = "pd-ad-label";
    label.textContent = "Publicidad";
    var box = document.createElement("div");
    box.className = "pd-ad-box";
    slot.appendChild(label);
    slot.appendChild(box);
    if (preview) {
      box.classList.add("is-preview");
      box.textContent = kind === "infeed" ? "Anuncio nativo (en la lista)" : "Anuncio adaptable";
      return;
    }
    var ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.setAttribute("data-ad-client", ADS.client);
    ins.setAttribute("data-ad-slot", ADS.slots[kind] || ADS.slots.display);
    if (kind === "infeed" && ADS.infeedLayoutKey) {
      ins.setAttribute("data-ad-format", "fluid");
      ins.setAttribute("data-ad-layout-key", ADS.infeedLayoutKey);
    } else {
      ins.setAttribute("data-ad-format", "auto");
      ins.setAttribute("data-full-width-responsive", "true");
    }
    box.appendChild(ins);
    try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {}
  }

  var io = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } });
      }, { rootMargin: "300px 0px" })
    : null;

  // A display:none element never intersects, so the slot becomes a 1px block while it waits
  function watch(slot) { slot.classList.add("is-armed"); if (io) io.observe(slot); else fill(slot); }

  // News: one in-feed slot after the 8th and the 20th headline, re-added when the list re-renders
  function newsSlots() {
    var list = document.getElementById("newsList");
    if (!list) return;
    var place = function () {
      if (list.querySelector(".pd-ad")) return;
      var items = Array.prototype.filter.call(list.children, function (c) { return !c.classList.contains("pd-ad"); });
      [8, 20].forEach(function (n) {
        if (items.length > n) {
          var slot = document.createElement("div");
          slot.className = "pd-ad";
          slot.setAttribute("data-ad-kind", "infeed");
          items[n - 1].after(slot);
          watch(slot);
        }
      });
    };
    new MutationObserver(place).observe(list, { childList: true });
    place();
  }

  function start() {
    if (paidUser()) return;
    document.querySelectorAll(".pd-ad").forEach(watch);
    newsSlots();
  }

  // Wait for the session to be known; if the user turns out to have a paid plan, remove the slots
  window.addEventListener("mde:auth-change", function () {
    if (paidUser()) document.querySelectorAll(".pd-ad").forEach(function (s) { s.remove(); });
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(start, 300); });
  else setTimeout(start, 300);
})();
