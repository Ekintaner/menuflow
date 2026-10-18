import { expect, it } from "vitest";
import {
  rewriteImages,
  signedImagePath,
} from "../../scripts/phone-pilot-lib.mjs";

const valid =
  "http://127.0.0.1:55431/storage/v1/object/sign/menu-images/tenant/product/photo.png?token=" +
  "a".repeat(30);
it("rewrites only narrow signed menu-image URLs, including nested admin responses", () => {
  expect(
    rewriteImages({ products: [{ image_url: valid }], url: valid }),
  ).toEqual({
    products: [
      {
        image_url: "/_pilot" + new URL(valid).pathname + new URL(valid).search,
      },
    ],
    url: valid,
  });
});
it.each([
  valid.replace("127.0.0.1", "evil.test"),
  valid.replace("http:", "https:"),
  valid.replace("menu-images", "private-bucket"),
  valid.replace("photo.png", "../secret"),
  valid.replace("photo.png", "%2Fsecret"),
  valid.replace("/product/photo", "/product/sub/photo"),
  valid + "&redirect=https://evil.test",
  valid + "&token=another",
  valid.replace(/\?token=.*/, ""),
  "http://127.0.0.1:55431/auth/v1/admin/users",
])("rejects broader proxy targets: %s", (value) => {
  expect(signedImagePath(value)).toBeNull();
  expect(rewriteImages({ image_url: value })).toEqual({ image_url: value });
});
