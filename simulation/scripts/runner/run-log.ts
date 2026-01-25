import { execSync } from "child_process";
import path from "path";

const now = new Date();
const timestamp = now.toISOString().replace(/:/g, "-");
const outPath = path.join(
  __dirname,
  "results",
  "logs",
  `${timestamp}.log`
);

execSync(
  `ts-node "${path.join(__dirname, "index.ts")}" > "${outPath}"`,
  { stdio: "inherit" }
);

console.log("Generated log: ", outPath);
