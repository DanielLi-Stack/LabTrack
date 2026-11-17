import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { get, put } from "@vercel/blob";

const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
function localDir() { return path.resolve(process.env.UPLOAD_DIR || "./storage"); }
function s3() {
  const endpoint = process.env.S3_ENDPOINT, region = process.env.S3_REGION, bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID, secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { bucket, client: new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } }) };
}
export async function storeImage(file: File) {
  const max = Number(process.env.MAX_UPLOAD_MB || 5) * 1024 * 1024;
  if (!allowed.has(file.type) || file.size > max || file.size === 0) throw new Error("仅支持不超过 5 MB 的 JPG、PNG 或 WebP 图片");
  const content = Buffer.from(await file.arrayBuffer());
  const signatureOk = file.type === "image/jpeg" ? content[0] === 0xff && content[1] === 0xd8 : file.type === "image/png" ? content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : content.toString("ascii", 0, 4) === "RIFF" && content.toString("ascii", 8, 12) === "WEBP";
  if (!signatureOk) throw new Error("图片内容与文件格式不符");
  const key = `${randomUUID()}.${file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp"}`;
  const remote = s3();
  if (process.env.VERCEL && process.env.BLOB_STORE_ID) await put(key, content, { access: "private", addRandomSuffix: false, contentType: file.type });
  else if (remote) await remote.client.send(new PutObjectCommand({ Bucket: remote.bucket, Key: key, Body: content, ContentType: file.type }));
  else { await mkdir(localDir(), { recursive: true }); await writeFile(path.join(localDir(), key), content, { flag: "wx" }); }
  return { key, size: file.size, mimeType: file.type, fileName: file.name };
}
export async function loadImage(key: string) {
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) throw new Error("Invalid key");
  if (process.env.VERCEL && process.env.BLOB_STORE_ID) {
    const object = await get(key, { access: "private" });
    if (!object || object.statusCode !== 200) throw new Error("Image not found");
    return Buffer.from(await new Response(object.stream).arrayBuffer());
  }
  const remote = s3();
  if (remote) {
    const object = await remote.client.send(new GetObjectCommand({ Bucket: remote.bucket, Key: key }));
    return Buffer.from(await object.Body!.transformToByteArray());
  }
  return readFile(path.join(localDir(), key));
}
