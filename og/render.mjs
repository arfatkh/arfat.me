// render.mjs — renders og/og.html to /og.png (1200x630) with headless Chrome.
// Not part of the Cloudflare build (no Chrome there): run it locally after
// editing og.html and commit the PNG. Override the browser with CHROME=...
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..", "og.png");

execFileSync(process.env.CHROME || "google-chrome", [
  "--headless=new",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1200,630",
  "--virtual-time-budget=3000", // let the web fonts load before capture
  `--screenshot=${out}`,
  "file://" + path.join(here, "og.html"),
], { stdio: "inherit" });

console.log(`wrote ${path.relative(process.cwd(), out)}`);
