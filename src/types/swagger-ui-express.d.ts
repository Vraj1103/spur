declare module "swagger-ui-express" {
  import { RequestHandler } from "express";
  const swaggerUi: {
    serve: RequestHandler | RequestHandler[];
    setup: (spec: any, opts?: any) => RequestHandler;
  };
  export default swaggerUi;
}
