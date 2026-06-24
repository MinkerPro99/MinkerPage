const copyButton = document.getElementById("copyButton");
    const keyValue = document.getElementById("keyValue");
    const splash = document.getElementById("splash");
    const toast = document.getElementById("toast");

    function hideSplash() {
      splash.classList.add("hide");
    }

    addEventListener("load", () => setTimeout(hideSplash, 1620));
    setTimeout(hideSplash, 3200);

    function showToast(message) {
      toast.textContent = message;
      toast.classList.add("show");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900);
    }

    copyButton.addEventListener("click", async () => {
      const key = keyValue.textContent.trim();

      try {
        await navigator.clipboard.writeText(key);
        showToast(key.includes("XXXX") ? "Placeholder copied" : "Key copied to clipboard");
      } catch (error) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(keyValue);
        selection.removeAllRanges();
        selection.addRange(range);
        showToast("Key selected. Press Ctrl+C");
      }
    });

    const countdownTarget = new Date("2026-11-19T00:00:00").getTime();
    const fields = {
      days: document.getElementById("days"),
      hours: document.getElementById("hours"),
      minutes: document.getElementById("minutes"),
      seconds: document.getElementById("seconds")
    };

    function updateCountdown() {
      const distance = Math.max(0, countdownTarget - Date.now());
      const day = 24 * 60 * 60 * 1000;
      const hour = 60 * 60 * 1000;
      const minute = 60 * 1000;

      fields.days.textContent = String(Math.floor(distance / day)).padStart(2, "0");
      fields.hours.textContent = String(Math.floor((distance % day) / hour)).padStart(2, "0");
      fields.minutes.textContent = String(Math.floor((distance % hour) / minute)).padStart(2, "0");
      fields.seconds.textContent = String(Math.floor((distance % minute) / 1000)).padStart(2, "0");
    }

    updateCountdown();
    setInterval(updateCountdown, 1000);

    const canvas = document.getElementById("sparkCanvas");
    const ctx = canvas.getContext("2d");
    const sparks = [];
    const pointer = { x: innerWidth * .5, y: innerHeight * .48 };
    const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resizeCanvas() {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.floor(innerWidth * ratio);
      canvas.height = Math.floor(innerHeight * ratio);
      canvas.style.width = innerWidth + "px";
      canvas.style.height = innerHeight + "px";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function seedSparks() {
      sparks.length = 0;
      const count = Math.min(95, Math.max(38, Math.floor(innerWidth / 16)));

      for (let index = 0; index < count; index++) {
        sparks.push({
          x: Math.random() * innerWidth,
          y: Math.random() * innerHeight,
          vx: (Math.random() - .5) * .45,
          vy: (Math.random() - .5) * .45,
          size: Math.random() * 2.2 + .7,
          hue: Math.random() < .5 ? 320 : 188,
          alpha: Math.random() * .44 + .18
        });
      }
    }

    function drawSparks() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);

      for (const spark of sparks) {
        const dx = spark.x - pointer.x;
        const dy = spark.y - pointer.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 180) {
          spark.vx += dx / 25000;
          spark.vy += dy / 25000;
        }

        spark.x += spark.vx;
        spark.y += spark.vy;

        if (spark.x < -20) spark.x = innerWidth + 20;
        if (spark.x > innerWidth + 20) spark.x = -20;
        if (spark.y < -20) spark.y = innerHeight + 20;
        if (spark.y > innerHeight + 20) spark.y = -20;

        ctx.beginPath();
        ctx.fillStyle = `hsla(${spark.hue}, 100%, 66%, ${spark.alpha})`;
        ctx.shadowBlur = 18;
        ctx.shadowColor = `hsl(${spark.hue}, 100%, 62%)`;
        ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.shadowBlur = 0;

      if (!prefersReducedMotion) {
        requestAnimationFrame(drawSparks);
      }
    }

    addEventListener("resize", () => {
      resizeCanvas();
      seedSparks();
    });

    addEventListener("pointermove", (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    });

    resizeCanvas();
    seedSparks();
    drawSparks();
