import { prepareDocument } from "../services/exchange/adapters";
self.onmessage = async (event: MessageEvent) => {
  try {
    const result = await prepareDocument(event.data.text, event.data.options);
    self.postMessage({ result });
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Could not validate JSON.",
    });
  }
};
