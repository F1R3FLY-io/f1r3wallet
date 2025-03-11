// @ts-check
const defaultLocalPorts    = { grpc: 40401, http: 40403, httpAdmin: 40405 }
const defaultLocalPortsSSL = { grpc: 40401, https: 443, httpAdmin: 40405 }

const defaultRemotePorts    = { grpc: 30001, http: 30003, httpAdmin: 30005 }
const defaultRemotePortsSSL = { grpc: 30001, https: 443, httpAdmin: 30005 }

// Shard IDs
const defaultShardId = 'root'
const testNetShardId = 'testnet6'
const mainNetShardId = '' // not used until HF2

// Token name
const tokenName = 'REV'
// Number of decimal places for token display (balance, phlo limit, labels)
const defautTokenDecimal = 8

// Local network

export const localNet = {
  title: 'Local network',
  name: 'localnet',
  tokenName,
  tokenDecimal: defautTokenDecimal,
  hosts: [
    { domain: 'localhost', shardId: defaultShardId, ...defaultLocalPorts },
    { domain: 'localhost', shardId: defaultShardId, grpc: 40411, http: 40413, httpAdmin: 40415 },
  ],
  readOnlys: [
    { domain: 'localhost', shardId: defaultShardId, ...defaultLocalPorts },
    { domain: 'localhost', shardId: defaultShardId, grpc: 40411, http: 40413, httpAdmin: 40415 },
  ]
}

// Test network
const domainMap = {
  'asi-dev': '146.235.215.215',
  'asi-stg': '159.54.178.87',
  'asi-prod': '167.234.221.56'
};

const getIPFromAlias = alias => domainMap[alias];

const range = n => [...Array(n).keys()];

const getTestNetUrls = n => {
  const alias = Object.keys(domainMap)[n];
  const instance = `node${n}`
  return {
    domain: alias,
    ip: getIPFromAlias(alias),
    instance,
    shardId: testNetShardId,
    ...defaultRemotePortsSSL,
  }
}

const ASIHosts = range(Object.keys(domainMap).length).map(getTestNetUrls);

export const testNet = {
  title: 'F1r3fly testing network',
  name: 'testnet',
  tokenName,
  tokenDecimal: defautTokenDecimal,
  hosts: ASIHosts,
  readOnlys: range(Object.keys(domainMap).length).map(n => {
    const alias = Object.keys(domainMap)[n];
    return {
      domain: alias,
      ip: getIPFromAlias(alias),
      instance: `observer-${alias}`,
      shardId: testNetShardId,
      ...defaultRemotePortsSSL,
    };
  }),
}

// MAIN network

const getMainNetUrls = n => ({
  domain: `146.235.215.215`,
  shardId: mainNetShardId,
  ...defaultRemotePortsSSL,
})

const mainnetHosts = range(1).map(getMainNetUrls)

// TODO: not used until mainnet is not deployed
export const mainNet = {
  title: 'F1r3fly MAIN network',
  name: 'mainnet',
  tokenName,
  tokenDecimal: defautTokenDecimal,
  hosts: mainnetHosts,
  readOnlys: [
    // Load balancer (not gRPC) server for us, asia and eu servers
    { domain: 'dev', shardId: mainNetShardId, https: 443 },
    { domain: 'dev', shardId: mainNetShardId, ...defaultRemotePortsSSL },
  ],
}

export const getNodeUrls = ({name, tokenName, tokenDecimal, shardId, domain, grpc, http, https, httpAdmin, httpsAdmin, instance}) => {
  const ipAddress = getIPFromAlias(domain);
  const scheme       = !!https ? 'https' : !!http ? 'http' : ''
  const schemeAdmin  = !!httpsAdmin ? 'https' : !!httpAdmin ? 'http' : ''
  const httpUrl = !!https || !!http ? `${scheme}://${ipAddress}:${https || http}` : void 8;
  const httpAdminUrl = !!httpsAdmin || !!httpAdmin ? `${schemeAdmin}://${ipAddress}:${httpsAdmin || httpAdmin}` : void 8;
  const grpcUrl = !!grpc ? `${ipAddress}:${grpc}` : void 8;

  return {
    network      : name,
    tokenName,
    tokenDecimal,
    shardId,
    grpcUrl,
    httpUrl,
    httpAdminUrl,
    statusUrl    : `${httpUrl}/api/status`,
    getBlocksUrl : `${httpUrl}/api/blocks`,
    // Testnet only
    logsUrl : instance && `http://${domain}:8181/logs/name:${instance}`,
  }
}
