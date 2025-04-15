// @ts-check
import * as R from 'ramda'
import { checkBalance_rho } from '../rho/check-balance'
import { transferFunds_rho } from '../rho/transfer-funds'
import { addToDeployCache, getDeployCache, clearDeployCache, setInitialBalance, getBalance, getPendingAmount } from './deploy-cache'
let deployCache = []

export const makeRNodeActions = (rnodeWeb, {log, warn}) => {
  const { rnodeHttp, sendDeploy, getDataForDeploy, propose } = rnodeWeb

  // App actions to process communication with RNode
  return {
    appCheckBalance: appCheckBalance({rnodeHttp}),
    appDeploy      : appDeploy({sendDeploy, rnodeHttp, log}),
    appPropose     : appPropose({propose, getDataForDeploy, log, warn}),
    appClearCache  : appClearCache(),
  }
}

const appCheckBalance = ({rnodeHttp}) => async ({node, revAddr}) => {
  const deployCode  = checkBalance_rho(revAddr)
  const {expr: [e]} = await rnodeHttp(node.httpUrl, 'explore-deploy', deployCode)
  const dataBal     = e && e.ExprInt && e.ExprInt.data
  const dataError   = e && e.ExprString && e.ExprString.data

  // Get the balance from the cache
  const cachedBalance = getBalance(revAddr)
  const pendingAmount = getPendingAmount(revAddr)
  const availableBalance = cachedBalance - pendingAmount
  const deploys = getDeployCache()
  const hasUnconfirmedDeploys = deploys.length > 0 && 
    deploys.some(d => d.fromAccount.revAddr === revAddr || d.toAccount.revAddr === revAddr)

  // If there are unconfirmed transactions, always use the cached balance
  if (hasUnconfirmedDeploys && cachedBalance !== undefined) {
    console.log('⚠️ Using cached balance (has unconfirmed deploys):', {
      address: revAddr,
      serverBalance: dataBal,
      cachedBalance,
      deploys: deploys.length
    })
    return [{
      balance: cachedBalance,
      isCached: true,
      unconfirmedDeploys: deploys.length
    }, null]
  }

  if (dataError && (!cachedBalance || !hasUnconfirmedDeploys)) {
    return [{
      balance: 0,
      isCached: false,
      unconfirmedDeploys: 0
    }, dataError]
  }

  if (dataBal !== undefined) {
    setInitialBalance(revAddr, dataBal)
  }

  return [{
    balance: dataBal || 0,
    isCached: false,
    unconfirmedDeploys: 0
  }, dataError]
}

const appDeploy = effects => async ({node, fromAccount, toAccount, amount, setStatus}) => {
  const {sendDeploy, rnodeHttp, log} = effects

  console.log('🔍 Checking balance before deploy:', {
    from: fromAccount.name,
    to: toAccount.name,
    amount,
    node: node.httpUrl
  })

  // Get cached balance and check if it's sufficient
  const cachedBalance = getBalance(fromAccount.revAddr)
  const pendingAmount = getPendingAmount(fromAccount.revAddr)
  const availableBalance = cachedBalance - pendingAmount
  
  if (availableBalance < amount) {
    console.error(`Insufficient funds: available=${availableBalance}, required=${amount}, pending=${pendingAmount}`)
    throw new Error('Insufficient funds')
  }

  setStatus(`Deploying ...`)

  // Send deploy
  const code = transferFunds_rho(fromAccount.revAddr, toAccount.revAddr, amount)
  const {signature} = await sendDeploy(node, fromAccount, code)
  console.log('✅ Deploy sent successfully:', {
    signature,
    from: fromAccount.name,
    to: toAccount.name,
    amount
  })

  // Add to cache
  addToDeployCache({
    signature,
    fromAccount,
    toAccount,
    amount,
    node,
    code
  })

  return `✓ Deploy successful (signature: ${signature})`
}

