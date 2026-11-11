import type { LocalProfile, Place } from "./data";

const categories = new Set(["coffee", "food", "nature", "culture", "drink", "lodging"]);
const localImagePath = /^\/images\/local\/[a-f0-9-]+\/[0-9]+\.webp$/;
const osmId = /^osm:(node|way|relation)\/(\d+)$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Thiếu ${field} trong danh mục.`);
  return value.trim();
}
function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return text(value, field);
}
function date(value: unknown, field: string): string | null {
  const result = optionalText(value, field);
  if (result !== null && (
    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(`${result.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== result.slice(0, 10)
  )) throw new Error(`Ngày ${field} không hợp lệ.`);
  return result;
}
function strings(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`Danh sách ${field} không hợp lệ.`);
  return value.map((item) => text(item, field));
}
function sourceUrl(value: unknown): string {
  const result = text(value, "liên kết nguồn");
  const source = new URL(result);
  if (source.protocol !== "https:" || source.username || source.password)
    throw new Error("Liên kết nguồn không hợp lệ.");
  return result;
}
function localProfile(value: unknown, local: boolean): LocalProfile | undefined {
  if (value === null || value === undefined) return undefined;
  if (!local || !isRecord(value) || !isRecord(value["hours"]) || !Array.isArray(value["sources"]))
    throw new Error("Hồ sơ Local không hợp lệ.");
  const hours = value["hours"];
  const sources = value["sources"].map((source) => {
    if (!isRecord(source)) throw new Error("Nguồn hồ sơ Local không hợp lệ.");
    return {
      label: text(source["label"], "tên nguồn Local"),
      url: sourceUrl(source["url"]),
      updatedAt: date(source["updatedAt"], "nguồn Local cập nhật"),
    };
  });
  if (!sources.length) throw new Error("Thiếu nguồn hồ sơ Local.");
  return {
    categoryLabel: text(value["categoryLabel"], "phân loại Local"),
    productsNote: text(value["productsNote"], "nguồn món chính"),
    hours: {
      summary: optionalText(hours["summary"], "tóm tắt giờ nguồn"),
      weekdays: strings(hours["weekdays"], "lịch theo thứ"),
      sourceLabel: text(hours["sourceLabel"], "nguồn giờ bán"),
      sourceUrl: sourceUrl(hours["sourceUrl"]),
      observedAt: date(hours["observedAt"], "ghi nhận giờ bán"),
      qualityFlags: strings(hours["qualityFlags"], "ghi chú chất lượng giờ bán"),
    },
    collectedAt: date(value["collectedAt"], "thu thập hồ sơ"),
    preparedAt: date(value["preparedAt"], "chuẩn bị hồ sơ"),
    sources,
  };
}
export function parseCatalog(input: unknown): Place[] {
  if (!isRecord(input) || !Array.isArray(input["places"]))
    throw new Error("Tệp danh mục không đúng định dạng.");
  const ids = new Set<string>();
  return input["places"].map((value): Place => {
    if (!isRecord(value)) throw new Error("Có hồ sơ địa điểm không hợp lệ.");
    const id = text(value["id"], "mã địa điểm");
    if (ids.has(id)) throw new Error("Danh mục có mã địa điểm trùng nhau.");
    ids.add(id);
    const category = text(value["category"], "danh mục");
    if (!categories.has(category) || value["city"] !== "hcm" || typeof value["local"] !== "boolean")
      throw new Error("Phạm vi hoặc loại địa điểm không hợp lệ.");
    const lat = value["lat"] ?? null, lng = value["lng"] ?? null;
    if ((lat !== null && (typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90)) ||
        (lng !== null && (typeof lng !== "number" || !Number.isFinite(lng) || Math.abs(lng) > 180)))
      throw new Error("Tọa độ địa điểm không hợp lệ.");
    const price = value["price"] ?? null;
    if (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0))
      throw new Error("Giá địa điểm không hợp lệ.");
    const images = strings(value["images"], "ảnh");
    const image = optionalText(value["image"], "ảnh bìa");
    const osmMatch = osmId.exec(id);
    const osmImage = osmMatch ? `/images/osm/${osmMatch[1]}-${osmMatch[2]}.jpg` : null;
    if (images.some(url => value["local"] ? !localImagePath.test(url) : url !== osmImage) ||
        (image !== null && !images.includes(image)))
      throw new Error("Đường dẫn ảnh trong danh mục không hợp lệ.");
    const photoCredit = optionalText(value["photoCredit"], "nguồn ảnh");
    const photo = value["photoSource"];
    let photoSource: Place["photoSource"];
    if (photo != null || (!value["local"] && images.length)) {
      if (value["local"] || !images.length || !image || !photoCredit || !isRecord(photo))
        throw new Error("Ảnh Khám phá cần mã địa điểm, ghi công và nguồn sử dụng.");
      photoSource = {
        url: sourceUrl(photo["url"]),
        license: text(photo["license"], "giấy phép ảnh"),
        licenseUrl: sourceUrl(photo["licenseUrl"]),
      };
    }
    const publicSourceUrl = sourceUrl(value["sourceUrl"]);
    if (typeof value["referenceOnly"] !== "boolean") throw new Error("Thiếu trạng thái nguồn dữ liệu.");
    return {
      id, name: text(value["name"], "tên địa điểm"), city: "hcm",
      category: category as Place["category"], local: value["local"],
      area: text(value["area"], "địa chỉ/mốc"), price,
      hours: optionalText(value["hours"], "giờ bán"), image, images,
      products: strings(value["products"], "món chính"),
      description: text(value["description"], "mô tả"), lat, lng,
      updated: date(value["updated"], "cập nhật"), sourceUrl: publicSourceUrl,
      sourceLabel: text(value["sourceLabel"], "tên nguồn"),
      sourceLicense: text(value["sourceLicense"], "giấy phép nguồn"),
      sourceUpdatedAt: date(value["sourceUpdatedAt"], "nguồn cập nhật"),
      referenceOnly: value["referenceOnly"],
      photoCredit, photoSource,
      localProfile: localProfile(value["localProfile"], value["local"]),
    };
  });
}
