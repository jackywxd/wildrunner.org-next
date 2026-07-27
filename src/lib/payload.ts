import { getPayload, type Payload } from "payload";
import config from "@payload-config";

let payloadPromise: Promise<Payload> | null = null;

export async function getPayloadClient(): Promise<Payload> {
  if (!payloadPromise) {
    payloadPromise = getPayload({ config });
  }
  return payloadPromise;
}
