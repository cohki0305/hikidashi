import { createFactory } from "hono/factory";
import { provideSkillService, type SkillServicePort } from "./context";
import { skillRoutes } from "./routes";

const factory = createFactory();

/** スキル API を組み立て、service を c.var に載せる。service が無ければ入口を塞ぐ。 */
export function createSkillRoutes(service?: SkillServicePort) {
  return factory
    .createApp()
    .use("/skills", provideSkillService(service))
    .use("/skills/*", provideSkillService(service))
    .route("/", skillRoutes);
}

export type { SkillServicePort, SkillsEnv } from "./context";
