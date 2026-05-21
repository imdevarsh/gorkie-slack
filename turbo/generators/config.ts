import { execSync } from "node:child_process";
import type { PlopTypes } from "@turbo/gen";

interface PackageJson {
  dependencies: Record<string, string>;
  name: string;
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("package", {
    description: "Generate a new internal package",
    prompts: [
      {
        type: "input",
        name: "name",
        message:
          "Package name? (skip the @repo/ prefix, e.g. 'utils' → @repo/utils)",
      },
      {
        type: "input",
        name: "deps",
        message:
          "Extra npm dependencies? (space-separated, leave blank to skip)",
      },
    ],
    actions: [
      (answers) => {
        if ("name" in answers && typeof answers.name === "string") {
          answers.name = answers.name.replace(/^@repo\//, "");
        }
        return "Sanitized name";
      },
      {
        type: "add",
        path: "packages/{{ name }}/package.json",
        templateFile: "templates/package.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{ name }}/tsconfig.json",
        templateFile: "templates/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{ name }}/src/index.ts",
        template: "export const name = '{{ name }}';\n",
      },
      async (answers) => {
        if (
          "name" in answers &&
          "deps" in answers &&
          typeof answers.name === "string" &&
          typeof answers.deps === "string" &&
          answers.deps.trim()
        ) {
          const pkg = JSON.parse(
            require("node:fs").readFileSync(
              `packages/${answers.name}/package.json`,
              "utf8"
            )
          ) as PackageJson;

          for (const dep of answers.deps.split(" ").filter(Boolean)) {
            const version = await fetch(
              `https://registry.npmjs.org/-/package/${dep}/dist-tags`
            )
              .then((res) => res.json() as Promise<Record<string, string>>)
              .then((json) => json.latest);
            if (!pkg.dependencies) {
              pkg.dependencies = {};
            }
            pkg.dependencies[dep] = `^${version}`;
          }

          require("node:fs").writeFileSync(
            `packages/${answers.name}/package.json`,
            JSON.stringify(pkg, null, 2)
          );
        }

        execSync("bun install", { stdio: "inherit" });
        return "Package scaffolded";
      },
    ],
  });
}
