// Fixture only. TLS terminates here; the second, loopback-only leg is plaintext.
// This tests the real pg driver's TLS behavior, not Supavisor/upstream TLS.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createConnection, createServer, type Socket } from "node:net";
import { createSecureContext, TLSSocket } from "node:tls";

export function fixtureCertificates() {
  const directory = mkdtempSync(join(tmpdir(), "ggs-fixture-tls-"));
  const openssl =
    process.platform === "win32"
      ? "C:/Program Files/Git/usr/bin/openssl.exe"
      : "openssl";
  const run = (args: string[]) =>
    execFileSync(openssl, args, { cwd: directory, stdio: "pipe" });
  try {
    run([
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-sha256",
      "-keyout",
      "ca.key",
      "-out",
      "ca.crt",
      "-days",
      "2",
      "-subj",
      "/CN=GG disposable test CA",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
    ]);
    const variants = ["valid", "wrong-host", "expired"] as const;
    const certificates = {} as Record<
      (typeof variants)[number],
      { key: Buffer; cert: Buffer }
    >;
    for (const variant of variants) {
      run([
        "req",
        "-new",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-sha256",
        "-keyout",
        `${variant}.key`,
        "-out",
        `${variant}.csr`,
        "-subj",
        "/CN=GG disposable fixture",
        "-addext",
        `subjectAltName=IP:${variant === "wrong-host" ? "127.0.0.2" : "127.0.0.1"}`,
      ]);
      if (variant === "expired") {
        writeFileSync(join(directory, "index.txt"), "");
        writeFileSync(join(directory, "serial.txt"), "03\n");
        writeFileSync(
          join(directory, "ca.cnf"),
          `[ca]\ndefault_ca=local\n[local]\ndatabase=index.txt\nserial=serial.txt\nnew_certs_dir=.\ncertificate=ca.crt\nprivate_key=ca.key\ndefault_md=sha256\ndefault_days=1\npolicy=names\ncopy_extensions=copy\n[names]\ncommonName=supplied\n`,
        );
        run([
          "ca",
          "-batch",
          "-config",
          "ca.cnf",
          "-startdate",
          "20000101000000Z",
          "-enddate",
          "20000102000000Z",
          "-in",
          "expired.csr",
          "-out",
          "expired.crt",
        ]);
      } else
        run([
          "x509",
          "-req",
          "-in",
          `${variant}.csr`,
          "-CA",
          "ca.crt",
          "-CAkey",
          "ca.key",
          "-set_serial",
          String(variants.indexOf(variant) + 1),
          "-days",
          "1",
          "-sha256",
          "-copy_extensions",
          "copy",
          "-out",
          `${variant}.crt`,
        ]);
      certificates[variant] = {
        key: readFileSync(join(directory, `${variant}.key`)),
        cert: readFileSync(join(directory, `${variant}.crt`)),
      };
    }
    return {
      ca: readFileSync(join(directory, "ca.crt"), "utf8"),
      certificates,
    };
  } finally {
    // The exact mkdtemp result is owned by this fixture; no user path is accepted.
    if (
      dirname(resolve(directory)) !== resolve(tmpdir()) ||
      !basename(directory).startsWith("ggs-fixture-tls-")
    ) {
      throw new Error(
        "Refusing cleanup outside the owned TLS fixture directory",
      );
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function tlsBridge(
  certificate: { key: Buffer; cert: Buffer } | null,
) {
  const sockets = new Set<Socket>();
  const track = <T extends Socket>(socket: T): T => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => socket.destroy());
    return socket;
  };
  const context = certificate ? createSecureContext(certificate) : null;
  let encryptedConnections = 0;
  const server = createServer((socket) => {
    track(socket);
    let request = Buffer.alloc(0);
    const handshake = (chunk: Buffer) => {
      request = Buffer.concat([request, chunk]);
      if (request.length < 8) return;
      socket.removeListener("data", handshake);
      if (
        request.length !== 8 ||
        request.readInt32BE(0) !== 8 ||
        request.readInt32BE(4) !== 80877103
      ) {
        socket.destroy();
        return;
      }
      if (!context) {
        socket.end("N");
        return;
      }
      socket.write("S");
      const secure = track(
        new TLSSocket(socket, { isServer: true, secureContext: context }),
      );
      secure.on("secure", () => {
        encryptedConnections++;
        const upstream = track(
          createConnection({ host: "127.0.0.1", port: 55437 }),
        );
        secure.pipe(upstream).pipe(secure);
        secure.on("close", () => upstream.destroy());
        upstream.on("close", () => secure.destroy());
      });
    };
    socket.on("data", handshake);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(55438, "127.0.0.1", resolve);
  });
  return {
    encryptedConnections: () => encryptedConnections,
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
