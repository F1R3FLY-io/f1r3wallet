// @ts-check
import m from 'mithril'
import * as R from 'ramda'
import { labelStyle, showTokenDecimal, labelRev, showNetworkError } from './common'
import { ethDetected } from '../../eth/eth-wrapper'
import { getBalance } from '../deploy-cache'

const initSelected = (st, wallet) => {
  const {account, toAccount} = st

  // Pre-select first account if not selected
  const selAccount = R.isNil(account) && !R.isNil(wallet)
    ? R.head(wallet) : account

  const selToAccount = R.isNil(toAccount) && !R.isNil(wallet)
    ? R.head(wallet) : toAccount

  return {...st, account: selAccount, toAccount: selToAccount}
}

export const transferCtrl = (st, {wallet, node, onDeploy, onPropose, onClearCache, onCheckBalance, warn}) => {
  const valEv = name => ev => {
    const val = ev.target.value
    st.update(s => ({...s, [name]: val}))
  }

  const deploy = async _ => {
    st.update(s => ({...s, status: '...', error: ''}))
    await onDeploy({fromAccount: account, toAccount, amount})
      .then(x => {
        st.update(s => ({...s, status: x, error: ''}))
      })
      .catch(ex => {
        st.update(s => ({...s, status: '', error: ex.message}))
        warn('Deploy error', ex)
      })
  }

  const propose = async _ => {
    st.update(s => ({...s, status: '...', error: ''}))
    await onPropose({node})
      .then(x => {
        st.update(s => ({...s, status: x, error: ''}))
      })
      .catch(ex => {
        st.update(s => ({...s, status: '', error: ex.message}))
        warn('Propose error', ex)
      })
  }

  const clearCache = async _ => {
    st.update(s => ({...s, status: '...', error: ''}))
    try {
      onClearCache()
      st.update(s => ({...s, status: 'Cache cleared', error: ''}))
    } catch (ex) {
      st.update(s => ({...s, status: '', error: ex.message}))
      warn('Clear cache error', ex)
    }
  }

  const onSelectFrom = ev => {
    const account = R.find(R.propEq('revAddr', ev.target.value), wallet)
    st.update(s => ({...s, account}))
  }

  const onSelectTo = ev => {
    const toAccount = R.find(R.propEq('revAddr', ev.target.value), wallet)
    st.update(s => ({...s, toAccount}))
  }

  // Control state
  const {account, toAccount, amount, status, error} = initSelected(st.view({}), wallet)

  const {tokenName, tokenDecimal} = node
  const labelSource      = `Source ${tokenName} address`
  const labelDestination = `Destination ${tokenName} address`
  const labelAmount      = `Amount (in tiny ${tokenName} x10^${tokenDecimal})`
  const isWalletEmpty    = R.isNil(wallet) || R.isEmpty(wallet)
  const canDeploy        = account && toAccount && amount && (account || ethDetected)
  const amountPreview    = showTokenDecimal(amount, tokenDecimal)

  // Get balances
  const fromBalance = account ? getBalance(account.revAddr) : null
  const toBalance = toAccount ? getBalance(toAccount.revAddr) : null

  // Format balance display
  const formatBalance = (balance) => 
    balance !== null && balance !== undefined 
      ? `Current balance: ${showTokenDecimal(balance, tokenDecimal)} ${tokenName}`
      : `Current balance: 0 ${tokenName}`

  return m('.ctrl.transfer-ctrl',
    m('h2', `Transfer ${tokenName} tokens`),
    isWalletEmpty ? m('b', `${tokenName} wallet is empty, add accounts to make transfers.`) : [
      m('', 'Sends transfer deploy to selected validator F1r3Node.'),

      // Source REV address dropdown
      m('', labelStyle(account), labelSource),
      m('select', {onchange: onSelectFrom},
        wallet.map(({name, revAddr}) =>
          m('option', {value: revAddr}, `${name}: ${revAddr}`)
        ),
      ),
      account && m('', formatBalance(fromBalance)),

      // Target REV address dropdown
      m(''),
      m('', labelStyle(toAccount), labelDestination),
      m('select', {onchange: onSelectTo},
        wallet.map(({name, revAddr}) =>
          m('option', {value: revAddr}, `${name}: ${revAddr}`)
        ),
      ),
      toAccount && m('', formatBalance(toBalance)),

      // REV amount
      m(''),
      m('', labelStyle(amount), labelAmount),
      m('input[type=number].rev-amount', {
        placeholder: labelAmount, value: amount,
        oninput: valEv('amount'),
      }),
      labelRev(amountPreview, tokenName),

      // Action buttons / result
      m(''),
      m('button', {onclick: deploy, disabled: !canDeploy}, 'Deploy'),
      m('button', {onclick: propose}, 'Propose'),
      m('button', {onclick: clearCache}, 'Clear Cache'),
      status && m('pre', status),
      error && m('b.warning', showNetworkError(error)),
    ]
  )
}
