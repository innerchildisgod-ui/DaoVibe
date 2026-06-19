import * as http from "http";
import * as https from "https";
import { URL } from "url";

export function requestJson<T>(
  method: "GET" | "POST",
  urlString: string,
  body?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const client = parsedUrl.protocol === "https:" ? https : http;

    const request = client.request(
      {
        method,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        headers: {
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload).toString(),
              }
            : {}),
        },
      },
      (response) => {
        let data = "";

        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          data += chunk;
        });

        response.on("end", () => {
          try {
            const parsed = data ? JSON.parse(data) : {};

            if (
              !response.statusCode ||
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {
              const errorMessage =
                typeof parsed.error === "string"
                  ? parsed.error
                  : `HTTP ${response.statusCode}`;

              reject(new Error(errorMessage));
              return;
            }

            resolve(parsed as T);
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}
