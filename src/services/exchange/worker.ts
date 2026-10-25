import {
  prepareDocument,
  type PrepareOptions,
  type PreparedDocument,
} from "./adapters";
export function prepareInWorker(
  text: string,
  options: PrepareOptions,
): Promise<PreparedDocument> {
  if (typeof Worker === "undefined") return prepareDocument(text, options);
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/import.worker.ts", import.meta.url),
      { type: "module" },
    );
    worker.onmessage = (event) => {
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.result);
    };
    worker.onerror = () => {
      worker.terminate();
      reject(
        new Error("The local import worker failed. No records were changed."),
      );
    };
    worker.postMessage({ text, options });
  });
}