const appPropose = effects => async ({node, setStatus}) => {
  const {propose, getDataForDeploy, log, warn} = effects

  const deploys = getDeployCache()
  if (deploys.length === 0) {
    console.log('⚠️ No deploys in cache to propose')
    return 'No deploys in cache to propose'
  }

  console.log('📦 Starting propose process:', {
    totalDeploys: deploys.length,
    node: node.httpUrl,
    deploys: deploys.map(d => ({
      signature: d.signature,
      from: d.fromAccount.name,
      to: d.toAccount.name,
      amount: d.amount
    }))
  })

  setStatus(`Proposing ...`)

  // Propose block with deploys
  try {
    await propose(node, {
      deploys: deploys.map(d => d.signature)
    }).catch(ex => {
      console.error('❌ Propose error:', ex)
      warn(ex)
      throw ex
    })
    console.log('✅ Block proposed successfully')
  } catch (ex) {
    return `Propose failed: ${ex.message}`
  }

  // Progress dots
  const mkProgress = i => () => {
    i = i > 60 ? 0 : i + 3
    return `Checking result ${R.repeat('.', i).join('')}`
  }
  const progressStep = mkProgress(0)
  const updateProgress = _ => setStatus(progressStep())
  updateProgress()

  console.log('🔍 Checking results for deploys...')
  // Check results for all deploys
  const results = []
  const successfulDeploys = new Set()

  for (const deploy of deploys) {
    const {signature, fromAccount, toAccount, amount} = deploy
    console.log('📝 Checking deploy:', {
      signature,
      from: fromAccount.name,
      to: toAccount.name,
      amount
    })

    try {
      const {data, cost} = await getDataForDeploy(node, signature, updateProgress)
      const args = data ? rhoExprToJS(data.expr) : void 0
      const costTxt = R.isNil(cost) ? 'failed to retrieve' : cost
      const [success, message] = args || [false, 'deploy found in the block but failed to get confirmation data']

      if (!success) {
        console.error('❌ Deploy failed:', {
          signature,
          from: fromAccount.name,
          to: toAccount.name,
          amount,
          error: message
        })
        warn(`Transfer error for ${fromAccount.name} -> ${toAccount.name} (${amount}): ${message}`)
        results.push(`✗ Transfer error: ${message}. // cost: ${costTxt}`)
      } else {
        console.log('✅ Deploy successful:', {
          signature,
          from: fromAccount.name,
          to: toAccount.name,
          amount,
          cost: costTxt
        })
        results.push(`✓ ${message} // cost: ${costTxt}`)
        successfulDeploys.add(signature)
      }
    } catch (ex) {
      console.error('❌ Failed to check deploy:', {
        signature,
        error: ex.message
      })
      results.push(`✗ Failed to check deploy: ${ex.message}`)
    }
  }

  // Remove only successful deploys from cache
  deployCache = deployCache.filter(d => !successfulDeploys.has(d.signature))
  
  // Update balances in cache for successful deploys
  if (successfulDeploys.size > 0) {
    console.log('🔄 Updating cache state:', {
      successfulDeploys: successfulDeploys.size,
      remainingDeploys: deployCache.length
    })
  }

  return results.join('\n')
}

const appClearCache = () => () => {
  console.log('🧹 Clearing deploy cache...')
  clearDeployCache()
  return 'Deploy cache cleared'
}

// Converts RhoExpr response from RNode WebAPI
// https://github.com/rchain/rchain/blob/b7331ae05/node/src/main/scala/coop/rchain/node/api/WebApi.scala#L128-L147
// - return!("One argument")   // monadic
// - return!((true, A, B))     // monadic as tuple
// - return!(true, A, B)       // polyadic
// new return(`rho:rchain:deployId`) in {
//   return!((true, "Hello from blockchain!"))
// }
// TODO: make it stack safe
const rhoExprToJS = input => {
  const loop = rhoExpr => convert(rhoExpr)(converters)
  const converters = R.toPairs(converterMapping(loop))
  return loop(input)
}

const convert = rhoExpr => R.pipe(
  R.map(matchTypeConverter(rhoExpr)),
  R.find(x => !R.isNil(x)),
  // Return the whole object if unknown type
  x => R.isNil(x) ? [R.identity, rhoExpr] : x,
  ([f, d]) => f(d)
)

const matchTypeConverter = rhoExpr => ([type, f]) => {
  const d = R.path([type, 'data'], rhoExpr)
  return R.isNil(d) ? void 666 : [f, d]
}

const converterMapping = loop => ({
  "ExprInt": R.identity,
  "ExprBool": R.identity,
  "ExprString": R.identity,
  "ExprBytes": R.identity,
  "ExprUri": R.identity,
  "UnforgDeploy": R.identity,
  "UnforgDeployer": R.identity,
  "UnforgPrivate": R.identity,
  "ExprUnforg": loop,
  "ExprPar": R.map(loop),
  "ExprTuple": R.map(loop),
  "ExprList": R.map(loop),
  "ExprSet": R.map(loop),
  "ExprMap": R.mapObjIndexed(loop),
})
