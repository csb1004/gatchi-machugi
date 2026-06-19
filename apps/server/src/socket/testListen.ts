import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

const fetchBlockedPorts = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110,
  111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061,
  6000, 6566, 6697, 10080
]);

function isFetchBlockedPort(port: number) {
  return fetchBlockedPorts.has(port) || (port >= 6665 && port <= 6669);
}

function closeServer(server: HttpServer) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function listenOnce(server: HttpServer) {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });

  return (server.address() as AddressInfo).port;
}

export async function listenOnTestPort(server: HttpServer): Promise<number> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const port = await listenOnce(server);
    if (!isFetchBlockedPort(port)) return port;
    await closeServer(server);
  }

  throw new Error("Could not find a fetch-safe test port.");
}
