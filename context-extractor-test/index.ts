import { extractContext } from "@jpoly1219/context-extractor";
import { Language } from "@jpoly1219/context-extractor/dist/src/types";

(async () => {
  try {
    const x = await extractContext(
      Language.TypeScript,
      "/home/jacob/projects/small-examples/context-extractor-test/booking/sketch.ts",
      "/home/jacob/projects/small-examples/context-extractor-test/booking/",
    )
    console.dir(x, { depth: null })

    const obj = {
      ...x,
      relevantTypes: Object.fromEntries(x!.relevantTypes),
      relevantHeaders: Object.fromEntries(x!.relevantHeaders),
    }
    console.log(JSON.stringify(obj, null, 2))
  } catch (err) {
    console.log("top level err: ", err)
  } finally {
    process.exit(0);
  }
})();
