import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson } from "../content-loader.mjs";

const projectRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const candidateDirectory = resolve(projectRoot, "outputs/edubrief/content-candidates/retrieval-practice-week-v1.1-candidate.3");
const reviewZipPath = resolve(projectRoot, "outputs/edubrief-retrieval-practice-review-candidate-v1.1-candidate-3.zip");
const approvalPath = resolve(process.argv[2] ?? "/Users/macbook/Downloads/EduBrief_External_Delta_Approval_Retrieval_Practice_v1.1_candidate3.md");
const outputDirectory = resolve(projectRoot, "outputs/edubrief/content-packages-staging/retrieval-practice-distribution-1.1.0-rc.1");

const EXPECTED = {
  reviewZip: "5350fd3b73077c3e88e0971a7a6fe6fd9a638edd3a91e5d32b4a0d908b54480f",
  candidateContent: "0616ad474a60dc19583ba778c2ec27b9bdb0d30d6fc728809005c8323d0641ec",
  candidateManifest: "ce9dc6dd5e8e0d202c1486a6fdbfb542f050bf9542c30f0c8caad3bcbf7beb48",
  approval: "e2062c9cca3e3a583097aa8ab20aa3770796124ce9b08c9d6503e5c23126c267",
  v1Manifest: "1309cefe589de53f6961c2bb6a2e7be0603194a7ec71a589708df0dae226e400",
  v1Content: "d796fb45f16c90e002d4c99ad196e301d34374316474b4e971d5521932130c51",
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function readVerified(path, expectedHash, label) {
  const bytes = await readFile(path);
  assert(sha256(bytes) === expectedHash, `${label}: unerwarteter SHA-256.`);
  return bytes;
}

async function immutableWrite(path, bytes) {
  try {
    await access(path);
    const existing = await readFile(path);
    assert(Buffer.compare(existing, bytes) === 0, `Immutabilitätskonflikt: ${path} existiert mit anderem Inhalt.`);
    return "unchanged";
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeFile(path, bytes, { flag: "wx" });
    return "created";
  }
}

await readVerified(reviewZipPath, EXPECTED.reviewZip, "Review-ZIP");
await readVerified(resolve(candidateDirectory, "review-manifest.json"), EXPECTED.candidateManifest, "Review-Manifest");
const candidateBytes = await readVerified(resolve(candidateDirectory, "retrieval-practice-week.content.json"), EXPECTED.candidateContent, "Kandidatencontent");
const approvalBytes = await readVerified(approvalPath, EXPECTED.approval, "Externes Freigabedokument");
await readVerified(resolve(projectRoot, "outputs/edubrief/content-packages/retrieval-practice-week/manifest.json"), EXPECTED.v1Manifest, "V1-Manifest");
await readVerified(resolve(projectRoot, "outputs/edubrief/content-packages/retrieval-practice-week/retrieval-practice-week.content.json"), EXPECTED.v1Content, "V1-Content");

const approvalText = approvalBytes.toString("utf8");
assert(approvalText.includes("External Delta Content Gate: PASSED"), "Das externe Content Gate ist nicht als PASSED dokumentiert.");
assert(approvalText.includes(EXPECTED.candidateContent), "Das Freigabedokument referenziert nicht den erwarteten Contenthash.");

const candidate = JSON.parse(candidateBytes.toString("utf8"));
assert(candidate.candidateMetadata?.candidateVersion === "1.1.0-candidate.3", "Falsche Kandidatenversion.");
assert(candidate.candidateMetadata?.status === "review-candidate", "Falscher Kandidatenstatus.");
assert(candidate.cards?.length === 5, "Es werden genau fünf Karten erwartet.");

const content = {
  locale: candidate.locale,
  sources: candidate.sources,
  topics: candidate.topics,
  themeWeeks: candidate.themeWeeks,
  cards: candidate.cards.map((card) => ({
    ...card,
    implementations: card.implementations.map((item) => ({ ...item, reviewStatus: "approved" })),
  })),
  tombstones: [],
};

const implementations = content.cards.flatMap((card) => card.implementations);
assert(implementations.length === 15, "Es werden genau 15 Umsetzungen erwartet.");
assert(new Set(implementations.map((item) => item.implementationId)).size === 15, "Umsetzungs-IDs sind nicht eindeutig.");
assert(implementations.every((item) => item.reviewStatus === "approved"), "Nicht alle Umsetzungen tragen den bestandenen Content-Gate-Status.");

const contentBytes = Buffer.from(`${JSON.stringify(content, null, 2)}\n`, "utf8");
const contentHash = sha256(contentBytes);
const firstReview = content.cards[0].reviewState;
for (const card of content.cards) {
  assert(card.reviewState.contentAuthorId === firstReview.contentAuthorId, "Uneinheitliche Content-Author-ID.");
  assert(card.reviewState.scientificReviewerId === firstReview.scientificReviewerId, "Uneinheitliche Scientific-Reviewer-ID.");
  assert(card.reviewState.editorialReviewerId === firstReview.editorialReviewerId, "Uneinheitliche Editorial-Reviewer-ID.");
}

const manifestWithoutHash = {
  packageId: "edutools.edubrief.retrieval-practice-week",
  publisherId: "edutools",
  packagePurpose: "distribution",
  schemaVersion: "3.0.0-distribution",
  contentVersion: "1.1.0-rc.1",
  createdByAppVersion: "1.0.2",
  minimumAppVersion: "1.0.2",
  createdAt: "2026-07-22T00:00:00Z",
  releaseStatus: "ready-for-release-approval",
  publicationStatus: "P3",
  locale: "de-DE",
  hashAlgorithm: "sha-256",
  canonicalization: "edubrief-canonical-json-v1",
  files: [
    {
      path: "retrieval-practice-week.content.json",
      mediaType: "application/json",
      bytes: contentBytes.byteLength,
      sha256: contentHash,
    },
  ],
  counts: {
    sources: content.sources.length,
    topics: content.topics.length,
    themeWeeks: content.themeWeeks.length,
    cards: content.cards.length,
    implementations: implementations.length,
    tombstones: content.tombstones.length,
  },
  contentAuthorId: firstReview.contentAuthorId,
  scientificReviewerId: firstReview.scientificReviewerId,
  editorialReviewerId: firstReview.editorialReviewerId,
  sourceCandidateVersion: candidate.candidateMetadata.candidateVersion,
  sourceContentSha256: EXPECTED.candidateContent,
  contentGateApprovalRef: basename(approvalPath),
  contentGateApprovalSha256: EXPECTED.approval,
};

const manifest = {
  ...manifestWithoutHash,
  manifestHash: sha256(Buffer.from(canonicalJson(manifestWithoutHash), "utf8")),
};
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");

await mkdir(outputDirectory, { recursive: true });
const contentResult = await immutableWrite(resolve(outputDirectory, "retrieval-practice-week.content.json"), contentBytes);
const manifestResult = await immutableWrite(resolve(outputDirectory, "manifest.json"), manifestBytes);

process.stdout.write(`${JSON.stringify({
  outputDirectory,
  contentResult,
  manifestResult,
  contentBytes: contentBytes.byteLength,
  contentSha256: contentHash,
  manifestBytes: manifestBytes.byteLength,
  manifestSha256: sha256(manifestBytes),
  manifestHash: manifest.manifestHash,
}, null, 2)}\n`);
