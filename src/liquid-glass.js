const root = document.documentElement;
const chatBackground = document.getElementById("chat-bg");

function installLiquidFilter() {
  if (document.getElementById("gu-liquid-filter-defs")) return;
  const host = document.createElement("div");
  host.id = "gu-liquid-filter-defs";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `<svg width="0" height="0" focusable="false"><defs>
    <filter id="gu-liquid-filter" x="-14%" y="-18%" width="128%" height="136%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".012 .018" numOctaves="2" seed="11" result="noise" />
      <feGaussianBlur in="noise" stdDeviation=".42" result="softNoise" />
      <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="18" xChannelSelector="R" yChannelSelector="G" result="refracted" />
      <feColorMatrix in="refracted" type="saturate" values="1.16" />
    </filter>
  </defs></svg>`;
  document.body.appendChild(host);
}

function syncLiquidScene() {
  const wallpaper = chatBackground?.style.backgroundImage;
  const fallback = getComputedStyle(root).getPropertyValue("--app-gradient").trim()
    || "linear-gradient(145deg,#fbfaf4,#d8d0c2)";
  root.style.setProperty("--liquid-scene-image", wallpaper && wallpaper !== "none" ? wallpaper : fallback);
}

installLiquidFilter();
syncLiquidScene();

new MutationObserver(syncLiquidScene).observe(root, { attributes: true, attributeFilter: ["data-theme-key", "data-chat-bg"] });
if (chatBackground) new MutationObserver(syncLiquidScene).observe(chatBackground, { attributes: true, attributeFilter: ["style"] });
window.addEventListener("pageshow", syncLiquidScene);
