// @ts-check
import * as R from 'ramda'

let deployCache = []
let balanceCache = new Map()
let deployDependencies = new Map()

export const addToDeployCache = (deploy) => {
  // Check if the sender's balance is in the cache
  if (!balanceCache.has(deploy.fromAccount.revAddr)) {
    console.error('❌ Unknown balance:', {
      from: deploy.fromAccount.name,
      address: deploy.fromAccount.revAddr
    })
    throw new Error(`Unknown balance for ${deploy.fromAccount.name}. Please check balance first.`)
  }

  // Get the sender's current balance and pending amount
  const currentBalance = balanceCache.get(deploy.fromAccount.revAddr)
  const pendingAmount = getPendingAmount(deploy.fromAccount.revAddr)
  const availableBalance = currentBalance - pendingAmount

  const incomingAmount = getIncomingAmount(deploy.fromAccount.revAddr)

  if (availableBalance < deploy.amount && incomingAmount > 0) {
    const dependencies = deployCache
      .filter(d => d.toAccount.revAddr === deploy.fromAccount.revAddr)
      .map(d => d.signature)

    deployDependencies.set(deploy.signature, dependencies)
    
    console.log('ℹ️ Deploy has dependencies:', {
      signature: deploy.signature,
      from: deploy.fromAccount.name,
      dependencies: dependencies,
      availableBalance,
      incomingAmount
    })
  }

  // Check for sufficient funds (враховуємо тільки поточний баланс)
  if (availableBalance < deploy.amount) {
    console.error('❌ Insufficient funds:', {
      from: deploy.fromAccount.name,
      currentBalance,
      pendingAmount,
      availableBalance,
      amount: deploy.amount,
      required: deploy.amount - availableBalance
    })
    throw new Error(`Insufficient funds in ${deploy.fromAccount.name}. Available balance: ${availableBalance}, required: ${deploy.amount}`)
  }

  // Update the sender's balance
  balanceCache.set(deploy.fromAccount.revAddr, currentBalance)
  
  // For the recipient: if the balance is not in the cache, set it to 0
  if (!balanceCache.has(deploy.toAccount.revAddr)) {
    console.log('ℹ️ Setting initial balance for receiver:', {
      to: deploy.toAccount.name,
      address: deploy.toAccount.revAddr,
      balance: 0
    })
    balanceCache.set(deploy.toAccount.revAddr, 0)
  }

  const toBalance = balanceCache.get(deploy.toAccount.revAddr)
  balanceCache.set(deploy.toAccount.revAddr, toBalance + deploy.amount)

  deployCache = [...deployCache, deploy]

  console.log('📥 Deploy added to cache:', {
    signature: deploy.signature,
    from: deploy.fromAccount.name,
    to: deploy.toAccount.name,
    amount: deploy.amount,
    fromBalance: currentBalance,
    toBalance: toBalance + deploy.amount,
    totalDeploys: deployCache.length,
    hasDependencies: deployDependencies.has(deploy.signature)
  })
}

export const getDeployCache = () => {
  const sortedDeploys = []
  const processed = new Set()
  
  const processDeploy = (deploy) => {
    if (processed.has(deploy.signature)) return

    const dependencies = deployDependencies.get(deploy.signature) || []
    for (const depSignature of dependencies) {
      const depDeploy = deployCache.find(d => d.signature === depSignature)
      if (depDeploy) {
        processDeploy(depDeploy)
      }
    }
    
    sortedDeploys.push(deploy)
    processed.add(deploy.signature)
  }

  for (const deploy of deployCache) {
    processDeploy(deploy)
  }

  console.log('📋 Current cache state:', {
    totalDeploys: sortedDeploys.length,
    deploys: sortedDeploys.map(d => ({
      signature: d.signature,
      from: d.fromAccount.name,
      to: d.toAccount.name,
      amount: d.amount,
      dependencies: deployDependencies.get(d.signature) || []
    })),
    balances: Array.from(balanceCache.entries()).map(([addr, balance]) => ({
      address: addr,
      balance
    }))
  })
  
  return sortedDeploys
}

export const clearDeployCache = () => {
  console.log('🧹 Clearing deploy cache. Previous state:', {
    totalDeploys: deployCache.length,
    deploys: deployCache.map(d => ({
      signature: d.signature,
      from: d.fromAccount.name,
      to: d.toAccount.name,
      amount: d.amount
    })),
    balances: Array.from(balanceCache.entries()).map(([addr, balance]) => ({
      address: addr,
      balance
    }))
  })
  deployCache = []
  balanceCache.clear()
  deployDependencies.clear()
  console.log('✅ Cache cleared. New state:', {
    totalDeploys: deployCache.length,
    balances: Array.from(balanceCache.entries()).map(([addr, balance]) => ({
      address: addr,
      balance
    }))
  })
}

export const removeFromDeployCache = (signature) => {
  console.log('🗑️ Removing deploy from cache:', {
    signature,
    previousTotal: deployCache.length
  })
  const deploy = deployCache.find(d => d.signature === signature)
  if (deploy) {
    const fromBalance = balanceCache.get(deploy.fromAccount.revAddr) || 0
    balanceCache.set(deploy.fromAccount.revAddr, fromBalance + deploy.amount)
    
    const toBalance = balanceCache.get(deploy.toAccount.revAddr) || 0
    balanceCache.set(deploy.toAccount.revAddr, toBalance - deploy.amount)
  }
  
  deployCache = deployCache.filter(d => d.signature !== signature)
  console.log('✅ Deploy removed. New total:', deployCache.length)
}

export const setInitialBalance = (address, balance) => {
  balanceCache.set(address, balance)
  console.log('💰 Set initial balance:', {
    address,
    balance
  })
}

export const getBalance = (address) => {
  return balanceCache.get(address)
}

export const getPendingAmount = (revAddr) => {
  return deployCache
    .filter(d => d.fromAccount.revAddr === revAddr)
    .reduce((total, d) => total + Number(d.amount), 0)
}

export const getIncomingAmount = (revAddr) => {
  return deployCache
    .filter(d => d.toAccount.revAddr === revAddr)
    .reduce((total, d) => total + Number(d.amount), 0)
} 