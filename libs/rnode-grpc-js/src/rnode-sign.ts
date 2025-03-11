import {blake2b, blake2bHex} from 'blakejs'
import { ec } from 'elliptic'
import jspb from 'google-protobuf'

/**
 * These deploy types are based on protobuf specification which must be
 * used to create the hash and signature of deploy data.
 */

/**
 * Deploy data (required for signing)
 */
export interface UnsignedDeployData {
  readonly term: string
  readonly timestamp: number
  readonly phlolimit: number
  readonly phloprice: number
  readonly validafterblocknumber: number
  readonly shardid: string
}

/**
 * Signed DeployData object (protobuf specification)
 * NOTE: Represents the same type as generated DeployData.
 */
export interface DeploySignedProto {
  readonly term: string
  readonly timestamp: number
  readonly phlolimit: number
  readonly phloprice: number
  readonly validafterblocknumber: number
  readonly shardid: string
  readonly sigalgorithm: string
  readonly deployer: Uint8Array
  readonly sig: Uint8Array
}

export const signDeploy = function (privateKey: ec.KeyPair | string, deployObj: UnsignedDeployData): DeploySignedProto {
  const { term, timestamp, phlolimit, phloprice, validafterblocknumber, shardid } = deployObj;
  const sigalgorithm = 'secp256k1';

  console.log("SignDeploy - DeployDataProto (pre-serialization):");
  console.log("  term:", term);
  console.log("  term.lenght:", term.length);
  console.log("  phloPrice:", phloprice);
  console.log("  phloLimit:", phlolimit);
  console.log("  shardId:", shardid);
  console.log("  validAfterBlockNumber:", validafterblocknumber);

  const crypt = new ec(sigalgorithm);
  const key = getSignKey(crypt, privateKey);
  const unsignedDeploy = { term, timestamp, phlolimit, phloprice, validafterblocknumber, shardid };
  const deploySerialized = deployDataProtobufSerialize(unsignedDeploy);
  console.log("Sign deploy - Serialized DeployDataProto (hex) [" + deploySerialized.length + " bytes]:", Buffer.from(deploySerialized).toString('hex'));
  const hashed = blake2b(deploySerialized, undefined, 32);
  console.log("Sign deploy - Blake2b Hash (hex):", Buffer.from(hashed).toString('hex'));

  const sigArray = key.sign(hashed, { canonical: true }).toDER();
  const sig = Uint8Array.from(sigArray);
  console.log("Sign deploy - Signature (DER hex) [" + sig.length + " bytes]:", Buffer.from(sig).toString('hex'));

  const deployerHex = key.getPublic().encode('hex', false);
  console.log("Sign deploy - Public Key (hex) [" + deployerHex.length / 2 + " bytes]:", deployerHex);
  const deployer = Uint8Array.from(Buffer.from(deployerHex, 'hex'));
  const finalDeploy = {
    term, timestamp, phlolimit, phloprice, validafterblocknumber, shardid,
    sigalgorithm, deployer, sig
  };
  return finalDeploy;
};

/**
  * Verifies deploy for a valid signature.
  */
export const verifyDeploy = (deployObj: DeploySignedProto) => {
  const {
    term, timestamp, phlolimit, phloprice, validafterblocknumber, shardid,
    sigalgorithm, deployer, sig,
  } = deployObj
  const deploySerialized = deployDataProtobufSerialize({
    term, timestamp, phlolimit, phloprice, validafterblocknumber, shardid
  })
  // Signing public key to verif
  const crypt   = new ec(sigalgorithm)
  const key     = crypt.keyFromPublic(deployer)
  // Hash and verify signature
  //const hashed  = blake2bHex(deploySerialized, void 666, 32)
  const hashed = blake2b(deploySerialized, undefined, 32);
  const isValid = key.verify(hashed, sig)

  return isValid
}

/**
 * Serialization of DeployDataProto object without generated JS code.
 */
export const deployDataProtobufSerialize = (deployData: UnsignedDeployData) => {
  const {term, timestamp, phlolimit, phloprice, validafterblocknumber, shardid} = deployData

  // Create binary stream writer
  const writer = new jspb.BinaryWriter()
  // Write fields (protobuf doesn't serialize default values)
  const writeString = (order: number, val: string) => val != "" && writer.writeString(order, val)
  const writeInt64  = (order: number, val: number) => val != 0  && writer.writeInt64(order, val)

  // https://github.com/rchain/rchain/blob/ebe4d476371/models/src/main/protobuf/CasperMessage.proto#L134-L149
  // message DeployDataProto {
  //   bytes  deployer             = 1; //public key
  //   string term                 = 2; //rholang source code to deploy (will be parsed into `Par`)
  //   int64  timestamp            = 3; //millisecond timestamp
  //   bytes  sig                  = 4; //signature of (hash(term) + timestamp) using private key
  //   string sigAlgorithm         = 5; //name of the algorithm used to sign
  //   int64 phloPrice             = 7; //phlo price
  //   int64 phloLimit             = 8; //phlo limit for the deployment
  //   int64 validAfterBlockNumber = 10;
  //   string shardId              = 11;//shard ID to prevent replay of deploys between shards
  // }

  //Serialize fields
  writeString(2, term)
  writeInt64(3, timestamp)
  writeInt64(7, phloprice)
  writeInt64(8, phlolimit)
  writeInt64(10, validafterblocknumber)
  writeString(11, shardid)

  return writer.getResultBuffer()
}

/**
 * Fix for ec.keyFromPrivate not accepting KeyPair.
 * - detect KeyPair if it have `sign` function
 */
const getSignKey = (crypt: ec, pk: ec.KeyPair | string) =>
  pk && typeof pk != 'string' && pk.sign && pk.sign.constructor == Function ? pk : crypt.keyFromPrivate(pk)
