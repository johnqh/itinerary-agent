import { describe, expect, test } from "vitest";
import { photoUrlsFromPlace, photoProxyUrl, isPlacePhotoUrl } from "@/routing/placePhotos";

/**
 * Photographs for researched places.
 *
 * Asking the model for image URLs is unreliable — it returns page links, or
 * nothing at all — and a place with no picture is the first thing a traveller
 * notices. Places publishes photographs for somewhere it already knows, so
 * they are fetched rather than requested.
 *
 * The URL points back at this origin, because the key is attached server-side.
 * Nothing here ever puts a credential in a page.
 */

describe("photoProxyUrl", () => {
  test("routes through this origin so no key reaches the page", () => {
    const url = photoProxyUrl("places/abc/photos/xyz");
    expect(url.startsWith("/places/")).toBe(true);
    expect(url).not.toMatch(/key=/i);
  });

  test("asks for a size worth showing", () => {
    expect(photoProxyUrl("places/abc/photos/xyz")).toMatch(/maxWidthPx=\d{3,}/);
  });

  test("is recognisable as a place photo afterwards", () => {
    expect(isPlacePhotoUrl(photoProxyUrl("places/abc/photos/xyz"))).toBe(true);
  });

  test("does not mistake an ordinary link for one", () => {
    expect(isPlacePhotoUrl("https://example.com/a.jpg")).toBe(false);
    expect(isPlacePhotoUrl("/api/v1/models")).toBe(false);
  });
});

describe("photoUrlsFromPlace", () => {
  const place = {
    photos: [
      { name: "places/a/photos/1" },
      { name: "places/a/photos/2" },
      { name: "places/a/photos/3" },
      { name: "places/a/photos/4" },
      { name: "places/a/photos/5" },
    ],
  };

  test("takes a few rather than everything the place has", () => {
    expect(photoUrlsFromPlace(place)).toHaveLength(4);
  });

  test("keeps them in the order the place published them", () => {
    const urls = photoUrlsFromPlace(place);
    expect(urls[0]).toContain("photos/1");
    expect(urls[1]).toContain("photos/2");
  });

  test("returns nothing for a place with no photographs", () => {
    expect(photoUrlsFromPlace({ photos: [] })).toEqual([]);
    expect(photoUrlsFromPlace({})).toEqual([]);
  });

  test("survives a malformed entry without dropping the good ones", () => {
    const urls = photoUrlsFromPlace({ photos: [{}, { name: "places/a/photos/9" }] });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("photos/9");
  });

  test("survives a payload that is not a place at all", () => {
    expect(photoUrlsFromPlace("nonsense")).toEqual([]);
  });
});
