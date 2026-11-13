import { createApp } from "./app";
import { lookupAppById, lookupAppStore } from "./lib/appleLookup";
import { buildIapHints } from "./lib/iapHints";
import { fetchProductPageDetails } from "./lib/productPage";

const app = createApp({
  lookupAppById,
  lookupAppStore,
  fetchProductPageDetails,
  buildIapHints,
});

const port = 3001;

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
