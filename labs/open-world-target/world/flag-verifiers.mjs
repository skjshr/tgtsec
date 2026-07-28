import { createHash, timingSafeEqual } from "node:crypto";

// Public, one-way verifier data. `private-answers.mjs` is build-only and must
// never be copied to the Debian target.
const ANSWER_DIGESTS = Object.freeze({
  "flag-entry-web":
    "651ec454239bdc21138fee91d0f241b9ff0cd498fe45281759e0cbae8ea685f1",
  "flag-entry-smb":
    "99104acca2eca3d44d165276a2f78a6f66ef7c5ffe95305bb29a763d363017fa",
  "flag-entry-nfs":
    "95acb2b846b24163551a73a39c2267e2c147d22ba9a9500115add1901ba3e465",
  "flag-foothold-www-data":
    "71a766b195212a3cc2c2e9a806b0144ecef6941806766bcc4dc90ea0cfab0aee",
  "flag-foothold-sales":
    "399300180c8b80dcfd2c158dcbe031b667be3db49179d99777d811e6ad58b8b0",
  "flag-foothold-mechanic":
    "15fab0f7cb45417fe57035395e6361f30d7e09e880a23f5398884a80cc2b191d",
  "flag-clue-sudo":
    "196f745d5b135864e43ca38b97539677e18ab4c836f4d14423d74aeac596165e",
  "flag-clue-timer":
    "c8eb2a5c97a74c1c09a698f802e6cf8a01df73351fefb8ec3a0709332c0d44f5",
  "flag-clue-suid":
    "c02b199d5ca4448265062e530364dbbee1e34d322682245eb0c147a6747d87f8",
  "flag-route-sudo":
    "0e8f737108c4a6806ae5dfd74bb4b4424ae9431c5fa4ac2dd3138f60eb58f2eb",
  "flag-route-timer":
    "7370d03c2f5ee921b66094d4fc475f6ca74bda39f3675858c2bd97f8a0331165",
  "flag-route-suid":
    "a477809271c6e81f34eb00d4d2020e302ec2a0a75f9503c5a1dd03da32f4d73a",
  "flag-root-common":
    "b48126d2fd87ba584522180ef46f6a0703b9389ab759e584d7b662b21606acaf",
  "flag-windows":
    "5e3f88bdba6439fc7599e69a3512c3c2053c11ea4925718ddc1ab267dd68c8cf",
});

const ANSWER_HASHES = new Map(
  Object.entries(ANSWER_DIGESTS).map(([flagId, digest]) => {
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error(`invalid verifier digest for ${flagId}`);
    }
    return [flagId, Buffer.from(digest, "hex")];
  }),
);

export function getVerifierFlagIds() {
  return Object.keys(ANSWER_DIGESTS);
}

export function verifyFlagAnswer(candidate) {
  if (
    typeof candidate !== "string" ||
    candidate.length < 12 ||
    candidate.length > 128
  ) {
    return null;
  }

  const candidateHash = createHash("sha256")
    .update(candidate, "utf8")
    .digest();

  for (const [flagId, expectedHash] of ANSWER_HASHES) {
    if (timingSafeEqual(candidateHash, expectedHash)) {
      return flagId;
    }
  }
  return null;
}
