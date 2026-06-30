/* FABRIOZA homepage — editable interactions. No framework. */
(function () {
  "use strict";

  // ---- Product category filter ----
  var tabs = document.querySelectorAll(".tab");
  var products = document.querySelectorAll(".product");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      var cat = tab.getAttribute("data-filter");
      products.forEach(function (p) {
        var show = cat === "all" || p.getAttribute("data-cat") === cat;
        p.classList.toggle("hide", !show);
      });
    });
  });

  // ---- Mobile menu ----
  var menuBtn = document.querySelector(".menu-btn");
  var links = document.querySelector(".nav-links");
  if (menuBtn && links) {
    menuBtn.addEventListener("click", function () { links.classList.toggle("open"); });
    links.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { links.classList.remove("open"); });
    });
  }

  // ---- Live order ticker (edit this list freely) ----
  var ORDERS = [
    { city: "London, UK", item: "1,000 sublimated jerseys", ago: "5 min ago" },
    { city: "Berlin, DE", item: "300 heavyweight hoodies", ago: "12 min ago" },
    { city: "Sydney, AU", item: "500 gym sets", ago: "21 min ago" },
    { city: "Toronto, CA", item: "150 embroidered tees", ago: "34 min ago" },
    { city: "Dubai, AE", item: "800 team uniforms", ago: "48 min ago" },
    { city: "New York, US", item: "250 streetwear hoodies", ago: "1 hr ago" }
  ];
  var ticker = document.getElementById("ticker");
  if (ticker) {
    var i = 0;
    var cityEl = ticker.querySelector("[data-city]");
    var itemEl = ticker.querySelector("[data-item]");
    var agoEl = ticker.querySelector("[data-ago]");
    function rotate() {
      var o = ORDERS[i % ORDERS.length];
      cityEl.textContent = o.city;
      itemEl.textContent = "ordered " + o.item;
      agoEl.textContent = o.ago;
      ticker.classList.add("show");
      setTimeout(function () { ticker.classList.remove("show"); }, 4500);
      i++;
    }
    setTimeout(rotate, 2000);
    setInterval(rotate, 7000);
  }

  // ---- Contact form (posts to the existing PHP handler) ----
  var form = document.getElementById("lead-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = form.querySelector(".form-msg");
      var btn = form.querySelector("button[type=submit]");
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      data.source = "fabrioza.com homepage";
      btn.disabled = true; btn.textContent = "Sending…";
      msg.textContent = "";
      fetch("/api/send-email.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          msg.style.color = "#2b8a3e";
          msg.textContent = (j && j.message) || "Thank you! We'll get back to you within 24 hours.";
          form.reset();
        })
        .catch(function () {
          msg.style.color = "#b3261e";
          msg.textContent = "Something went wrong. Please email info@fabrioza.com directly.";
        })
        .finally(function () { btn.disabled = false; btn.textContent = "Get My Free Quote"; });
    });
  }

  // ---- Footer year ----
  var y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();
})();
