const SwaggerParser = require("@apidevtools/swagger-parser");

const SPEC_URL = "http://127.0.0.1:8585/openapi.json";

async function test() {
  // 1) Fetch manually with the known-good header
  const res = await fetch(SPEC_URL, {
    headers: {
      "x-api-key": "dev-key",
      "accept": "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}\n${text.slice(0, 300)}`);
  }

  // 2) Confirm JSON parse (if this fails, you're not getting JSON back)
  let spec;
  try {
    spec = JSON.parse(text);
  } catch (e) {
    throw new Error(`Response wasn't JSON. First 200 chars:\n${text.slice(0, 200)}`);
  }

  // 3) Validate (and resolve any external $refs with headers)
  const api = await SwaggerParser.validate(spec, {
    resolve: {
      http: {
        headers: {
          "x-api-key": "dev-key",
          "accept": "application/json",
        },
      },
    },
  });

  console.log("✅ OpenAPI validated");
  console.log(`Title   : ${api.info?.title}`);
  console.log(`Version : ${api.info?.version}`);
  console.log(`Paths   : ${Object.keys(api.paths || {}).length}`);
}

async function test_1() {
  try {
    const api = await SwaggerParser.validate(SPEC_URL, {
      resolve: {
        http: {
          headers: {
            'x-api-key': 'dev-key',
            'Accept': 'application/json',
          },
        },
      },
    });

    console.log("✅ OpenAPI spec loaded successfully");
    console.log(`Title   : ${api.info?.title}`);
    console.log(`Version : ${api.info?.version}`);
    console.log(`Paths   : ${Object.keys(api.paths || {}).length}`);
  } catch (err) {
    console.error("❌ Failed:", err.message);
    console.error(JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
  }
}

test_1();

/**
test().catch((err) => {
  console.error("❌ Failed:", err.message);
  process.exit(1);
});
*/