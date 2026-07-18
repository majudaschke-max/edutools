export function createStandaloneDelivery() {
  return Object.freeze({
    type: "standalone",
    available: true,
    destroy() {},
  });
}

