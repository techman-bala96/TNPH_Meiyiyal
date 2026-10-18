import { test } from "node:test";
import assert from "node:assert/strict";
import { GoogleGeo } from "../../supabase/functions/_shared/googleGeo.ts";

const geo = (lat, lng, addr) => ({ formatted_address: addr, place_id: "pid", geometry: { location: { lat, lng } },
  address_components: [{ long_name: "Triplicane", types: ["sublocality", "sublocality_level_1"] }, { long_name: "Chennai", types: ["locality"] }, { long_name: "Tamil Nadu", types: ["administrative_area_level_1"] }] });

test("reverse + search map to the app's place shape and stay inside Tamil Nadu", async () => {
  const urls = [];
  const f = async (u) => { urls.push(u); return new Response(JSON.stringify(u.includes("latlng=") ? { status: "OK", results: [geo(13.05, 80.28, "Marina Beach, Chennai")] }
    : { status: "OK", results: [geo(13.05, 80.28, "Marina, Chennai"), geo(19.07, 72.87, "Marine Drive, Mumbai")] })); };
  const g = new GoogleGeo("KEY", f);
  const r = await g.reverse(13.05, 80.28, "ta");
  assert.equal(r.display_name, "Marina Beach, Chennai");
  assert.equal(r.address.suburb, "Triplicane"); assert.equal(r.address.city, "Chennai");
  assert.match(urls[0], /language=ta/);
  const s = await g.search("marina", "en");
  assert.equal(s.length, 1, "Mumbai result dropped");
  assert.match(urls[1], /components=country:IN\|administrative_area:TN/);
});

test("autocomplete uses Places (New) with the TN rectangle and session token; place details validate the id", async () => {
  let req;
  const f = async (u, init) => {
    if (u.endsWith("places:autocomplete")) { req = { u, init, body: JSON.parse(init.body) }; return new Response(JSON.stringify({ suggestions: [{ placePrediction: { placeId: "ChIJ1234567890", text: { text: "Anna Nagar, Chennai" } } }] })); }
    return new Response(JSON.stringify({ id: "ChIJ1234567890", displayName: { text: "Anna Nagar" }, formattedAddress: "Anna Nagar, Chennai", location: { latitude: 13.085, longitude: 80.21 } }));
  };
  const g = new GoogleGeo("KEY", f);
  const s = await g.autocomplete("anna na", "en", "sess-1");
  assert.deepEqual(s, [{ place_id: "ChIJ1234567890", text: "Anna Nagar, Chennai" }]);
  assert.equal(req.init.headers["X-Goog-Api-Key"], "KEY");
  assert.equal(req.body.sessionToken, "sess-1");
  assert.deepEqual(req.body.locationRestriction.rectangle.low, { latitude: 8.0, longitude: 76.2 });
  assert.equal((await g.place("ChIJ1234567890", "en", "sess-1")).lat, "13.085");
  assert.equal(await g.place("../../etc", "en", "s"), null);
});
