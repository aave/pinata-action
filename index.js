const core = require("@actions/core");
const github = require("@actions/github");
const { context } = require("@actions/github/lib/utils");
const pinataSDK = require("@pinata/sdk");

const PIN_ALIAS = core.getInput("PIN_ALIAS");
const BUILD_LOCATION = core.getInput("BUILD_LOCATION");
const PINATA_API_KEY = core.getInput("PINATA_API_KEY");
const PINATA_SECRET_KEY = core.getInput("PINATA_SECRET_KEY");
const CID_VERSION = core.getInput("CID_VERSION");

if (!PINATA_SECRET_KEY)
  core.setFailed(`PINATA_SECRET_KEY is required, but missing`);
if (!PINATA_API_KEY) core.setFailed(`PINATA_API_KEY is required, but missing`);
if (!PIN_ALIAS) core.setFailed(`PIN_ALIAS is required, but missing`);
if (!BUILD_LOCATION) core.setFailed(`BUILD_LOCATION is required, but missing`);
if (!CID_VERSION) core.setFailed(`CID_VERSION is required, but missing`);
if (!["0", "1"].includes(CID_VERSION))
  core.setFailed(`CID_VERSION must be 0 or 1`);

const cleanupAndPin = async () => {
  const pinata = pinataSDK(PINATA_API_KEY, PINATA_SECRET_KEY);
  try {
    await pinata.testAuthentication();
    console.log("Auth successful");

    console.log("Uploading the latest build");
    try {
      const result = await pinata.pinFromFS(BUILD_LOCATION, {
        pinataMetadata: {
          name: PIN_ALIAS,
        },
        pinataOptions: {
          cidVersion: Number(CID_VERSION),
        },
      });
      return result.IpfsHash;
    } catch (e) {
      console.log("Pinning was failed with error");
      core.setFailed(e);
    }
  } catch (e) {
    console.log("Pinata auth was failed");
    core.setFailed(e);
  }
};

cleanupAndPin().then(async (hash) => {
  core.setOutput("hash", hash);
  let uri;
  if (CID_VERSION == 1) {
    uri = `https://${hash}.ipfs.cf-ipfs.com/`;
  } else if (CID_VERSION == 0) {
    uri = `https://cloudflare-ipfs.com/ipfs/${hash}/`;
  }
  core.setOutput("uri", uri);
  const GITHUB_TOKEN = core.getInput("GITHUB_TOKEN");
  if (GITHUB_TOKEN) {
    const octokit = github.getOctokit(GITHUB_TOKEN);
    if (github.context.eventName == "pull_request") {
      await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: context.payload.pull_request.number,
        body: `- Ipfs hash: ${hash}\n- Ipfs preview link: ${uri}`,
      });
    } else {
      await octokit.rest.repos.createCommitComment({
        ...context.repo,
        commit_sha: github.context.sha,
        body: `This commit was deployed on ipfs\n- ipfs hash: ${hash}\n- ipfs preview link: ${uri}`,
      });
    }
  }
});
