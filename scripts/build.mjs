import { cpSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

const copyFile = (source, destination) => {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
};

copyFile("src/client/ui.html", "dist/src/client/ui.html");

rmSync("dist/demo", { recursive: true, force: true });
cpSync("demo", "dist/demo", { recursive: true });

console.log(`[build] runtime assets copied to ${join("dist", "src", "client")} and dist/demo`);
