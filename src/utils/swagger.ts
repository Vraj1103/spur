import swaggerJSDoc, { Options } from "swagger-jsdoc";
import fs from "fs";
import path from "path";

// Try to read package.json for version/description
let pkg: { name?: string; version?: string; description?: string } = {};
try {
  const pkgPath = path.resolve(process.cwd(), "package.json");
  const raw = fs.readFileSync(pkgPath, "utf8");
  pkg = JSON.parse(raw);
} catch (e) {
  // ignore
}

const options: Options = {
  definition: {
    openapi: "3.0.1",
    info: {
      title: pkg.name || "Spur Chat Backend",
      version: pkg.version || "1.0.0",
      description: pkg.description || "Spur Chat backend API",
    },
    servers: [
      {
        url:
          process.env.BASE_URL ||
          `http://localhost:${process.env.PORT || 8000}`,
      },
    ],
  },
  // Scan routes for JSDoc comments (adjust pattern if your routes live elsewhere)
  apis: ["./src/routes/*.ts", "./src/routes/*.js"],
};

export const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;
