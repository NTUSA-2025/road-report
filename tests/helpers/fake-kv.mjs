export function fakeKv(entries = {}) {
  const store = new Map(Object.entries(entries).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]));
  const writes = [];
  return {
    store,
    writes,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value) {
      writes.push(key);
      store.set(key, value);
    },
    async list({ prefix }) {
      return {
        keys: [...store.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      };
    },
    json(key) {
      return JSON.parse(store.get(key));
    },
  };
}
