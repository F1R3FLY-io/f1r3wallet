// Reference to TypeScript definitions for IntelliSense in VSCode
/// <reference path="../../rnode-grpc-gen/js/rnode-grpc-js.d.ts" />
// @ts-check
const grpc = require('@grpc/grpc-js')
const { ec } = require('elliptic')

//const { rnodeDeploy, rnodePropose, signDeploy, verifyDeploy, rhoParToJson } = require('@tgrospic/rnode-grpc-js')
const { rnodeDeploy, rnodePropose, signDeploy, verifyDeploy, rhoParToJson } = require('../../libs/rnode-grpc-js')

// Generated files with rnode-grpc-js tool
const protoSchema = require('../../rnode-grpc-gen/js/pbjs_generated.json')
// Import generated protobuf types (in global scope)
require('../../rnode-grpc-gen/js/DeployServiceV1_pb')
require('../../rnode-grpc-gen/js/ProposeServiceV1_pb')

const { log, warn } = console
const util = require('util')

const sampleRholangCode = `1110`//create//update

const rnodeExternalUrl = 'localhost:40401'
// const rnodeExternalUrl = '146.235.215.215:30001' //dev env
// const rnodeExternalUrl = 'node3.testnet.rchain.coop:40401'

const rnodeInternalUrl = 'localhost:40402'
// const rnodeInternalUrl = '146.235.215.215:30002' //dev env
const rnodeExample = async () => {
  // Get RNode service methods
  const options = host => ({grpcLib: grpc, host, protoSchema})

  const {
    getBlocks,
    lastFinalizedBlock,
    doDeploy,
    isFinalized
  } = rnodeDeploy(options(rnodeExternalUrl))

  const {propose} = rnodePropose(options(rnodeInternalUrl))

  const lastBlockObj = await lastFinalizedBlock()
  log('✅ Last Finalized Block:', lastBlockObj)


  const blocks = await getBlocks({depth: 1})
  log('BLOCKS', blocks)

  const secp256k1 = new ec('secp256k1')
  const key = secp256k1.genKeyPair()
  const deployData = {
    term: sampleRholangCode,
    timestamp: 0,
    phloprice: 1,
    phlolimit: 50e3,
    validafterblocknumber: 0,
    shardid: 'root',
  }
  const deploy = signDeploy(key, deployData)
  log('✅ SIGNED DEPLOY', deploy)

  const isValidDeploy = verifyDeploy(deploy)
  log('✅ DEPLOY IS VALID', isValidDeploy)

  const {result} = await doDeploy(deploy)
  log('✅ DEPLOY RESPONSE', result)

  const proposeResponse = await propose();
  console.log("🔹 Full propose response:", proposeResponse);

  if (proposeResponse.error && Array.isArray(proposeResponse.error.messagesList)) {
    const errorMessage = proposeResponse.error.messagesList.join("\n");
    console.error("🚨 Propose failed with error:", errorMessage);
    throw new Error(`Propose failed: ${errorMessage}`);
  }

  const {result: proposeRes} = proposeResponse;
  if (!proposeRes || proposeRes.trim() === "") {
    throw new Error("Propose failed: Empty response");
  }


  console.log("✅ PROPOSE RESPONSE", proposeRes);

  const match = proposeRes.match(/Success! Block (\w+) created and added\./);
  if (!match) {
    throw new Error("Propose did not return a valid block hash.");
  }

  const blockHash = match[1];
  console.log("🔹 Extracted block hash:", blockHash);

  const {isfinalized} = await isFinalized({hash: blockHash});

  if (!isfinalized) {
    console.log("❌ Deploy is NOT finalized yet.");
    throw new Error(`Block ${blockHash} is not finalized.`);
  }

  console.log("✅ Deploy is finalized! 🚀");

}

rnodeExample()
