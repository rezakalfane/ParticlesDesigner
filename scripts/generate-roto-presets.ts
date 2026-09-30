import { format } from "prettier";
import { mkdirSync, writeFileSync } from "node:fs";
import { designerSetupDocuments } from "../src/designer/rotoLayout";
mkdirSync("roto", { recursive: true });
for (const doc of designerSetupDocuments()) {
  writeFileSync(
    `roto/${doc.index} ${doc.name}.json`,
    await format(JSON.stringify(doc), { parser: "json", printWidth: 100 }),
  );
}
