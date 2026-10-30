import "server-only";
import { parseServerEnvironment } from "./schema";

export function getServerEnvironment() {
  return parseServerEnvironment(process.env);
}
