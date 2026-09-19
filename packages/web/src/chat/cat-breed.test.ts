import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveCatBreed } from "./cat-breed";

test("maps the three lounge cats onto distinct breed portraits", () => {
  assert.equal(resolveCatBreed("architect").breedId, "maine-coon");
  assert.equal(resolveCatBreed("reviewer").breedId, "siamese");
  assert.equal(resolveCatBreed("builder").breedId, "british-shorthair");
  assert.equal(resolveCatBreed("architect").portraitSrc, "/cats/maine-coon.png");
  assert.equal(resolveCatBreed("reviewer").portraitSrc, "/cats/siamese.png");
  assert.equal(
    resolveCatBreed("builder").portraitSrc,
    "/cats/british-shorthair.png",
  );
  assert.notEqual(
    resolveCatBreed("architect").coat,
    resolveCatBreed("reviewer").coat,
  );
  assert.notEqual(
    resolveCatBreed("reviewer").coat,
    resolveCatBreed("builder").coat,
  );
});
