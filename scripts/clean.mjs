import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
console.log("[build] removed stale dist output");
