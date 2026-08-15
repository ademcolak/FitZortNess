import fs from "node:fs";
import crypto from "node:crypto";
import { config } from "./config.js";

const DATASET_COMMIT = "43cf5cef31841e8ea50788d315ec73e2d6d232d0";
const DATASET_SHA256 = "4fb7cb6bbf27fa3d078d2b28305c45d0e5a563cacee88390d191d6e8c05c2f07";
const errors = [];
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

if (nodeMajor < 24) errors.push(`Node.js 24 veya ustu gerekli; mevcut surum ${process.versions.node}.`);
if (!fs.existsSync(config.datasetPath)) {
  errors.push([
    `Dataset bulunamadi: ${config.datasetPath}`,
    "Egitim ve ticari olmayan kullanim kosullarini kabul ediyorsan:",
    "git init vendor/exercises-dataset",
    "git -C vendor/exercises-dataset remote add origin https://github.com/hasaneyldrm/exercises-dataset.git",
    `git -C vendor/exercises-dataset fetch --depth 1 origin ${DATASET_COMMIT}`,
    "git -C vendor/exercises-dataset checkout --detach FETCH_HEAD"
  ].join("\n"));
} else {
  const datasetChecksum = crypto.createHash("sha256").update(fs.readFileSync(config.datasetPath)).digest("hex");
  if (datasetChecksum !== DATASET_SHA256) errors.push(`Dataset checksum beklenen sabit surumle eslesmiyor: ${config.datasetPath}`);
}
if (!fs.existsSync(config.exerciseMediaManifestPath)) errors.push(`Medya manifesti bulunamadi: ${config.exerciseMediaManifestPath}`);
if (!fs.existsSync(".env")) errors.push(".env bulunamadi; .env.example dosyasini .env olarak kopyalayip degerleri doldur.");
if (!config.telegramBotToken) errors.push("TELEGRAM_BOT_TOKEN bos; bot baslatilamaz.");
if (!config.allowedUserIds.length && !config.allowOpenPilot) errors.push("Telegram allowlist bos; TELEGRAM_ALLOWED_USER_IDS veya TELEGRAM_ALLOW_ALL ayarla.");

if (errors.length) {
  for (const error of errors) console.error(`HATA: ${error}`);
  process.exitCode = 1;
} else {
  console.log("Kurulum kontrolu tamam: zorunlu yerel dosyalar hazir.");
}
