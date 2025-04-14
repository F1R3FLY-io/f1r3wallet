// @ts-check
import * as R from 'ramda'

let deployCache = []
let balanceCache = new Map()

export const addToDeployCache = (deploy) => {
  // Check if the sender's balance is in the cache
  if (!balanceCache.has(deploy.fromAccount.revAddr)) {
    console.error('❌ Unknown balance:', {
      from: deploy.fromAccount.name,
      address: deploy.fromAccount.revAddr
    })
    throw new Error(`Unknown balance for ${deploy.fromAccount.name}. Please check balance first.`)
  }

  // Get the sender's current balance
  const currentBalance = balanceCache.get(deploy.fromAccount.revAddr)
  const newBalance = currentBalance - deploy.amount

  // Check for sufficient funds
  if (newBalance < 0) {
    console.error('❌ Insufficient funds:', {
      from: deploy.fromAccount.name,
      currentBalance,
      amount: deploy.amount,
      required: deploy.amount - currentBalance
    })
    throw new Error(`Insufficient funds in ${deploy.fromAccount.name}. Current balance: ${currentBalance}, required: ${deploy.amount}`)
  }

  // Update the sender's balance
  balanceCache.set(deploy.fromAccount.revAddr, newBalance)
  
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
    fromBalance: newBalance,
    toBalance: toBalance + deploy.amount,
    totalDeploys: deployCache.length
  })
}

export const getDeployCache = () => {
  console.log('📋 Current cache state:', {
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
  return deployCache
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
    // Відновлюємо баланси
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