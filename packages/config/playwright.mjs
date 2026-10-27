// The callback passed to page.evaluate runs in the browser, not in Node.
/* global indexedDB */

/** Reads one key from the app's IndexedDB key-value store — see playwright.d.mts. */
export function readStored(page, database, key) {
  return page.evaluate(
    ([name, storedKey]) =>
      new Promise((resolve) => {
        const request = indexedDB.open(name);
        // No database yet: don't create one the app would then open empty.
        request.onupgradeneeded = () => request.transaction.abort();
        request.onerror = () => resolve(undefined);
        request.onsuccess = () => {
          const db = request.result;
          const read = db.transaction("kv").objectStore("kv").get(storedKey);
          read.onerror = () => resolve(undefined);
          read.onsuccess = () => resolve(read.result);
          read.transaction.oncomplete = () => db.close();
        };
      }),
    [database, key],
  );
}

/** Adds a WebAuthn authenticator with PRF — see playwright.d.mts. */
export async function installPrfAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      hasPrf: true,
      automaticPresenceSimulation: true,
    },
  });
}
